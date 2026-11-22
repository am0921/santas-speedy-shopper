import { STORES } from "./stores.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** Live storefront search. Returns [{title, price, url, store}] straight from the retailer. */
export async function searchStore(storeId, query, limit = 3, signal) {
  const store = STORES[storeId];
  if (!store) throw new Error(`unknown store "${storeId}". Known: ${Object.keys(STORES).join(", ")}`);
  const u = new URL(`https://${store.domain}/search/suggest.json`);
  u.searchParams.set("q", query);
  u.searchParams.set("resources[type]", "product");
  // Ask for a few more than needed: gift cards and sold-out items are dropped below.
  u.searchParams.set("resources[limit]", String(Math.max(1, Math.min(10, limit + 3))));
  const res = await fetch(u, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: signal ?? AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${store.domain} answered HTTP ${res.status}`);
  const json = await res.json();
  const products = json?.resources?.results?.products ?? [];
  return products
    .filter((p) => p.available !== false && !/gift\s*card/i.test(p.title ?? ""))
    .slice(0, limit)
    .map((p) => ({
      // Storefront titles sometimes carry "|" or trademark glyphs; keep them readable on one line.
      title: String(p.title ?? "").replace(/\s*\|\s*/g, ", ").replace(/\s+/g, " ").trim(),
      price: priceLabel(p),
      // The retailer returns a relative product path plus search-tracking params; the
      // canonical product page is the same path on the storefront domain.
      url: new URL(String(p.url).split("?")[0], `https://${store.domain}`).href,
      store: store.domain,
    }));
}

/**
 * Price as the storefront lists it. A product whose variants differ in price is
 * shown as a range (e.g. "$2.40-$8.00") so the line matches what the product page shows.
 */
function priceLabel(p) {
  const min = p.price_min ?? p.price;
  const max = p.price_max ?? p.price;
  if (!min) return "";
  return max && Number(max) > Number(min) ? `$${min}-$${max}` : `$${min}`;
}

/** One product per line, ready to show to a person: "- title, price, url". */
export function formatProducts(products) {
  return products.map((p) => `- ${p.title} ${p.price} ${p.url}`).join("\n");
}

/** Parses "store word(s)" (e.g. "brooklinen robe") into [storeId, query]. */
export function parseItem(item) {
  const [store, ...rest] = String(item).trim().split(/\s+/);
  return [store.toLowerCase(), rest.join(" ") || "gift"];
}
