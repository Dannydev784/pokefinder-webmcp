# Devpost submission draft — WebMCP Challenge

This is the draft submission text for
[webmcp.devpost.com](https://webmcp.devpost.com), aligned with the
four judging criteria from the rules page:

1. **WebMCP Leverage** — skillful, non-trivial use of the protocol
2. **Execution** — coherent product, polished and reliable
3. **Potential Impact** — real problem for a real audience
4. **Creativity & Ambition** — novel, not "yet another wrapper"

---

## Project name

**pokefinder-webmcp** — a reusable WebMCP toolkit, with a Pokémon TCG
search site ([pokefinder.app](https://pokefinder.app)) as the
production case study.

## Tagline (≤80 chars)

> "Drop-in WebMCP toolkit — JSON-RPC server + browser client in <300 LOC"

---

## Submission text

### Why WebMCP is a strong fit

Pokémon TCG cards are sold across hundreds of small Shopify stores. A
buyer who wants "the cheapest Charizard under £50 in stock in the UK"
today has to either:
- Open each store individually, search, filter, and compare, or
- Use a meta-search site like pokefinder.app that aggregates listings
  but still requires clicking through 6 filters and reading results.

Both paths are slow. Both are designed for human eyes, not for
solving the actual question.

**WebMCP lets the buyer delegate the whole sequence to an agent.**

The user types one sentence into ChatGPT (or asks Claude, or any
WebMCP-aware browser). The agent calls `search_pokemon_cards`,
`compare_prices`, and `analyze_card_image` directly. The user sees a
finished answer in seconds, and the listings are clickable.

The website doesn't change. The user flow changes completely.

### What people and agents can do together that was hard before

- **Compare prices across 100+ stores in one tool call.** Before:
  click, filter, click, filter, eyeball. After: `compare_prices({
  query: "charizard ex", currency: "GBP" })` returns a sorted list
  with original + converted price.
- **Identify a card from a photo.** Before: type a description and
  hope. After: snap a picture of a binder page and call
  `identify_card_image({ image: dataUri })` — the model returns
  `{ set, number, year, search_query }` and the agent can re-search
  immediately.
- **Auth-gated basket operations.** Before: human has to be on the
  site. After: agent adds to basket via `add_to_basket` with a Bearer
  token; user opens the site once to checkout. The first-of-its-kind
  pattern for "agent-side commerce with human-side payment" without
  OAuth-requiring a full merchant integration.

### How we implemented WebMCP

Two halves:

**Server side.** A small Cloudflare Worker exposes `POST /mcp` over
JSON-RPC 2.0. The protocol glue is a ~150-line library
([`src/mcp.js`](../src/mcp.js)) that handles `initialize`,
`tools/list`, `tools/call`, error wrapping, and the `CallToolResult`
shape. Tool definitions + executors are passed in by the caller — so
the library knows nothing about Pokémon, FX rates, or DB bindings.

**Browser side.** A ~120-line client
([`public/mcp-client.js`](../public/mcp-client.js)) wraps
`navigator.modelContext.registerTool` with feature detection and a
small `apiFetch` helper. Same tool definitions are registered both
server-side (for off-page agents like Claude Custom Connectors) and
browser-side (for in-page agents like ChatGPT's in-app browser), so
the same query gets answered the same way.

**The bonus:** because both halves use the same tool definitions,
adding a tool means: write one schema, write one executor, ship. The
same JSON Schema appears in the `tools/list` response and in the
browser-side `registerTool` call.

### Why extract it as a library

When we built this for pokefinder.app, two patterns emerged that were
clearly reusable:

1. The JSON-RPC dispatcher is generic — anyone building a Worker-hosted
   MCP server needs exactly the same `initialize` / `tools/list` /
   `tools/call` boilerplate.
2. The browser-side registration has subtle gotchas around feature
   detection, JSON Schema validation, and same-origin fetch wiring
   that we wanted to wrap once and never think about again.

So this submission is the library extracted from the production app.
PokéFinder-specific code (the 13 Pokémon tools across the MCP and
WebMCP surfaces, the UCP catalog integration, the D1 schema, the
bearer-auth token system, the cart feature, the entire frontend) stays
in a private repo. This public repo is the reusable toolkit.

The case study is live at [pokefinder.app](https://pokefinder.app).
The library is here.

---

## Demo video script (≤3 min)

(0:00) Cold open. Side-by-side: a person typing "charizard under £50"
into pokefinder.app's search bar vs asking ChatGPT the same question.

(0:20) Show ChatGPT calling `search_pokemon_cards` with
`{query, country, max_price}` — one round trip, returns 12 listings
in 800ms.

(0:45) Show ChatGPT calling `compare_prices` to normalise across
currencies — returns the cheapest listing with `original_price` and
`price` side by side.

(1:10) Show image identification. Take a photo of a card (real
binder page or stock image of Charizard Base Set Holo) → upload →
agent calls `identify_card_image` → returns `{ set: "Base Set",
number: "4/102", year: 1999, search_query: "charizard base set" }` →
agent immediately re-runs `search_pokemon_cards` with that.

(1:45) Show the basket flow. Agent calls `add_to_basket` with a
Bearer token → user opens pokefinder.app on their phone → the card
is in the basket → user clicks checkout → done.

(2:15) Show the library side. Open the GitHub repo. Walk through
`src/mcp.js` (~150 lines, protocol glue only). Walk through
`public/mcp-client.js` (~120 lines, browser registration). Run the
echo-mcp example live in another window — `wrangler dev`, `curl
/mcp`, prove the library works standalone.

(2:45) Wrap-up. "Reusable WebMCP toolkit. Production case study at
pokefinder.app. Both in the repo."

---

## Pre-existing vs new work

Per the rules: *"Projects must be either newly created during the
Hackathon Submission Period or, if the Project existed prior to the
Submission Period, must have been meaningfully extended using WebMCP
after the Submission Period start date."*

pokefinder.app existed before the Submission Period (started
2026-08-25). The WebMCP/MCP integration layer is **new** and shipped
during the Submission Period. The commits to this repo are the
extracted, library-ified version of that new work.

What's new (this repo):
- `src/mcp.js` — JSON-RPC 2.0 + MCP server library, **new** (Aug 2026)
- `public/mcp-client.js` — WebMCP browser client, **new** (Aug 2026)
- `examples/echo-mcp/` — minimal demo Worker, **new** (Aug 2026)
- `README.md`, `docs/SUBMISSION.md`, `LICENSE` — **new** (Aug 2026)

What's pre-existing (private repo, referenced via live URL):
- pokefinder.app frontend, search, catalog integration, auth, cart,
  D1 schema, KV cache, seed scripts. Live at
  [pokefinder.app](https://pokefinder.app). Out of scope for this
  submission.

---

## Links

- **Live demo**: https://pokefinder.app
- **Code repository**: https://github.com/dannydev784/pokefinder-webmcp
- **MCP spec**: https://modelcontextprotocol.io/specification/2025-06-18
- **WebMCP spec**: https://webmachinelearning.github.io/webmcp/
- **Cloudflare WebMCP**: https://blog.cloudflare.com/webmcp/
