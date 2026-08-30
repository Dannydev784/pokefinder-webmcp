// public/mcp-client.js — Reusable WebMCP browser client.
//
// Wraps the browser-side WebMCP API (navigator.modelContext.registerTool)
// with feature detection, structured error handling, and a small helper for
// fetching JSON from your own /api/* routes inside tool executors.
//
// Spec: https://webmachinelearning.github.io/webmcp/
// Browser support: Google Chrome 149+ with chrome://flags/#enable-webmcp-testing,
//                  ChatGPT's in-app browser, any other WebMCP-aware client.

/* ───────────────────────── types ───────────────────────── */

/**
 * @typedef {{
 *   name: string,
 *   description: string,
 *   inputSchema: object,
 *   execute?: (args: object, opts?: { signal?: AbortSignal }) => Promise<any>,
 * }} WebMcpToolDef
 */

/* ───────────────────── feature detection ───────────────────── */

/** True if the browser exposes the WebMCP API. */
export function isWebMcpSupported() {
  return typeof navigator !== "undefined"
    && !!navigator.modelContext
    && typeof navigator.modelContext.registerTool === "function";
}

/* ───────────────────── tool registration ───────────────────── */

/**
 * Register a list of tools with the browser's WebMCP runtime.
 * Silently no-ops on browsers without WebMCP support (returns `{active:false}`).
 *
 * @param {WebMcpToolDef[]} tools
 * @returns {{ active: boolean, registered: number, errors: Array<{name:string, error:Error}> }}
 */
export function registerWebMcpTools(tools) {
  if (!isWebMcpSupported()) return { active: false, registered: 0, errors: [] };

  const ctx = navigator.modelContext;
  const errors = [];
  let registered = 0;
  for (const tool of tools) {
    if (!tool || typeof tool.name !== "string") continue;
    try {
      ctx.registerTool(tool);
      registered++;
    } catch (e) {
      errors.push({ name: tool.name, error: e });
      // Surface to console so devs can see it without breaking the page.
      console.warn("[webmcp] registerTool failed for", tool.name, e);
    }
  }
  return { active: true, registered, errors };
}

/**
 * Unregister a list of tools by name. Browsers that support this expose
 * `navigator.modelContext.unregisterTool`; otherwise we just return false.
 *
 * @param {string[]} names
 * @returns {boolean}  true if at least one name was unregistered
 */
export function unregisterWebMcpTools(names) {
  if (!isWebMcpSupported()) return false;
  const ctx = navigator.modelContext;
  if (typeof ctx.unregisterTool !== "function") return false;
  let removed = false;
  for (const name of names) {
    try {
      if (ctx.unregisterTool(name)) removed = true;
    } catch {
      /* ignore */
    }
  }
  return removed;
}

/* ───────────────────── helpers for executors ───────────────────── */

/**
 * Fetch JSON from a same-origin path, sending cookies. The AbortSignal from
 * a tool execution (e.g. when the user cancels) is plumbed straight through.
 *
 * @param {string} path        Same-origin path, e.g. "/api/search"
 * @param {object} [params]    Object of query-string params (falsy values are skipped)
 * @param {{ signal?: AbortSignal, headers?: Record<string,string> }} [opts]
 * @returns {Promise<any>}     Parsed JSON body, or `{ error, status }` on failure
 */
export async function apiFetch(path, params, opts = {}) {
  const url = new URL(path, location.origin);
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }
  const headers = { Accept: "application/json", ...(opts.headers || {}) };
  const init = { credentials: "same-origin", headers };
  if (opts.signal) init.signal = opts.signal;
  let res;
  try {
    res = await fetch(url.toString(), init);
  } catch (e) {
    return { error: `Network error: ${e?.message || e}`, status: 0 };
  }
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    return {
      error: (body && (body.error || body.message)) || `HTTP ${res.status}`,
      status: res.status,
    };
  }
  return body;
}
