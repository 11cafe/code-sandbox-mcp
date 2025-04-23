# Runbox Website Publisher MCP

Runbox MCP provides remote coding environment for AI and agents. It can publish your AI-written website code as real world URL domain. Deploy your AI generated code as a real website running in remote server.

Capability:

- Publish static html, js, css files as public website URL to share
- Build website, read/write code in remote code sandbox
- Execute commands safely in remote sandbox to test the code and fix bugs
- Serve code as real website URL to test demo

## Install

```json
{
  "mcpServers": {
    "runbox-website-publisher": {
      "command": "npx",
      "args": ["-y", "code-sandbox-mcp@latest"]
    }
  }
}
```
