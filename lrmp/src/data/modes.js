// The five cooking modes. Order matters: it drives column order and the seed rotation.
// Colours match the light-theme vars in styles.css (:root --curry etc.) — these are the
// inline --gc values, so keep the two lists in sync when re-theming.
export const MODES = [
  {key:"curry",    name:"Curry",       desc:"spiced simmer",            ico:"\u{1F35B}", color:"#c08a16"},
  {key:"fry",      name:"Fry / BBQ",   desc:"dry, high heat",           ico:"\u{1F525}", color:"#c04531"},
  {key:"assembly", name:"Assembly",    desc:"base + vessel + toppings", ico:"\u{1F963}", color:"#5f9350"},
  {key:"soup",     name:"Soup & Stew", desc:"liquid",                   ico:"\u{1F372}", color:"#47807c"},
  {key:"bake",     name:"Bake",        desc:"oven / tray",              ico:"\u{1F9C0}", color:"#c26f26"},
];

export const MODE_BY_KEY = Object.fromEntries(MODES.map(m => [m.key, m]));
