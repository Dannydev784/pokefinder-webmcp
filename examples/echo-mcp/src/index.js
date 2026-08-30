// examples/echo-mcp/src/index.js
//
// Minimal Cloudflare Worker that exposes a 2-tool MCP server using the
// reusable library in ../../src/mcp.js. Run with:
//
//   cd examples/echo-mcp
//   npm install
//   npm run dev      # http://localhost:8787/mcp
//
// Try in another terminal:
//
//   curl -sS -X POST http://localhost:8787/mcp \
//     -H "Content-Type: application/json" \
//     -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | jq
//
//   curl -sS -X POST http://localhost:8787/mcp \
//     -H "Content-Type: application/json" \
//     -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq
//
//   curl -sS -X POST http://localhost:8787/mcp \
//     -H "Content-Type: application/json" \
//     -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
//          "params":{"name":"echo","arguments":{"message":"hi"}}}' | jq

import { handleMcp, okResult } from "../../src/mcp.js";

/* ─────────────────────── tool definitions ─────────────────────── */

const TOOLS = [
  {
    name: "echo",
    description:
      "Echo a message back. Useful for verifying the MCP connection is alive " +
      "and the JSON-RPC dispatcher is wired correctly.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message to echo back. Required." },
      },
      required: ["message"],
    },
  },
  {
    name: "current_time",
    description:
      "Return the current server time as ISO-8601. No inputs. Demonstrates " +
      "an input-less tool that just returns a payload.",
    inputSchema: { type: "object", properties: {} },
  },
];

/* ───────────────────────── executors ───────────────────────── */

const EXECUTORS = {
  echo: async (args) => {
    if (!args.message) {
      return { content: [{ type: "text", text: "Missing required argument: message" }], isError: true };
    }
    return okResult({ echoed: String(args.message), received_at: new Date().toISOString() });
  },

  current_time: async () => {
    return okResult({ now: new Date().toISOString(), tz: "UTC" });
  },
};

/* ──────────────────────── Worker entry ───────────────────────── */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/mcp") {
      return handleMcp(request, {
        env,
        tools: TOOLS,
        executors: EXECUTORS,
        serverInfo: { name: "echo-mcp", version: "0.1.0" },
      });
    }

    if (url.pathname === "/") {
      return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    return new Response("Not found", { status: 404 });
  },
};

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>echo-mcp — example</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; }
  pre { background: #f3f4f6; padding: 12px 14px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
  h1 { letter-spacing: -0.02em; }
  .pill { display: inline-block; font-size: 11px; padding: 3px 8px; border-radius: 999px; background: #f3f4f6; margin-right: 4px; }
</style>
</head>
<body>
  <h1>echo-mcp <span class="pill">example</span></h1>
  <p>This Worker exposes a 2-tool MCP server at <code>/mcp</code>. Browser-side
  WebMCP registration (via <code>navigator.modelContext.registerTool</code>) is
  loaded from <code>/mcp-client.js</code> if your browser supports it.</p>

  <h2>Try it from curl</h2>
<pre>curl -sS -X POST http://localhost:8787/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'</pre>

  <h2>WebMCP status</h2>
  <p id="status">Detecting…</p>

  <script type="module">
    import { isWebMcpSupported, registerWebMcpTools, apiFetch } from "/mcp-client.js";

    const status = document.getElementById("status");
    if (!isWebMcpSupported()) {
      status.textContent =
        "Your browser doesn't expose navigator.modelContext. " +
        "Try Google Chrome 149+ with chrome://flags/#enable-webmcp-testing, " +
        "or the ChatGPT desktop browser.";
    } else {
      const result = registerWebMcpTools([
        {
          name: "echo",
          description: "Echo a message back to the agent.",
          inputSchema: {
            type: "object",
            properties: { message: { type: "string", description: "Message to echo." } },
            required: ["message"],
          },
          execute: async (args) => apiFetch("/api/echo", { message: args.message }),
        },
      ]);
      status.textContent =
        "Active. Registered " + result.registered + " tool(s). Open ChatGPT or " +
        "Chrome and ask your assistant to 'call echo with message=hi'.";
    }
  </script>
</body>
</html>`;
