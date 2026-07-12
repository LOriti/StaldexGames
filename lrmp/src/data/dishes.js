// 40 dishes. Fields:
//   n = name (PRIMARY KEY - must be unique, and must match a key in recipes.js)
//   p = protein   t = hands-on prep time
//   l = leftover class: keeps | parts | fresh  (drives DEFAULT_EXTRA in core/plan.js)
//   e = flavour engine (one-line summary shown on the recipe card)
const RAW = [
  { curry:[
      {n:"Beef keema",p:"Beef mince",t:"15 min",l:"keeps",e:"Garam masala, ginger, garlic, tomato, frozen cauli + beans"},
      {n:"Thai green chicken",p:"Chicken thigh",t:"15 min",l:"keeps",e:"Green curry paste, coconut cream, fish sauce, frozen Asian veg"},
      {n:"Butter chicken",p:"Chicken thigh",t:"20 min",l:"keeps",e:"Spiced tomato-cream, garam masala, fenugreek"},
      {n:"Massaman beef",p:"Beef chuck",t:"20m + slow",l:"keeps",e:"Massaman paste, coconut, star anise"} ],
    fry:[
      {n:"Korean sticky mince",p:"Beef mince",t:"15 min",l:"keeps",e:"Soy, gochugaru, sesame, sweetener, xanthan"},
      {n:"Thai basil beef",p:"Beef mince",t:"10 min",l:"fresh",e:"Pad krapow \u2014 fish sauce, soy, chilli, basil, fried egg"},
      {n:"Steak + charred greens",p:"Steak",t:"15 min",l:"fresh",e:"Garlic butter, broccolini / asparagus"},
      {n:"Beef & broccoli",p:"Beef strips",t:"15 min",l:"keeps",e:"Soy, oyster (light), ginger, garlic, frozen broccoli, xanthan"} ],
    assembly:[
      {n:"Burrito bowl",p:"Beef mince",t:"20 min",l:"parts",e:"Taco spice, cauli rice, cheese, avo, sour cream, salsa"},
      {n:"Lettuce-cup tacos",p:"Beef mince",t:"20 min",l:"parts",e:"Same mince, vessel swap"},
      {n:"Poke bowl",p:"Salmon / tuna",t:"20 min",l:"fresh",e:"Soy-sesame, cauli rice, cucumber, avo, nori"},
      {n:"San choy bow",p:"Pork mince",t:"15 min",l:"parts",e:"Soy, sesame, ginger, garlic, lettuce cups"} ],
    soup:[
      {n:"Tom kha gai",p:"Chicken thigh",t:"25 min",l:"keeps",e:"Coconut, lime, ginger, mushroom, fish sauce"},
      {n:"Cabbage roll soup",p:"Beef mince",t:"20m + simmer",l:"keeps",e:"Unstuffed \u2014 tomato, cabbage, beef stock, paprika"},
      {n:"No-bean chilli",p:"Beef mince",t:"20m + simmer",l:"keeps",e:"Cumin, chilli, smoked paprika, tomato"},
      {n:"Bolognese / rag\u00f9",p:"Beef/pork mince",t:"20m + simmer",l:"keeps",e:"Passata, garlic, herbs, parmesan \u2014 over zoodles"} ],
    bake:[
      {n:"Cottage pie",p:"Beef mince",t:"30m + bake",l:"keeps",e:"Cauli-mash top, mince base, cheese"},
      {n:"Moussaka",p:"Lamb mince",t:"40m + bake",l:"keeps",e:"Eggplant, tomato-lamb, cheese top"},
      {n:"Stuffed capsicums",p:"Beef mince",t:"25m + bake",l:"keeps",e:"Mince + cauli rice + cheese"},
      {n:"Baked meatballs",p:"Beef/pork mince",t:"25m + bake",l:"keeps",e:"In passata \u2014 parmesan, herbs, garlic"} ] },
  { curry:[
      {n:"Lamb rogan josh",p:"Lamb",t:"20m + slow",l:"keeps",e:"Kashmiri chilli, yoghurt, warm spice"},
      {n:"Chicken korma",p:"Chicken thigh",t:"20 min",l:"keeps",e:"Coconut + almond cream, mild garam masala"},
      {n:"Thai red prawn curry",p:"Prawns",t:"15 min",l:"fresh",e:"Red paste, coconut, capsicum, bamboo"},
      {n:"Palak paneer",p:"Paneer",t:"20 min",l:"keeps",e:"Spinach, garlic, ginger, cream \u2014 meat-free"} ],
    fry:[
      {n:"Lamb chops + chimichurri",p:"Lamb chops",t:"15 min",l:"fresh",e:"Charred chops, parsley-garlic-chilli oil"},
      {n:"Sausages + cabbage",p:"Pork sausages",t:"15 min",l:"keeps",e:"High-meat snags, buttered cabbage, wholegrain mustard"},
      {n:"Salt & pepper squid",p:"Squid",t:"20 min",l:"fresh",e:"Pork-rind / almond dredge, chilli, spring onion"},
      {n:"BBQ chicken + slaw",p:"Chicken thigh",t:"20m + marinate",l:"keeps",e:"Smoky rub, creamy slaw"} ],
    assembly:[
      {n:"Thai beef larb cups",p:"Beef mince",t:"15 min",l:"parts",e:"Dry-fried, fish sauce, lime, chilli, herbs"},
      {n:"Chicken Caesar",p:"Chicken thigh",t:"20 min",l:"parts",e:"No croutons \u2014 cos, parmesan, bacon, anchovy dressing"},
      {n:"Antipasto plate",p:"Cured meats",t:"10 min",l:"keeps",e:"Salami, prosciutto, cheese, olives, marinated veg"},
      {n:"Greek salad + halloumi",p:"Halloumi",t:"15 min",l:"parts",e:"Feta, cucumber, olives, oregano, grilled halloumi"} ],
    soup:[
      {n:"Beef bourguignon",p:"Beef chuck",t:"30m + slow",l:"keeps",e:"Bacon, mushroom, dry red wine"},
      {n:"Chicken cacciatore",p:"Chicken thigh",t:"20m + simmer",l:"keeps",e:"Tomato, olives, capsicum, herbs"},
      {n:"Creamy chicken & broccoli",p:"Chicken thigh",t:"25 min",l:"keeps",e:"Cream, cheese, broccoli, stock"},
      {n:"Zuppa toscana",p:"Italian sausage",t:"25 min",l:"keeps",e:"Sausage, kale, cream, stock \u2014 no potato"} ],
    bake:[
      {n:"Chicken parmigiana",p:"Chicken breast",t:"30m + bake",l:"keeps",e:"Pork-rind / almond crumb, passata, mozzarella"},
      {n:"Taco bake",p:"Beef mince",t:"25m + bake",l:"keeps",e:"Taco spice, capsicum, cheese"},
      {n:"Cauli-cheese & bacon",p:"Chicken + bacon",t:"30m + bake",l:"keeps",e:"Cauliflower, cheese sauce, bacon, chicken"},
      {n:"Spinach & feta frittata",p:"Eggs",t:"20m + bake",l:"keeps",e:"Egg, feta, spinach, onion"} ] },
];;

// Flattened: one pool per mode key, 8 dishes each. The old month-1/month-2 split is gone;
// a "month" is now just which dishes you painted, not a fixed set.
export const DISHES = {};
for (const chunk of RAW) {
  for (const [modeKey, list] of Object.entries(chunk)) {
    (DISHES[modeKey] ??= []).push(...list);
  }
}

// name -> { mode, dish }
export const DISH_INDEX = {};
for (const [modeKey, list] of Object.entries(DISHES)) {
  for (const d of list) DISH_INDEX[d.n] = { mode: modeKey, dish: d };
}

export const ALL_DISH_NAMES = Object.keys(DISH_INDEX);

/** @returns {{mode:string, dish:object}|null} */
export function metaOf(name) { return DISH_INDEX[name] ?? null; }
