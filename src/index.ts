#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.API_BASE || "http://localhost:3000";
console.log("API_BASE", API_BASE);

// Helper function for making API requests
function fetchAPI<T>(url: string, options?: RequestInit) {
  if (!url.startsWith("/")) {
    url = `/${url}`;
  }
  return fetch(`${API_BASE}${url}`, options);
}

interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}

// Create server instance
const server = new McpServer({
  name: "mcp-code-sandbox",
  version: "0.0.2",
});

server.tool(
  "sandbox_write_file",
  "Create a new file or overwrite an existing file in a python+nodejs code linux sandbox, auto create new sandbox if sandbox_id is undefined",
  {
    path: z
      .string()
      .describe(
        "The relative path of the file to write to, relative to the linux home directory, (e.g. 'src/main.py' or 'package.json')"
      ),
    content: z.string().describe("The content to write to the file"),
    sandbox_id: z
      .string()
      .optional()
      .describe(
        "The sandbox id of an existing sandbox to write the file to, will create new if undefined"
      ),
  },
  async ({ path, content, sandbox_id }) => {
    if (!path?.length) {
      throw new Error(`Invalid arguments: path is required`);
    }
    if (!content?.length) {
      throw new Error(`Invalid arguments: content is required`);
    }
    const response = await fetchAPI(`/api/tools/write_file`, {
      method: "POST",
      body: JSON.stringify({ path, content, sandbox_id }),
    });
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: data.text,
        },
      ],
    };
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
    const response = await fetchAPI(`/api/tools/read_file`, {
      method: "POST",
      body: JSON.stringify({ path, sandbox_id }),
    });
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: data.text,
        },
      ],
    };
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
    const response = await fetchAPI(`/api/tools/list_directory`, {
      method: "POST",
      body: JSON.stringify({ path, sandbox_id }),
    });
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: data.text,
        },
      ],
    };
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
    const response = await fetchAPI(`/api/tools/execute_command`, {
      method: "POST",
      body: JSON.stringify({ command, sandbox_id }),
    });
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: data.text,
        },
      ],
    };
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
