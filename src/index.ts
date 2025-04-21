#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createWriteStream } from "fs";

// Override console.log and console.error for debug logging, cannot use process.stdout redirect cuz it breaks mcp stdio transport
const logStream = createWriteStream(
  "/Users/weixuan/git/code-sandbox-mcp/output.log",
  { flags: "a" }
);
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args) => {
  const message = args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
    .join(" ");
  logStream.write(`[LOG] ${new Date().toISOString()}: ${message}\n`);
  originalConsoleLog.apply(console, args);
};

console.error = (...args) => {
  const message = args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
    .join(" ");
  logStream.write(`[ERROR] ${new Date().toISOString()}: ${message}\n`);
  originalConsoleError.apply(console, args);
};

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const apiKey = process.env.API_KEY;
// console.log("API_BASE 4444", API_BASE);

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

server.tool(
  "sandbox_create_sandbox",
  "Create a new python+nodejs code linux sandbox to write code files and run it",
  {},
  async ({}) => {
    const data = await fetchAPI(`/api/tools/create_sandbox`, {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey || "",
      },
    }).then((res) => res.json());

    return {
      content: [
        {
          type: "text",
          text:
            data.text ||
            data.error ||
            "Failed to create sandbox, unknown error",
        },
      ],
    };
  }
);

server.tool(
  "sandbox_expose_port",
  "Expose a port in a code sandbox to the public internet for user testing. It returns a url that can access your local running web server at 0.0.0.0:port in your sandbox",
  {
    port: z
      .number()
      .describe(
        "The port of your ALREADY RUNNING and listening web server at 0.0.0.0:[port] to expose to the public internet for user testing"
      ),
    sandbox_id: z
      .string()
      .describe(
        "The sandbox id of an existing sandbox that is running the web server"
      ),
  },
  async ({ port, sandbox_id }) => {
    if (!port) {
      throw new Error(`Invalid arguments: port is required`);
    }
    if (!sandbox_id?.length) {
      throw new Error(`Invalid arguments: sandbox_id is required`);
    }
    const data = await fetchAPI(`/api/tools/expose_port`, {
      method: "POST",
      body: JSON.stringify({ port, sandbox_id }),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey || "",
      },
    }).then((res) => res.json());

    return {
      content: [
        {
          type: "text",
          text:
            data.text || data.error || "Failed to serve website, unknown error",
        },
      ],
    };
  }
);

server.tool(
  "sandbox_write_file",
  "Create a new file or overwrite an existing file in a python+nodejs code linux sandbox",
  {
    path: z
      .string()
      .describe(
        "The relative path of the file to write to, relative to the linux home directory, (e.g. 'src/main.py' or 'package.json')"
      ),
    content: z.string().describe("The content to write to the file"),
    sandbox_id: z
      .string()
      .describe("The sandbox id of an existing sandbox to write the file to"),
  },
  async ({ path, content, sandbox_id }) => {
    try {
      if (!path?.length) {
        throw new Error(`Invalid arguments: path is required`);
      }
      if (!content?.length) {
        throw new Error(`Invalid arguments: content is required`);
      }
      const response = await fetchAPI(`/api/tools/write_file`, {
        method: "POST",
        body: JSON.stringify({ path, content, sandbox_id }),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey || "",
        },
      });

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text:
              data.text || data.error || "Failed to write file, unknown error",
          },
        ],
      };
    } catch (e) {
      console.error(e);
      return {
        content: [
          {
            type: "text",
            text: `Error writing file: ${e}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "sandbox_read_file",
  "Read the content of a file from an existing python+nodejs code sandbox linux debian VM",
  {
    path: z
      .string()
      .describe(
        "The relative path of the file to read, relative to the linux sandbox home directory"
      ),
    sandbox_id: z
      .string()
      .describe("The sandbox id of an existing sandbox to read from"),
  },
  async ({ path, sandbox_id }) => {
    try {
      const response = await fetchAPI(`/api/tools/read_file`, {
        method: "POST",
        body: JSON.stringify({ path, sandbox_id }),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey || "",
        },
      });
      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text:
              data.text || data.error || "Failed to read file, unknown error",
          },
        ],
      };
    } catch (e) {
      console.error(e);
      return {
        content: [{ type: "text", text: `Error reading file: ${e}` }],
      };
    }
  }
);

server.tool(
  "sandbox_list_directory",
  "List all direct children in a directory in an existing code sandbox, non recursive, linux debian VM",
  {
    path: z
      .string()
      .describe(
        "The relative path of the directory to list, relative to the linux sandbox home directory"
      ),
    sandbox_id: z
      .string()
      .describe(
        "The sandbox id of an existing sandbox to list the directory from"
      ),
  },
  async ({ path, sandbox_id }) => {
    try {
      const response = await fetchAPI(`/api/tools/list_directory`, {
        method: "POST",
        body: JSON.stringify({ path, sandbox_id }),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey || "",
        },
      });
      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: data.text || data.error || "Failed to list directory",
          },
        ],
      };
    } catch (e) {
      console.error(e);
      return {
        content: [{ type: "text", text: `Error listing directory: ${e}` }],
      };
    }
  }
);

server.tool(
  "sandbox_execute_command",
  "Execute a command in an existing nodejs+python code sandbox in a Linux debian VM",
  {
    command: z.string().describe("The command to execute"),
    sandbox_id: z
      .string()
      .describe(
        "The sandbox id of an existing sandbox to execute the command in"
      ),
  },
  async ({ command, sandbox_id }) => {
    try {
      const response = await fetchAPI(`/api/tools/execute_command`, {
        method: "POST",
        body: JSON.stringify({ command, sandbox_id }),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey || "",
        },
      });
      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: data.text || data.error || "Failed to execute command",
          },
        ],
      };
    } catch (e) {
      console.error(e);
      return {
        content: [{ type: "text", text: `Error executing command: ${e}` }],
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Code Sandbox MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
