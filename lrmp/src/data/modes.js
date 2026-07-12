// The five cooking modes. Order matters: it drives column order and the seed rotation.
export const MODES = [
  {key:"curry",    name:"Curry",       desc:"spiced simmer",            ico:"\u{1F35B}", color:"#e3a52b"},
  {key:"fry",      name:"Fry / BBQ",   desc:"dry, high heat",           ico:"\u{1F525}", color:"#cf4a33"},
  {key:"assembly", name:"Assembly",    desc:"base + vessel + toppings", ico:"\u{1F963}", color:"#6fa45c"},
  {key:"soup",     name:"Soup & Stew", desc:"liquid",                   ico:"\u{1F372}", color:"#4f8a86"},
  {key:"bake",     name:"Bake",        desc:"oven / tray",              ico:"\u{1F9C0}", color:"#d77a2e"},
];

export const MODE_BY_KEY = Object.fromEntries(MODES.map(m => [m.key, m]));
