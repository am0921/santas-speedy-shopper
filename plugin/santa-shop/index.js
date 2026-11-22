import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { STORES } from "./stores.js";
import { formatProducts, parseItem, searchStore } from "./search.js";

const storeList = Object.entries(STORES)
  .map(([id, s]) => `${id} (${s.sells})`)
  .join("; ");

const text = (t, details) => ({ content: [{ type: "text", text: t }], details });

async function lookup(store, q, limit) {
  // One retry on a transient storefront error; failures are reported, never papered over.
  for (let attempt = 0; ; attempt++) {
    try {
      const products = await searchStore(store, q, limit);
      return { products, line: products.length ? formatProducts(products) : `- nothing found for "${q}" at ${store}` };
    } catch (err) {
      if (attempt === 0 && !/unknown store/.test(err.message)) continue;
      return { products: [], line: `- search failed for ${store}: ${err.message}` };
    }
  }
}

export default definePluginEntry({
  id: "santa-shop",
  name: "Santa Shop",
  description: "Live product search across real retail storefronts",
  register(api) {
    // Three shapes of the same live search. Which one an agent sees is decided by tools.allow.

    // 1. One store per call, up to three candidates to choose from.
    api.registerTool({
      name: "shop",
      description: `Search one real online store live. Returns up to three in-stock products, one per line: "- title price URL". Stores: ${storeList}.`,
      parameters: {
        type: "object",
        properties: {
          store: { type: "string", enum: Object.keys(STORES), description: "Store id" },
          q: { type: "string", description: "Search word, e.g. robe" },
        },
        required: ["store", "q"],
        additionalProperties: false,
      },
      async execute(_id, params) {
        const r = await lookup(params.store, params.q, 3);
        return text(r.line, { products: r.products });
      },
    });

    // 2. One store per call, top in-stock hit only.
    api.registerTool({
      name: "gift",
      description: `Find one gift at a real online store, live. Returns the top in-stock product as one line: "- title price URL". Stores: ${storeList}.`,
      parameters: {
        type: "object",
        properties: {
          store: { type: "string", enum: Object.keys(STORES), description: "Store id" },
          q: { type: "string", description: "Search word, e.g. robe" },
        },
        required: ["store", "q"],
        additionalProperties: false,
      },
      async execute(_id, params) {
        const r = await lookup(params.store, params.q, 1);
        return text(r.line, { products: r.products });
      },
    });

    // 3. Several stores in one call (searched concurrently), top in-stock hit each.
    api.registerTool({
      name: "gifts",
      description: `Find gifts at real online stores, live. \`list\` is comma-separated "store word" items, e.g. "brooklinen robe, deathwish mug". Returns the top in-stock product per item, one line each: "- title price URL". Stores: ${storeList}.`,
      parameters: {
        type: "object",
        properties: {
          list: { type: "string", description: 'e.g. "brooklinen robe, deathwish mug"' },
        },
        required: ["list"],
        additionalProperties: false,
      },
      async execute(_id, params) {
        const items = String(params.list ?? "")
          .split(/[,;\n]+/)
          .map((item) => item.replace(/^\s*(and\s+)?/i, "").replace(/[.\s]+$/, ""))
          .filter(Boolean)
          .slice(0, 10);
        const results = await Promise.all(items.map((item) => lookup(...parseItem(item), 1)));
        return text(results.map((r) => r.line).join("\n"), { products: results.flatMap((r) => r.products) });
      },
    });
  },
});
