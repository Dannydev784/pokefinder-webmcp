# pokefinder-webmcp

> A reusable **WebMCP toolkit** for Cloudflare Workers — JSON-RPC 2.0
> MCP server library + browser-side `navigator.modelContext.registerTool`
> helper, with a minimal example Worker.
>
> Submission to the **[OpenAI WebMCP Challenge](https://webmcp.devpost.com/)**.

[![License](https://img.shields.io/badge/license-Apache_2.0-blue)](LICENSE)
[![MCP](https://img.shields.io/badge/protocol-MCP_2025--06--18-green)](https://modelcontextprotocol.io)
[![WebMCP](https://img.shields.io/badge/webmcp-spec-f38020)](https://webmachinelearning.github.io/webmcp/)
[![Cloudflare](https://img.shields.io/badge/cloudflare-Workers-f38020)](https://workers.cloudflare.com/)

This repository contains the **WebMCP integration layer** extracted
from [pokefinder.app](https://pokefinder.app) — the reusable parts
only. The Pokémon-specific tool definitions, search handlers, database
schema, and frontend live in a private repo and are not part of this
public submission.

---

## What you get

| Path | What it is |
|---|---|
| [`src/mcp.js`](src/mcp.js) | Server-side library. Exports `handleMcp(request, options)` and `okResult` / `errorResult` / `resToToolResult` helpers. Handles JSON-RPC 2.0 dispatch, `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, `ping`, and the `CallToolResult` shape. |
| [`public/mcp-client.js`](public/mcp-client.js) | Browser-side library. Exports `isWebMcpSupported()`, `registerWebMcpTools()`, `unregisterWebMcpTools()`, and `apiFetch()`. Feature-detects `navigator.modelContext` and registers tools cleanly. |
| [`examples/echo-mcp/`](examples/echo-mcp/) | A self-contained Cloudflare Worker (≤200 lines) that exposes a 2-tool MCP server using both libraries. Runnable in ~30 seconds with `npm install && npm run dev`. |

Drop these into any Cloudflare Worker and you've got an MCP server
running at `/mcp`, plus a small browser script that registers tools with
the WebMCP runtime — Chrome, ChatGPT's in-app browser, or any other
WebMCP-aware client.

---

## Why this exists

When we built the MCP server for [pokefinder.app](https://pokefinder.app),
two patterns emerged that we wanted to reuse:

1. **Server-side**, the JSON-RPC 2.0 dispatcher is mostly boilerplate —
   initialize, tools/list, tools/call, error wrapping. None of it cares
   about your domain. The interesting parts (your tools, your handlers,
   your data) plug in from the outside.

2. **Browser-side**, registering tools via `navigator.modelContext.registerTool`
   has a few gotchas around feature detection, JSON Schema validation,
   and same-origin fetch wiring that we wanted to wrap once.

This repo extracts both into drop-in libraries. The Pokémon-specific
code stays private. Anyone building a Cloudflare-Worker-hosted WebMCP
app can lift these files directly.

---

## Usage

### Server: 5-line integration

```js
// src/index.js — your Cloudflare Worker
import { handleMcp, okResult } from "pokefinder-webmcp/server";

const TOOLS = [{
  name: "echo",
  description: "Echo a message back.",
  inputSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  },
}];

const EXECUTORS = {
  echo: async (args) => okResult({ echoed: args.message }),
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      return handleMcp(request, {
        env,
        tools: TOOLS,
        executors: EXECUTORS,
        serverInfo: { name: "my-app", version: "1.0.0" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
};
```

That's it. Run `wrangler dev` and `POST /mcp` with any JSON-RPC 2.0
request — `initialize`, `tools/list`, `tools/call`, etc.

### Browser: 4-line integration

```html
<script type="module">
  import { isWebMcpSupported, registerWebMcpTools, apiFetch } from "pokefinder-webmcp/client";

  if (isWebMcpSupported()) {
    registerWebMcpTools([{
      name: "echo",
      description: "Echo a message back.",
      inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
      execute: (args) => apiFetch("/api/echo", { message: args.message }),
    }]);
  }
</script>
```

When a WebMCP-aware client (Chrome 149+ with `chrome://flags/#enable-webmcp-testing`,
ChatGPT's in-app browser, or any compliant extension) opens your page,
it'll discover the registered tools automatically. No plugin, no SDK, no
custom install.

### Run the example

```bash
cd examples/echo-mcp
npm install
npm run dev
# → http://localhost:8787
```

Test it:

```bash
curl -sS -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq

curl -sS -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"echo","arguments":{"message":"hi"}}}' | jq
```

---

## Case study: production usage on pokefinder.app

[pokefinder.app](https://pokefinder.app) is a search tool that lets
people find Pokémon TCG cards across multiple Shopify stores in one
place. The deployed system registers tools through two surfaces:

- **MCP server — 11 tools** for external agents (Claude Custom
  Connectors, custom MCP clients):

  - 5 catalog tools (`search_pokemon_cards`, `browse_card_database`,
    `get_card_details`, `list_sets`, `find_cards_in_set`)
  - 4 commerce tools (`compare_prices`, `get_featured_cards`,
    `analyze_card_image`, `identify_card_image`)
  - 1 basket tool (`add_to_basket`, Bearer-authenticated via
    `/api/auth/agent-tokens`)
  - 1 metadata tool (`get_filter_taxonomy`)

- **WebMCP client — 13 tools** for in-browser agents (Chrome 149+
  with WebMCP, ChatGPT's in-app browser, future Claude / Cursor /
  Comet integrations):

  - the same 10 data tools (the MCP set minus the Bearer-authenticated
    basket, which is replaced by a session-cookie version)
  - 3 page-action tools that drive the live page directly and only
    make sense in the browser: `add_to_basket` (session-authenticated),
    `apply_filter`, `highlight_card`

The two page-action tools — `apply_filter` and `highlight_card` — are
what WebMCP adds that MCP alone can't deliver: MCP returns data, WebMCP
lets the agent drive what the user sees.

The pattern that makes this work:

```
┌───────────────────────────────────────────────────────┐
│  Browser (Chrome 149+ / ChatGPT)                      │
│  ┌────────────────────────────────────────────────┐   │
│  │ mcp-client.js                                  │   │
│  │   registerWebMcpTools([                        │   │
│  │     { name, description, inputSchema,          │   │
│  │       execute: (args) => apiFetch(...) }       │   │
│  │   ])                                           │   │
│  └────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────┘
                         ↓ (tool call)
┌───────────────────────────────────────────────────────┐
│  Cloudflare Worker (pokefinder.app /mcp)              │
│  ┌────────────────────────────────────────────────┐   │
│  │ handleMcp(request, { tools, executors })       │   │
│  │   └─ executors[name](args, ctx)                │   │
│  │        ├─→ ctx.env.AI.run(...)                 │   │
│  │        ├─→ ctx.env.DB.prepare(...).run()       │   │
│  │        ├─→ fetch("https://catalog.ucp...")     │   │
│  │        └─→ resToToolResult(res)               │   │
│  └────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────┘
```

The library owns the protocol. The app owns the tools.

---

## What's in this repo

```
pokefinder-webmcp/
├── LICENSE                          ← Apache 2.0
├── README.md                        ← this file
├── package.json                     ← library manifest, exports server + client
├── .gitignore
├── src/
│   └── mcp.js                       ← server-side library (~150 lines)
├── public/
│   └── mcp-client.js                ← browser-side library (~120 lines)
├── examples/
│   └── echo-mcp/
│       ├── package.json
│       ├── wrangler.toml
│       └── src/index.js             ← runnable demo, <200 lines
└── docs/
    └── SUBMISSION.md                ← Devpost submission draft
```

## What's NOT in this repo

The Pokémon-specific tool definitions, the UCP catalog integration,
the D1 schema, the bearer-auth token system, the cart feature, and the
frontend all live in a separate private repo. They're deployed and
live at [pokefinder.app](https://pokefinder.app) — that's the canonical
demo. This repo is the library extracted from that work.

---

## License

Apache 2.0 — see [LICENSE](LICENSE).

Built by [dannydev784](https://github.com/dannydev784) for the OpenAI
WebMCP Challenge (Aug 25 – Sep 3, 2026).
