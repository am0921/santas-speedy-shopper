// Smoke test for the plugin's live storefront search (no model involved).
// Usage: node bench/try-search.mjs fellow:kettle brooklinen:robe
import { formatProducts, searchStore } from "../plugin/santa-shop/search.js";

for (const pair of process.argv.slice(2)) {
  const [store, q] = pair.split(":");
  const t = performance.now();
  try {
    const products = await searchStore(store, q, 3);
    console.log(`# ${store} "${q}" ${Math.round(performance.now() - t)}ms`);
    console.log(formatProducts(products) || "(none)");
  } catch (e) {
    console.log(`# ${store} "${q}" ERROR ${e.message}`);
  }
}
