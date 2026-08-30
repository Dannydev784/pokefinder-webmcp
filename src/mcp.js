// src/mcp.js — Reusable MCP server library for Cloudflare Workers.
//
// This file contains ONLY the protocol glue (JSON-RPC 2.0 dispatch,
// CallToolResult shaping, error handling). Tool definitions and
// executors are passed in by the caller — see ../examples/echo-mcp/.
//
// Spec: https://modelcontextprotocol.io/specification/2025-06-18
// Tested with: Claude (Custom Connectors), ChatGPT (Developer Mode),
//              Google Chrome 149+ with WebMCP testing enabled,
//              Cloudflare WebMCP bridge.

/* ─────────────────────────── types ─────────────────────────── */

/**
 * @typedef {{
 *   name: string,
 *   description: string,
 *   inputSchema: object,
 * }} ToolDef
 *
 * @typedef {{
 *   active?: boolean,                   // whether the library is initialised
 *   request?: Request,                  // originating HTTP request (for Bearer auth etc.)
 *   env?: Record<string, any>,          // Worker bindings (DB, KV, AI, secrets)
 *   [k: string]: any,                   // arbitrary context the caller wants exposed
 * }} Ctx
 *
 * @typedef {{
 *   content: Array<{ type: "text", text: string }>,
 *   structuredContent?: object,
 *   isError?: boolean,
 * }} CallToolResult
 */

/* ──────────────────────── result shaping ──────────────────────── */

/**
 * Build a successful MCP CallToolResult.
 * `structured` is both returned as JSON in `structuredContent` and pretty-printed
 * into `content[0].text` so agents that ignore `structuredContent` still see the
 * payload.
 */
export function okResult(structured) {
  return {
    content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

/** Build a failed MCP CallToolResult. */
export function errorResult(message) {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { error: message },
    isError: true,
  };
}

/** Parse a Worker `Response` (typically from an internal API handler) into a
 *  CallToolResult, or an errorResult if the response is 4xx/5xx. */
export async function resToToolResult(res, kind = "request") {
  const status = res.status;
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (status >= 400 || (data && (data.error || data.detail))) {
    const msg = (data && (data.error || data.detail)) || `HTTP ${status}`;
    return errorResult(`${kind} failed: ${msg}`);
  }
  return okResult(data);
}

/* ──────────────────────── JSON-RPC 2.0 ───────────────────────── */

/**
 * Main entry point. Wire this into your Worker router:
 *
 *   if (url.pathname === "/mcp") {
 *     return handleMcp(request, { env, tools: MY_TOOLS, executors: MY_EXECUTORS });
 *   }
 *
 * @param {Request} request  Incoming HTTP request. Must be POST with a
 *                           JSON-RPC 2.0 body, or GET for liveness.
 * @param {{
 *   env?: Record<string, any>,
 *   tools: ToolDef[],
 *   executors: Record<string, (args: object, ctx: Ctx) => Promise<CallToolResult>>,
 *   serverInfo?: { name: string, version: string },
 *   protocolVersion?: string,
 * }} options
 * @returns {Promise<Response>}
 */
export async function handleMcp(request, options) {
  const {
    env,
    tools,
    executors,
    serverInfo = { name: "webmcp-server", version: "0.1.0" },
    protocolVersion = "2025-06-18",
  } = options || {};

  if (!Array.isArray(tools)) {
    return Response.json(jsonRpcError(null, -32603, "Server misconfigured: `tools` must be an array"), { status: 500 });
  }
  if (!executors || typeof executors !== "object") {
    return Response.json(jsonRpcError(null, -32603, "Server misconfigured: `executors` must be an object"), { status: 500 });
  }

  // Allow GET for liveness checks.
  if (request.method === "GET") {
    return Response.json({
      server: serverInfo.name,
      version: serverInfo.version,
      tool_count: tools.length,
      tools: tools.map((t) => t.name),
      protocol: "MCP over JSON-RPC 2.0",
    });
  }

  if (request.method !== "POST") {
    return Response.json(
      jsonRpcError(null, -32601, "Method not allowed; use POST"),
      { status: 405 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      jsonRpcError(null, -32700, "Parse error: invalid JSON"),
      { status: 400 }
    );
  }

  // Notifications (no id) — ack silently with 204.
  if (body.id === undefined || body.id === null) {
    return new Response(null, { status: 204 });
  }

  const id = body.id;
  const ctx = { env, request };
  try {
    const result = await dispatchRpc(body, ctx, { tools, executors, serverInfo, protocolVersion });
    return Response.json({ jsonrpc: "2.0", id, result });
  } catch (e) {
    return Response.json(
      jsonRpcError(id, -32603, `Internal error: ${e?.message || e}`),
      { status: 500 }
    );
  }
}

async function dispatchRpc(req, ctx, opts) {
  switch (req.method) {
    case "initialize":
      return {
        protocolVersion: opts.protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: opts.serverInfo,
      };

    case "notifications/initialized":
      // Client ack — nothing to do.
      return {};

    case "tools/list":
      return { tools: opts.tools };

    case "tools/call": {
      const name = req?.params?.name;
      const args = req?.params?.arguments ?? {};
      const fn = opts.executors[name];
      if (!fn) {
        throw new Error(`Unknown tool: ${name}`);
      }
      return await fn(args, ctx);
    }

    case "ping":
      return {};

    default:
      throw new Error(`Method not found: ${req.method}`);
  }
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
