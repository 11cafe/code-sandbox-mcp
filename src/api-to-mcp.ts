#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createWriteStream } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { OpenAPIV3 } from "openapi-types";

// Override console.log and console.error for debug logging, cannot use process.stdout redirect cuz it breaks mcp stdio transport
// const logStream = createWriteStream(
//   "/Users/weixuan/git/code-sandbox-mcp/output.log",
//   { flags: "a" }
// );
// const originalConsoleLog = console.log;
// const originalConsoleError = console.error;

// console.log = (...args) => {
//   const message = args
//     .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
//     .join(" ");
//   logStream.write(`[LOG] ${new Date().toISOString()}: ${message}\n`);
//   originalConsoleLog.apply(console, args);
// };

// console.error = (...args) => {
//   const message = args
//     .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
//     .join(" ");
//   logStream.write(`[ERROR] ${new Date().toISOString()}: ${message}\n`);
//   originalConsoleError.apply(console, args);
// };

const API_BASE = process.env.API_BASE || "https://runbox.ai";
const apiKey = process.env.API_KEY;
const execPromise = promisify(exec);

// Helper function for making API requests
function fetchAPI<T>(url: string, options?: RequestInit) {
  if (!url.startsWith("/")) {
    url = `/${url}`;
  }
  return fetch(`${API_BASE}${url}`, options);
}

// Create server instance
const server = new McpServer({
  name: "mcp-code-sandbox",
  version: "0.0.2",
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  const args = process.argv.slice(2);
  const apiJsonUrl = args
    .find((arg) => arg.startsWith("--json-url="))
    ?.split("=")[1];
  if (!apiJsonUrl) {
    throw new Error("api-to-mcp requires --json-url=<url>");
  }
  const apiJson = (await fetch(apiJsonUrl).then((res) =>
    res.json()
  )) as OpenAPIV3.Document;
  console.log("apiJson", apiJson);
  const baseURL = apiJson.servers?.[0]?.url;
  if (!baseURL) {
    throw new Error(
      "api-to-mcp requires openapi schema json, no servers[0].url found in the json"
    );
  }
  if (!apiJson.paths || typeof apiJson.paths !== "object") {
    throw new Error(
      "api-to-mcp requires openapi schema json, no api paths found in the json"
    );
  }
  for (const route in apiJson.paths) {
    const pathItem = apiJson.paths[route];
    for (const method in pathItem) {
      const methodItem = pathItem[
        method as OpenAPIV3.HttpMethods
      ] as OpenAPIV3.OperationObject & { x_mcp_tool?: string };

      const toolName = methodItem["x_mcp_tool"] || methodItem.summary || route;
      const description = methodItem.description || methodItem.summary;
      if (!description) {
        throw new Error(
          `api-to-mcp requires tool description, no summary or description found in the json for ${route} ${method}`
        );
      }
      const inputSchema: Record<string, z.ZodType> = {};
      if (methodItem.parameters) {
        for (const param of methodItem.parameters) {
          if (!("name" in param)) {
            continue;
          }
          const paramSchema = param.schema as OpenAPIV3.SchemaObject;
          let paramType: z.ZodType;
          switch (paramSchema.type) {
            case "string":
              paramType = z.string();
              break;
            case "number":
              paramType = z.number();
              break;
            case "integer":
              paramType = z.number().int();
              break;
            case "boolean":
              paramType = z.boolean();
              break;
            case "array":
              paramType = z.array(z.any());
              break;
            case "object":
              paramType = z.object({});
              break;
            default:
              paramType = z.string();
          }
          if (paramSchema.description) {
            paramType = paramType.describe(paramSchema.description);
          }
          if (!param.required) {
            paramType = paramType.optional();
          }
          inputSchema[param.name] = paramType;
        }
      }
      if (methodItem.requestBody) {
        const requestBody =
          methodItem.requestBody as OpenAPIV3.RequestBodyObject;
        if (
          requestBody.content &&
          requestBody.content["application/json"] &&
          requestBody.content["application/json"].schema &&
          // @ts-ignore
          requestBody.content["application/json"].schema.properties
        ) {
          const schema = requestBody.content["application/json"]
            .schema as OpenAPIV3.SchemaObject;
          const properties = schema.properties as Record<
            string,
            OpenAPIV3.SchemaObject
          >;
          let zodType: z.ZodType;
          for (const property in properties) {
            const propertySchema = properties[property];
            switch (propertySchema.type) {
              case "string":
                zodType = z.string();
                break;
              case "number":
                zodType = z.number();
                break;
              case "integer":
                zodType = z.number().int();
                break;
              case "boolean":
                zodType = z.boolean();
                break;
              case "array":
                zodType = z.array(z.any());
                break;
              default:
                zodType = z.string();
            }
            if (propertySchema.description) {
              zodType = zodType.describe(propertySchema.description);
            }
            if (!schema.required || !schema.required.includes(property)) {
              zodType = zodType.optional();
            }
            inputSchema[property] = zodType;
          }
        }
      }

      server.tool(toolName, description, inputSchema, async (args) => {
        let url = `${baseURL}${route}`;
        const fetchOptions: RequestInit = {
          method: method,
        };

        if (method.toLowerCase() === "get" && Object.keys(args).length > 0) {
          // For GET requests, append parameters to URL
          const queryParams = new URLSearchParams();
          for (const [key, value] of Object.entries(args)) {
            queryParams.append(key, String(value));
          }
          url += `?${queryParams.toString()}`;
        } else if (method.toLowerCase() !== "get") {
          // For non-GET requests, include body
          fetchOptions.headers = {
            "Content-Type": "application/json",
          };
          fetchOptions.body = JSON.stringify(args);
        }

        const response = await fetch(url, fetchOptions);
        let data;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          data = await response.json();
        } else {
          // Handle non-JSON responses (text, etc)
          data = await response.text();
          return {
            content: [{ type: "text", text: data }],
          };
        }
        // is image reponse
        if (
          Array.isArray(data) &&
          data.length > 0 &&
          typeof data[0] === "object" &&
          data[0]?.type === "image" &&
          data[0]?.data
        ) {
          return {
            content: data,
          };
        }
        // is text reponse
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      });
    }
  }
  await server.connect(transport);
  console.error("Code Sandbox MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
