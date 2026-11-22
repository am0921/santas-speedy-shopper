// Real retail storefronts that expose a public predictive-search endpoint
// (GET /search/suggest.json). Only the storefront list lives here: every product,
// price and link is fetched live at call time.
export const STORES = {
  stanley: { domain: "www.stanley1913.com", sells: "tumblers, drinkware" },
  brooklinen: { domain: "www.brooklinen.com", sells: "robes, bedding, towels" },
  allbirds: { domain: "www.allbirds.com", sells: "wool shoes, slippers" },
  deathwish: { domain: "www.deathwishcoffee.com", sells: "coffee, mugs" },
  leatherman: { domain: "www.leatherman.com", sells: "multitools, knives" },
  ugmonk: { domain: "ugmonk.com", sells: "desk organizers" },
  puravida: { domain: "www.puravidabracelets.com", sells: "bracelets, jewelry" },
  colourpop: { domain: "colourpop.com", sells: "makeup" },
  taylorstitch: { domain: "www.taylorstitch.com", sells: "menswear" },
  kylie: { domain: "kyliecosmetics.com", sells: "cosmetics" },
};
