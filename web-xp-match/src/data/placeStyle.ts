import type { Place, StyleDials } from "@/lib/types";

/**
 * Hand-tagged scoring data per place:
 * - interest levels: how strongly the place delivers each interest (0–1). A churrascaria is nearly
 *   pure "steak"; a food market hits several interests at once.
 * - dials: where the place sits on the five style dials
 *   [no-frills↔refined, intimate↔buzzing, iconic↔hidden local, thrifty↔splurge, old-school↔modern].
 */
const RAW: Record<string, [string, [number, number, number, number, number]]> = {
  avillez: ["portuguese .85, chef-driven .9, meat .75, steak .55, intimate .85", [85, 35, 45, 78, 70]],
  taberna: ["portuguese .9, local-favorite .9, small-plates .85, cozy .9, hidden-gem .8, seafood .4", [45, 55, 80, 45, 40]],
  talho: ["steak .95, dry-aged .95, meat .95, chef-driven .7", [75, 45, 60, 78, 75]],
  salacorte: ["steak .98, dry-aged .9, meat .9, iconic .7", [70, 70, 25, 80, 65]],
  cafesaobento: ["steak .9, meat .85, cozy .85, local-favorite .8", [40, 45, 70, 45, 10]],
  timeout: ["food-hall .95, social .9, market .8, street-food .8, steak .35, seafood .4", [30, 95, 10, 40, 70]],
  pasteis: ["pastry .98, iconic .95, breakfast .8", [25, 85, 5, 10, 5]],
  ramiro: ["seafood .98, local-favorite .7, social .85, iconic .8", [30, 90, 30, 50, 15]],
  belcanto: ["chef-driven .98, portuguese .7, design .7, wine .6", [98, 30, 25, 98, 85]],
  fabrica: ["breakfast .9, slow .85, cozy .75", [35, 40, 60, 15, 80]],
  miradouro: ["viewpoint .95, sunset .9, photography .8", [20, 70, 25, 5, 30]],
  senhoramonte: ["hidden-viewpoint .95, viewpoint .9, sunset .9, photography .85, hidden-gem .75", [20, 35, 75, 5, 30]],
  gulbenkian: ["museum .95, art .95, garden .85, design .8, slow .7", [80, 25, 40, 15, 60]],
  sintra: ["day-trip .95, palace .95, adventure .75, active .7, history .9", [55, 55, 20, 45, 20]],
  fado: ["fado .98, live-music .95, local-favorite .85, nightlife .55", [35, 55, 85, 45, 5]],
  tram28: ["tram .98, scenic-route .85, history .7, city-walks .5", [15, 75, 10, 10, 5]],
  lxfactory: ["design .85, market .7, social .8, art .75", [45, 80, 45, 35, 90]],
  surf: ["adventure .9, active .95, social .7", [20, 70, 45, 40, 70]],
  alfamawalk: ["history .95, city-walks .9, hidden-gem .7", [60, 30, 80, 40, 20]],
  estrela: ["garden .95, slow .9, quiet .9", [30, 15, 60, 5, 25]],
  oceanario: ["iconic .85, museum .75", [60, 70, 10, 40, 75]],
  pensaoamor: ["cocktails .85, nightlife .9, social .85, design .7", [55, 90, 55, 45, 45]],
  parkbar: ["rooftop .95, cocktails .75, sunset .9, social .85", [40, 85, 55, 40, 75]],
  blacksheep: ["natural-wine .98, wine .9, intimate .9, hidden-gem .85", [65, 30, 90, 45, 80]],
  memmo: ["boutique .9, design .9, viewpoint .8, quiet .8", [85, 20, 60, 75, 90]],
  lumiares: ["boutique .9, rooftop .8, design .85", [85, 40, 45, 75, 85]],
  torel: ["boutique .95, hidden-viewpoint .8, quiet .85, history .7", [92, 15, 65, 85, 35]],
  selina: ["social .95, nightlife .7", [20, 95, 35, 15, 70]],
  tivoli: ["iconic .9, rooftop .7", [90, 55, 10, 85, 45]],
  ebike: ["active .9, scenic-route .85, adventure .7", [30, 45, 45, 40, 75]],
  cascais: ["scenic-route .9, day-trip .85, slow .75, seafood .6", [25, 40, 40, 10, 30]],
  mercadores: ["portuguese .9, steak .7, intimate .9, local-favorite .9, hidden-gem .9, seafood .5", [55, 35, 95, 45, 30]],
  casaguedes: ["street-food .9, social .8, local-favorite .9, meat .85", [10, 85, 70, 10, 20]],
  serralves: ["museum .9, art .95, garden .9, design .9", [80, 25, 40, 20, 95]],
  morro: ["viewpoint .9, sunset .95, social .75", [15, 80, 45, 5, 35]],
  grahams: ["wine .95, history .85, iconic .8", [80, 50, 20, 75, 25]],
  yeatman: ["boutique .9, wine .9, viewpoint .9, quiet .8", [95, 30, 25, 98, 70]],
  afuri: ["ramen .98, street-food .6, local-favorite .7", [30, 70, 50, 15, 85]],
  motomura: ["steak .85, meat .95, social .5", [25, 75, 45, 40, 55]],
  tsukiji: ["market .95, seafood .95, street-food .9, breakfast .75", [15, 95, 30, 30, 25]],
  goldengai: ["nightlife .95, social .85, hidden-gem .8, cocktails .7", [35, 70, 85, 40, 10]],
  nezu: ["museum .85, garden .95, design .9, art .85, slow .85", [85, 15, 60, 30, 70]],
  hoshinoya: ["boutique .9, design .95, quiet .95", [98, 10, 40, 98, 80]],
};

export interface PlaceStyle {
  levels: Record<string, number>;
  dials: StyleDials;
}

const parse = ([levels, d]: (typeof RAW)[string]): PlaceStyle => ({
  levels: Object.fromEntries(
    levels.split(",").map((pair) => {
      const [tag, v] = pair.trim().split(/\s+/);
      return [tag, Number(v)];
    }),
  ),
  dials: { refined: d[0], buzz: d[1], local: d[2], splurge: d[3], modern: d[4] },
});

const TABLE: Record<string, PlaceStyle> = Object.fromEntries(Object.entries(RAW).map(([id, raw]) => [id, parse(raw)]));

const PRICE_TO_SPLURGE = [10, 15, 45, 75, 95];

/** Interest levels and style dials for any place; custom places get estimates from their tags and price. */
export const placeStyle = (place: Place): PlaceStyle => {
  const known = TABLE[place.id];
  if (known) return known;
  const levels = Object.fromEntries(place.tags.map((t) => [t, 0.65]));
  const tags = new Set(place.tags);
  return {
    levels,
    dials: {
      refined: tags.has("chef-driven") || tags.has("boutique") ? 75 : tags.has("street-food") ? 15 : 45,
      buzz: tags.has("social") || tags.has("nightlife") ? 80 : tags.has("quiet") || tags.has("intimate") ? 20 : 50,
      local: tags.has("hidden-gem") || tags.has("local-favorite") ? 80 : tags.has("iconic") ? 15 : 50,
      splurge: PRICE_TO_SPLURGE[Math.max(0, Math.min(4, place.price))],
      modern: tags.has("design") ? 80 : tags.has("history") ? 20 : 50,
    },
  };
};
