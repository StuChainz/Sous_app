// ═══════════════════════════════════════════
// FOOD DATABASE
// ═══════════════════════════════════════════
// Canonical Sous food shape:
// - nutritionPer100g is the canonical calculation base for expansion/imports.
// - units are user-facing serving shortcuts; grams remain the internal scale.
// - aliases help search/parser matching without changing the display name.
// - countryCodes allow global defaults plus country-specific foods.
// - Imported foods should be normalised into this shape before use.
// Country-specific foods are for local names, supermarket-style defaults,
// serving sizes, and branded/imported foods later.
//
// Legacy fields (`kw`, `w`, `kcal`, `p`, `c`, `f`, `fi`, `type`) are retained
// because the current app and parser still rely on them.
// type:'liquid' means the UI should prefer ml; missing type defaults to solid/g.
const FOODS=[
  // Poultry
  {name:'Chicken breast',  w:100,kcal:165,p:31,  c:0,   f:3.6, fi:0,   icon:'ti-meat',       kw:['chicken breast','chicken breasts','breast','chicken fillet','chicken fillets','grilled chicken breast','chicken breast fillet'],defaultUnit:'breast',units:[{label:'breast',grams:170},{label:'g',grams:1}]},
  {name:'Chicken thigh',   w:100,kcal:209,p:26,  c:0,   f:11,  fi:0,   icon:'ti-meat',       kw:['chicken thigh','chicken thighs','thigh','thighs','boneless thigh','boneless thighs','chicken thigh fillet']},
  {name:'Chicken drumstick',w:100,kcal:185,p:27, c:0,   f:8,   fi:0,   icon:'ti-meat',       kw:['chicken drumstick','drumstick','drumsticks']},
  {name:'Chicken mince',   w:100,kcal:170,p:20,  c:0,   f:10,  fi:0,   icon:'ti-meat',       kw:['chicken mince','minced chicken']},
  {name:'Turkey breast',   w:100,kcal:135,p:30,  c:0,   f:1,   fi:0,   icon:'ti-meat',       kw:['turkey breast']},
  {name:'Turkey mince',    w:100,kcal:149,p:21,  c:0,   f:7,   fi:0,   icon:'ti-meat',       kw:['turkey mince','minced turkey']},
  {name:'Duck breast',     w:100,kcal:201,p:23,  c:0,   f:12,  fi:0,   icon:'ti-meat',       kw:['duck breast','duck']},
  // Red meat
  {name:'Beef steak',      w:100,kcal:271,p:26,  c:0,   f:18,  fi:0,   icon:'ti-meat',       kw:['steak','sirloin','ribeye','beef steak']},
  {name:'Beef mince',      w:100,kcal:254,p:26,  c:0,   f:17,  fi:0,   icon:'ti-meat',       kw:['beef mince','mince','ground beef','minced beef']},
  {name:'Pork loin',       w:100,kcal:175,p:29,  c:0,   f:6,   fi:0,   icon:'ti-meat',       kw:['pork loin','loin of pork']},
  {name:'Pork belly',      w:100,kcal:395,p:10,  c:0,   f:39,  fi:0,   icon:'ti-meat',       kw:['pork belly']},
  {name:'Pork mince',      w:100,kcal:243,p:25,  c:0,   f:16,  fi:0,   icon:'ti-meat',       kw:['pork mince','minced pork']},
  {name:'Ham',             w:100,kcal:107,p:17,  c:1.5, f:3.5, fi:0,   icon:'ti-meat',       kw:['ham','cooked ham']},
  {name:'Bacon',           w:100,kcal:215,p:23,  c:0,   f:14,  fi:0,   icon:'ti-meat',       kw:['bacon','back bacon','streaky bacon'],defaultUnit:'rasher',units:[{label:'rasher',grams:25,defaultQty:2},{label:'g',grams:1}]},
  {name:'Sausages',        w:100,kcal:301,p:13,  c:8,   f:25,  fi:0,   icon:'ti-meat',       kw:['sausage','sausages','pork sausage'],defaultUnit:'sausage',units:[{label:'sausage',grams:60},{label:'g',grams:1}]},
  {name:'Lamb chops',      w:100,kcal:294,p:25,  c:0,   f:21,  fi:0,   icon:'ti-meat',       kw:['lamb chops','lamb chop','lamb cutlet']},
  {name:'Lamb mince',      w:100,kcal:282,p:21,  c:0,   f:22,  fi:0,   icon:'ti-meat',       kw:['lamb mince','minced lamb']},
  // Fish & seafood
  {name:'Salmon',          w:100,kcal:208,p:20,  c:0,   f:13,  fi:0,   icon:'ti-fish',       kw:['salmon']},
  {name:'Tuna',            w:100,kcal:132,p:28,  c:0,   f:1,   fi:0,   icon:'ti-fish',       kw:['tuna','fresh tuna','tuna steak']},
  {name:'Tuna canned',     w:100,kcal:116,p:26,  c:0,   f:1,   fi:0,   icon:'ti-fish',       kw:['tuna canned','canned tuna','tinned tuna']},
  {name:'Cod',             w:100,kcal:82, p:18,  c:0,   f:0.7, fi:0,   icon:'ti-fish',       kw:['cod']},
  {name:'Mackerel',        w:100,kcal:305,p:19,  c:0,   f:25,  fi:0,   icon:'ti-fish',       kw:['mackerel']},
  {name:'Sardines',        w:100,kcal:208,p:25,  c:0,   f:12,  fi:0,   icon:'ti-fish',       kw:['sardines','sardine']},
  {name:'Sea bass',        w:100,kcal:97, p:19,  c:0,   f:2,   fi:0,   icon:'ti-fish',       kw:['sea bass','seabass','bass']},
  {name:'Tilapia',         w:100,kcal:96, p:20,  c:0,   f:1.7, fi:0,   icon:'ti-fish',       kw:['tilapia']},
  {name:'Prawns',          w:100,kcal:99, p:21,  c:0,   f:1.1, fi:0,   icon:'ti-fish',       kw:['prawns','prawn','shrimp','shrimps']},
  {name:'Crab',            w:100,kcal:97, p:19,  c:0,   f:2,   fi:0,   icon:'ti-fish',       kw:['crab']},
  // Eggs
  {name:'Egg',             w:50, kcal:78, p:6,   c:0.6, f:5,   fi:0,   icon:'ti-egg',        kw:['egg','eggs','whole egg','whole eggs','boiled egg','boiled eggs','scrambled egg','scrambled eggs','fried egg','fried eggs','poached egg','poached eggs'],defaultUnit:'egg',units:[{label:'egg',grams:50},{label:'g',grams:1}]},
  {name:'Egg white',       w:33, kcal:17, p:3.6, c:0.2, f:0,   fi:0,   icon:'ti-egg',        kw:['egg white','egg whites','whites']},
  // Dairy
  {name:'Greek yoghurt',       w:100,kcal:59, p:10,  c:3.6, f:0.4, fi:0,   icon:'ti-glass',      kw:['greek yoghurt','greek yogurt','yoghurt','yogurt']},
  {name:'Fat free Greek yoghurt',w:100,kcal:57, p:10,  c:4,   f:0.1, fi:0,   icon:'ti-glass',      kw:['fat free greek yogurt','fat free greek yoghurt','0% greek yogurt','0% greek yoghurt','0 percent greek yogurt','0 percent greek yoghurt','zero percent greek yogurt','nonfat greek yogurt','non fat greek yogurt','fat free yogurt','fat free yoghurt']},
  {name:'Full fat Greek yoghurt',w:100,kcal:115,p:9,   c:3.8, f:7,   fi:0,   icon:'ti-glass',      kw:['full fat greek yogurt','full fat greek yoghurt','full fat yogurt','full fat yoghurt','5% greek yogurt','5% greek yoghurt','whole milk greek yogurt']},
  {name:'Skyr',                  w:100,kcal:57, p:11,  c:4,   f:0.2, fi:0,   icon:'ti-glass',      kw:['skyr','icelandic yoghurt','icelandic yogurt']},
  {name:'Milk',            w:100,kcal:46, p:3.4, c:5,   f:1.6, fi:0,   icon:'ti-glass',      kw:['milk','semi skimmed milk','semi-skimmed milk'],type:'liquid'},
  {name:'Whole milk',      w:100,kcal:61, p:3.2, c:4.8, f:3.3, fi:0,   icon:'ti-glass',      kw:['whole milk','full fat milk'],type:'liquid'},
  {name:'Oat milk',        w:100,kcal:45, p:1,   c:6.6, f:1.5, fi:0.8, icon:'ti-glass',      kw:['oat milk'],type:'liquid'},
  {name:'Almond milk',     w:100,kcal:13, p:0.5, c:0.7, f:1,   fi:0.2, icon:'ti-glass',      kw:['almond milk'],type:'liquid'},
  {name:'Cottage cheese',  w:100,kcal:98, p:11,  c:3.4, f:4.3, fi:0,   icon:'ti-cheese',     kw:['cottage cheese']},
  {name:'Cheddar',         w:30, kcal:121,p:7,   c:0.2, f:10,  fi:0,   icon:'ti-cheese',     kw:['cheddar','cheese','cheddar cheese']},
  {name:'Mozzarella',      w:100,kcal:280,p:28,  c:2.2, f:17,  fi:0,   icon:'ti-cheese',     kw:['mozzarella']},
  {name:'Parmesan',        w:100,kcal:431,p:38,  c:4,   f:29,  fi:0,   icon:'ti-cheese',     kw:['parmesan','parmigiano']},
  {name:'Cream cheese',    w:100,kcal:342,p:6,   c:4.4, f:34,  fi:0,   icon:'ti-cheese',     kw:['cream cheese','philadelphia']},
  {name:'Sour cream',      w:100,kcal:198,p:3,   c:4.3, f:20,  fi:0,   icon:'ti-glass',      kw:['sour cream','creme fraiche'],type:'liquid'},
  {name:'Butter',          w:10, kcal:72, p:0.1, c:0,   f:8,   fi:0,   icon:'ti-droplet',    kw:['butter']},
  {name:'Ghee',            w:14, kcal:123,p:0,   c:0,   f:14,  fi:0,   icon:'ti-droplet',    kw:['ghee','clarified butter']},
  {name:'Whipping cream',  w:100,kcal:345,p:2,   c:3.5, f:36,  fi:0,   icon:'ti-glass',      kw:['whipping cream','double cream','heavy cream'],type:'liquid'},
  // Grains
  {name:'Brown rice',      w:100,kcal:355,p:7.5, c:74,  f:2.7, fi:3.5, icon:'ti-bowl-spoon', kw:['brown rice']},
  {name:'White rice',      w:100,kcal:365,p:7,   c:80,  f:0.6, fi:1.3, icon:'ti-bowl-spoon', kw:['white rice']},
  {name:'Pasta',           w:100,kcal:371,p:13,  c:75,  f:1.5, fi:3,   icon:'ti-bowl-spoon', kw:['pasta','spaghetti','penne','fusilli','tagliatelle','linguine']},
  {name:'Oats',            w:100,kcal:389,p:17,  c:66,  f:7,   fi:10,  icon:'ti-bowl-spoon', kw:['oats','oatmeal','porridge','rolled oats']},
  {name:'Quinoa',          w:100,kcal:368,p:14,  c:64,  f:6,   fi:7,   icon:'ti-bowl-spoon', kw:['quinoa']},
  {name:'Couscous',        w:100,kcal:376,p:13,  c:73,  f:0.6, fi:5,   icon:'ti-bowl-spoon', kw:['couscous']},
  {name:'Barley',          w:100,kcal:354,p:10,  c:74,  f:2.3, fi:10,  icon:'ti-bowl-spoon', kw:['barley','pearl barley']},
  {name:'Bread',           w:35, kcal:79, p:3.5, c:14,  f:1,   fi:2,   icon:'ti-bread',      kw:['wholemeal bread','wholegrain bread','brown bread'],defaultUnit:'slice',units:[{label:'slice',grams:40,defaultQty:2},{label:'g',grams:1}]},
  {name:'White bread',     w:30, kcal:75, p:2.7, c:14,  f:0.9, fi:0.7, icon:'ti-bread',      kw:['white bread'],defaultUnit:'slice',units:[{label:'slice',grams:40,defaultQty:2},{label:'g',grams:1}]},
  {name:'Rye bread',       w:30, kcal:66, p:2.3, c:12,  f:0.6, fi:1.7, icon:'ti-bread',      kw:['rye bread','rye'],defaultUnit:'slice',units:[{label:'slice',grams:40,defaultQty:2},{label:'g',grams:1}]},
  {name:'Bread roll',      w:70, kcal:190,p:7,   c:36,  f:2,   fi:2.5, icon:'ti-bread',      kw:['bread roll','roll','bread bun','bun','bap'],defaultUnit:'roll',units:[{label:'roll',grams:70},{label:'g',grams:1}]},
  {name:'Rice cake',       w:10, kcal:38, p:0.9, c:8,   f:0.3, fi:0.3, icon:'ti-bread',      kw:['rice cake','rice cakes']},
  {name:'Tortilla wrap',   w:40, kcal:120,p:3.5, c:20,  f:3,   fi:1.2, icon:'ti-bread',      kw:['tortilla','wrap','tortilla wrap'],defaultUnit:'wrap',units:[{label:'wrap',grams:60},{label:'g',grams:1}]},
  {name:'Bagel',           w:100,kcal:250,p:10,  c:50,  f:1.5, fi:2,   icon:'ti-bread',      kw:['bagel']},
  // Legumes
  {name:'Lentils',         w:100,kcal:116,p:9,   c:20,  f:0.4, fi:8,   icon:'ti-leaf',       kw:['lentils','lentil','red lentils']},
  {name:'Chickpeas',       w:100,kcal:164,p:9,   c:27,  f:2.6, fi:7.6, icon:'ti-leaf',       kw:['chickpeas','chickpea','garbanzo']},
  {name:'Black beans',     w:100,kcal:132,p:9,   c:24,  f:0.5, fi:8.7, icon:'ti-leaf',       kw:['black beans','black bean']},
  {name:'Kidney beans',    w:100,kcal:127,p:8.7, c:22.8,f:0.5, fi:7.4, icon:'ti-leaf',       kw:['kidney beans','kidney bean']},
  {name:'Edamame',         w:100,kcal:121,p:11,  c:10,  f:5,   fi:5,   icon:'ti-leaf',       kw:['edamame']},
  {name:'Butter beans',    w:100,kcal:125,p:8,   c:22,  f:0.4, fi:7,   icon:'ti-leaf',       kw:['butter beans','butter bean']},
  {name:'Tofu',            w:100,kcal:76, p:8,   c:2,   f:4.2, fi:0.3, icon:'ti-leaf',       kw:['tofu']},
  {name:'Tempeh',          w:100,kcal:195,p:20,  c:7.6, f:11,  fi:0,   icon:'ti-leaf',       kw:['tempeh']},
  // Vegetables
  {name:'Broccoli',        w:100,kcal:34, p:2.8, c:7,   f:0.4, fi:2.6, icon:'ti-leaf',       kw:['broccoli','brocoli']},
  {name:'Spinach',         w:100,kcal:23, p:2.9, c:3.6, f:0.4, fi:2.2, icon:'ti-leaf',       kw:['spinach']},
  {name:'Kale',            w:100,kcal:49, p:4.3, c:9,   f:0.9, fi:3.6, icon:'ti-leaf',       kw:['kale']},
  {name:'Sweet potato',    w:100,kcal:86, p:1.6, c:20,  f:0.1, fi:3,   icon:'ti-plant-2',    kw:['sweet potato','sweet potatoes']},
  {name:'Potato',          w:100,kcal:77, p:2,   c:17,  f:0.1, fi:2.2, icon:'ti-plant-2',    kw:['potato','potatoes']},
  {name:'Tomato',          w:100,kcal:18, p:0.9, c:3.9, f:0.2, fi:1.2, icon:'ti-plant-2',    kw:['tomato','tomatoes']},
  {name:'Onion',           w:100,kcal:40, p:1.1, c:9.3, f:0.1, fi:1.7, icon:'ti-plant-2',    kw:['onion','onions','red onion']},
  {name:'Mushrooms',       w:100,kcal:22, p:3.1, c:3.3, f:0.3, fi:1,   icon:'ti-plant-2',    kw:['mushroom','mushrooms']},
  {name:'Peppers',         w:100,kcal:31, p:1,   c:6,   f:0.3, fi:2.1, icon:'ti-plant-2',    kw:['pepper','peppers','bell pepper','capsicum']},
  {name:'Carrot',          w:100,kcal:41, p:0.9, c:10,  f:0.2, fi:2.8, icon:'ti-plant-2',    kw:['carrot','carrots']},
  {name:'Cucumber',        w:100,kcal:16, p:0.7, c:3.6, f:0.1, fi:0.5, icon:'ti-plant-2',    kw:['cucumber']},
  {name:'Celery',          w:100,kcal:16, p:0.7, c:3,   f:0.2, fi:1.6, icon:'ti-plant-2',    kw:['celery']},
  {name:'Asparagus',       w:100,kcal:20, p:2.2, c:3.7, f:0.1, fi:2.1, icon:'ti-plant-2',    kw:['asparagus']},
  {name:'Courgette',       w:100,kcal:17, p:1.2, c:3.1, f:0.3, fi:1,   icon:'ti-plant-2',    kw:['courgette','zucchini']},
  {name:'Cauliflower',     w:100,kcal:25, p:1.9, c:5,   f:0.3, fi:2,   icon:'ti-plant-2',    kw:['cauliflower']},
  {name:'Corn',            w:100,kcal:96, p:3.4, c:21,  f:1.5, fi:2.4, icon:'ti-plant-2',    kw:['corn','sweetcorn','corn on the cob']},
  {name:'Garden peas',     w:100,kcal:81, p:5.4, c:14,  f:0.4, fi:5.5, icon:'ti-plant-2',    kw:['peas','garden peas','frozen peas']},
  {name:'Green beans',     w:100,kcal:31, p:1.8, c:7.1, f:0.1, fi:2.7, icon:'ti-plant-2',    kw:['green beans','french beans','runner beans']},
  {name:'Beetroot',        w:100,kcal:43, p:1.6, c:10,  f:0.1, fi:2.8, icon:'ti-plant-2',    kw:['beetroot','beet']},
  {name:'Leek',            w:100,kcal:31, p:1.5, c:7.4, f:0.3, fi:1.8, icon:'ti-plant-2',    kw:['leek','leeks']},
  {name:'Avocado',         w:100,kcal:160,p:2,   c:9,   f:15,  fi:7,   icon:'ti-plant-2',    kw:['avocado'],defaultUnit:'avocado',units:[{label:'avocado',grams:150},{label:'g',grams:1}]},
  {name:'Lettuce',         w:100,kcal:15, p:1.4, c:2.9, f:0.2, fi:1.3, icon:'ti-leaf',       kw:['lettuce','salad leaves','mixed leaves','rocket']},
  {name:'Cabbage',         w:100,kcal:25, p:1.3, c:5.8, f:0.1, fi:2.5, icon:'ti-leaf',       kw:['cabbage','red cabbage','savoy']},
  // Fruits
  {name:'Banana',          w:120,kcal:105,p:1.3, c:27,  f:0.4, fi:3.1, icon:'ti-apple',      kw:['banana'],defaultUnit:'banana',units:[{label:'banana',grams:120},{label:'g',grams:1}]},
  {name:'Apple',           w:150,kcal:78, p:0.4, c:21,  f:0.2, fi:3.6, icon:'ti-apple',      kw:['apple'],defaultUnit:'apple',units:[{label:'apple',grams:180},{label:'g',grams:1}]},
  {name:'Orange',          w:130,kcal:62, p:1.2, c:15,  f:0.2, fi:3.1, icon:'ti-apple',      kw:['orange'],defaultUnit:'orange',units:[{label:'orange',grams:130},{label:'g',grams:1}]},
  {name:'Strawberries',    w:100,kcal:32, p:0.7, c:7.7, f:0.3, fi:2,   icon:'ti-apple',      kw:['strawberry','strawberries']},
  {name:'Blueberries',     w:100,kcal:57, p:0.7, c:14,  f:0.3, fi:2.4, icon:'ti-apple',      kw:['blueberry','blueberries']},
  {name:'Raspberries',     w:100,kcal:52, p:1.2, c:12,  f:0.7, fi:6.5, icon:'ti-apple',      kw:['raspberry','raspberries']},
  {name:'Grapes',          w:100,kcal:69, p:0.7, c:18,  f:0.2, fi:0.9, icon:'ti-apple',      kw:['grapes','grape']},
  {name:'Mango',           w:100,kcal:60, p:0.8, c:15,  f:0.4, fi:1.6, icon:'ti-apple',      kw:['mango']},
  {name:'Pineapple',       w:100,kcal:50, p:0.5, c:13,  f:0.1, fi:1.4, icon:'ti-apple',      kw:['pineapple']},
  {name:'Pear',            w:150,kcal:96, p:0.6, c:26,  f:0.2, fi:5.5, icon:'ti-apple',      kw:['pear']},
  {name:'Kiwi',            w:80, kcal:48, p:0.9, c:11,  f:0.4, fi:2.1, icon:'ti-apple',      kw:['kiwi']},
  {name:'Watermelon',      w:100,kcal:30, p:0.6, c:7.6, f:0.2, fi:0.4, icon:'ti-apple',      kw:['watermelon']},
  // Nuts & seeds
  {name:'Almonds',         w:28, kcal:164,p:6,   c:6,   f:14,  fi:3.5, icon:'ti-nut',        kw:['almonds','almond']},
  {name:'Walnuts',         w:28, kcal:185,p:4.3, c:3.9, f:18.5,fi:1.9, icon:'ti-nut',        kw:['walnuts','walnut']},
  {name:'Cashews',         w:28, kcal:157,p:5.2, c:9,   f:12.4,fi:0.9, icon:'ti-nut',        kw:['cashews','cashew']},
  {name:'Pistachios',      w:28, kcal:159,p:5.8, c:7.7, f:12.8,fi:3,   icon:'ti-nut',        kw:['pistachios','pistachio']},
  {name:'Peanut butter',   w:32, kcal:190,p:8,   c:7,   f:16,  fi:2,   icon:'ti-nut',        kw:['peanut butter']},
  {name:'Almond butter',   w:32, kcal:196,p:7,   c:7.5, f:17,  fi:1.6, icon:'ti-nut',        kw:['almond butter']},
  {name:'Sunflower seeds', w:28, kcal:164,p:5.5, c:5.5, f:14,  fi:3,   icon:'ti-nut',        kw:['sunflower seeds','sunflower seed']},
  {name:'Chia seeds',      w:28, kcal:138,p:4.7, c:12,  f:8.7, fi:9.8, icon:'ti-nut',        kw:['chia seeds','chia']},
  {name:'Flaxseeds',       w:10, kcal:55, p:1.9, c:3,   f:4.3, fi:2.8, icon:'ti-nut',        kw:['flaxseeds','flaxseed','linseed']},
  {name:'Pumpkin seeds',   w:28, kcal:151,p:8.5, c:5,   f:13,  fi:1.1, icon:'ti-nut',        kw:['pumpkin seeds','pumpkin seed']},
  // Oils & fats
  {name:'Olive oil',       w:14, kcal:119,p:0,   c:0,   f:14,  fi:0,   icon:'ti-droplet',    kw:['olive oil','extra virgin olive oil','evoo'],type:'liquid'},
  {name:'Coconut oil',     w:14, kcal:121,p:0,   c:0,   f:14,  fi:0,   icon:'ti-droplet',    kw:['coconut oil'],type:'liquid'},
  {name:'Vegetable oil',   w:14, kcal:124,p:0,   c:0,   f:14,  fi:0,   icon:'ti-droplet',    kw:['vegetable oil','sunflower oil','rapeseed oil'],type:'liquid'},
  // Condiments & sauces
  {name:'Ketchup',         w:100,kcal:112,p:1.3, c:26,  f:0.1, fi:0.4, icon:'ti-droplet',    kw:['ketchup','tomato ketchup'],type:'liquid'},
  {name:'Mayonnaise',      w:100,kcal:685,p:1,   c:3.4, f:75,  fi:0,   icon:'ti-droplet',    kw:['mayonnaise','mayo'],type:'liquid'},
  {name:'Soy sauce',       w:15, kcal:8,  p:1.3, c:0.8, f:0,   fi:0,   icon:'ti-droplet',    kw:['soy sauce','soya sauce','tamari'],type:'liquid'},
  {name:'Honey',           w:100,kcal:304,p:0.3, c:82,  f:0,   fi:0.2, icon:'ti-droplet',    kw:['honey'],type:'liquid'},
  {name:'Tahini',          w:100,kcal:595,p:17,  c:21,  f:54,  fi:9,   icon:'ti-droplet',    kw:['tahini'],type:'liquid'},
  {name:'Hummus',          w:100,kcal:166,p:7.9, c:14,  f:9.6, fi:6,   icon:'ti-droplet',    kw:['hummus','houmous'],type:'liquid'},
  {name:'Pesto',           w:100,kcal:421,p:10,  c:4,   f:42,  fi:0,   icon:'ti-droplet',    kw:['pesto'],type:'liquid'},
  // Supplements
  {name:'Protein powder',  w:30, kcal:120,p:24,  c:3,   f:1.5, fi:0,   icon:'ti-flask',      kw:['protein powder','whey','whey protein','protein shake'],defaultUnit:'scoop',units:[{label:'scoop',grams:30},{label:'g',grams:1}]},
  {name:'Casein protein',  w:30, kcal:114,p:24,  c:3.5, f:1,   fi:0,   icon:'ti-flask',      kw:['casein','casein protein']},
  {name:'Collagen powder', w:10, kcal:36, p:9,   c:0,   f:0,   fi:0,   icon:'ti-flask',      kw:['collagen','collagen powder']},
  // GB curated pack
  {name:'Back bacon',      w:100,kcal:225,p:23,  c:0.5, f:15,  fi:0,   icon:'ti-meat',       kw:['back bacon','bacon','bacon rasher','bacon rashers','rasher','rashers'],countryCodes:['GB'],source:'curated',defaultUnit:'rasher',units:[{label:'rasher',grams:30,defaultQty:2},{label:'g',grams:1}],nutritionPer100g:{calories:225,protein:23,carbs:0.5,fat:15,fibre:0}},
  {name:'Pork sausage',    w:100,kcal:301,p:13,  c:8,   f:25,  fi:0,   icon:'ti-meat',       kw:['pork sausage','pork sausages','sausage','sausages','banger','bangers'],countryCodes:['GB'],source:'curated',defaultUnit:'sausage',units:[{label:'sausage',grams:57,defaultQty:2},{label:'g',grams:1}],nutritionPer100g:{calories:301,protein:13,carbs:8,fat:25,fibre:0}},
  {name:'Baked beans',     w:100,kcal:78, p:4.7, c:12.5,f:0.4, fi:3.7, icon:'ti-leaf',       kw:['baked beans','beans on toast','tinned baked beans'],countryCodes:['GB'],source:'curated',defaultUnit:'half tin',units:[{label:'half tin',grams:200},{label:'tin',grams:400},{label:'g',grams:1}],nutritionPer100g:{calories:78,protein:4.7,carbs:12.5,fat:0.4,fibre:3.7}},
  {name:'Crumpet',         w:55, kcal:97, p:3.6, c:19,  f:0.7, fi:1.3, icon:'ti-bread',      kw:['crumpet','crumpets'],countryCodes:['GB'],source:'curated',defaultUnit:'crumpet',units:[{label:'crumpet',grams:55,defaultQty:2},{label:'g',grams:1}],nutritionPer100g:{calories:176,protein:6.5,carbs:34.5,fat:1.3,fibre:2.4}},
  {name:'English muffin',  w:65, kcal:150,p:5.5, c:29,  f:1.5, fi:2,   icon:'ti-bread',      kw:['english muffin','breakfast muffin','muffin'],countryCodes:['GB'],source:'curated',defaultUnit:'muffin',units:[{label:'muffin',grams:65},{label:'g',grams:1}],nutritionPer100g:{calories:231,protein:8.5,carbs:44.6,fat:2.3,fibre:3.1}},
  {name:'Medium sliced bread',w:36,kcal:88,p:3.5,c:17,  f:0.9, fi:1.5, icon:'ti-bread',      kw:['medium sliced bread','toastie bread','bread slice','slice of bread','white medium bread','warburtons style bread'],countryCodes:['GB'],source:'curated',defaultUnit:'slice',units:[{label:'slice',grams:36,defaultQty:2},{label:'g',grams:1}],nutritionPer100g:{calories:244,protein:9.7,carbs:47.2,fat:2.5,fibre:4.2}},
  {name:'Bread roll',      w:70, kcal:190,p:7,   c:36,  f:2,   fi:2.5, icon:'ti-bread',      kw:['bread roll','bap','baps','roll','rolls','bread bun','bun','buns'],countryCodes:['GB'],source:'curated',defaultUnit:'roll',units:[{label:'roll',grams:70},{label:'g',grams:1}],nutritionPer100g:{calories:271,protein:10,carbs:51.4,fat:2.9,fibre:3.6}},
  {name:'Cheddar',         w:30, kcal:125,p:7.5, c:0.1, f:10.5,fi:0,   icon:'ti-cheese',     kw:['cheddar','cheddar cheese','mature cheddar','grated cheddar'],countryCodes:['GB'],source:'curated',defaultUnit:'slice',units:[{label:'slice',grams:25},{label:'matchbox',grams:30},{label:'g',grams:1}],nutritionPer100g:{calories:416,protein:25,carbs:0.5,fat:35,fibre:0}},
  {name:'Milk',            w:100,kcal:47, p:3.5, c:4.8, f:1.7, fi:0,   icon:'ti-glass',      kw:['milk','semi skimmed milk','semi-skimmed milk','semi skimmed','semi-skimmed'],type:'liquid',countryCodes:['GB'],source:'curated',defaultUnit:'ml',units:[{label:'ml',grams:1},{label:'pint',grams:568}],nutritionPer100g:{calories:47,protein:3.5,carbs:4.8,fat:1.7,fibre:0}},
  {name:'Greek yoghurt',   w:100,kcal:60, p:10,  c:3.8, f:0.4, fi:0,   icon:'ti-glass',      kw:['greek yoghurt','greek yogurt','natural greek yoghurt','natural greek yogurt'],countryCodes:['GB'],source:'curated',defaultUnit:'pot',units:[{label:'pot',grams:150},{label:'g',grams:1}],nutritionPer100g:{calories:60,protein:10,carbs:3.8,fat:0.4,fibre:0}},
  {name:'Porridge oats',   w:40, kcal:150,p:5.5, c:24,  f:3.2, fi:3.8, icon:'ti-bowl-spoon', kw:['porridge oats','porridge','rolled oats','oats'],countryCodes:['GB'],source:'curated',defaultUnit:'serving',units:[{label:'serving',grams:40},{label:'g',grams:1}],nutritionPer100g:{calories:375,protein:13.8,carbs:60,fat:8,fibre:9.5}},
  {name:'Digestive biscuit',w:15,kcal:72, p:1,   c:9.5, f:3.2, fi:0.5, icon:'ti-cookie',     kw:['digestive biscuit','digestive biscuits','digestive'],countryCodes:['GB'],source:'curated',defaultUnit:'biscuit',units:[{label:'biscuit',grams:15,defaultQty:2},{label:'g',grams:1}],nutritionPer100g:{calories:480,protein:6.7,carbs:63.3,fat:21.3,fibre:3.3}},
  {name:'Chocolate biscuit',w:18,kcal:90, p:1,   c:11,  f:4.5, fi:0.5, icon:'ti-cookie',     kw:['chocolate biscuit','chocolate biscuits','choc biscuit','choccy biscuit'],countryCodes:['GB'],source:'curated',defaultUnit:'biscuit',units:[{label:'biscuit',grams:18,defaultQty:2},{label:'g',grams:1}],nutritionPer100g:{calories:500,protein:5.6,carbs:61.1,fat:25,fibre:2.8}},
  {name:'Jacket potato',   w:250,kcal:232,p:6.3, c:53,  f:0.3, fi:5.5, icon:'ti-plant-2',    kw:['jacket potato','baked potato','jacket spud','spud'],countryCodes:['GB'],source:'curated',defaultUnit:'potato',units:[{label:'potato',grams:250},{label:'g',grams:1}],nutritionPer100g:{calories:93,protein:2.5,carbs:21.2,fat:0.1,fibre:2.2}},
  {name:'Chicken breast fillet',w:170,kcal:280,p:52.7,c:0,f:6.1,fi:0,  icon:'ti-meat',       kw:['chicken breast fillet','chicken fillet','chicken breast','skinless chicken breast fillet'],countryCodes:['GB'],source:'curated',defaultUnit:'fillet',units:[{label:'fillet',grams:170},{label:'g',grams:1}],nutritionPer100g:{calories:165,protein:31,carbs:0,fat:3.6,fibre:0}},
];

const FOOD_SCHEMA_VERSION=1;
const FOOD_SOURCE='sous_seed';
const FOOD_COUNTRY_CODES=['GLOBAL'];
const EXTRA_ALIASES={
  'Egg':['eggs','whole egg'],
  'Bacon':['rasher','rashers'],
  'Sausages':['sausage','sausages'],
  'Oats':['porridge oats','oatmeal','porridge','rolled oats'],
  'Bread':['bread slice','slice of bread','slices of bread','toast','slice of toast','slices of toast'],
  'White bread':['white toast','white bread slice','slice of white bread','white slice','white slices'],
  'Rye bread':['rye toast','rye bread slice','slice of rye bread'],
  'Bread roll':['roll','rolls','bun','buns','bap','baps'],
  'Protein powder':['whey','whey protein','protein','protein scoop','scoop of whey'],
  'Olive oil':['oil','evoo','extra virgin oil'],
  'Milk':['semi skimmed milk','semi-skimmed milk','skimmed milk'],
  'Whole milk':['whole milk','full fat milk'],
  'Oat milk':['oat drink'],
  'Almond milk':['almond drink'],
  'Peanut butter':['pb','peanut spread'],
  'Courgette':['zucchini'],
  'Peppers':['bell pepper','bell peppers','capsicum'],
  'Chickpeas':['garbanzo beans','garbanzo'],
  'Kidney beans':['red beans'],
  'Black beans':['black bean'],
  'Butter beans':['lima beans'],
  'Coriander':['cilantro']
};
function foodIdFromName(name){
  return 'food_'+String(name||'')
    .toLowerCase()
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'');
}
function foodCategory(food){
  const n=String(food.name||'').toLowerCase();
  if(food.icon==='ti-egg') return 'eggs';
  if(food.icon==='ti-fish') return 'fish_seafood';
  if(food.icon==='ti-cheese'||['milk','yoghurt','yogurt','skyr','cream'].some(x=>n.includes(x))) return 'dairy';
  if(food.icon==='ti-bowl-spoon'||['rice','pasta','oats','quinoa','couscous','barley','bread','bagel','wrap'].some(x=>n.includes(x))) return 'grains';
  if(food.icon==='ti-meat') return 'meat';
  if(food.icon==='ti-nut') return 'nuts_seeds';
  if(food.icon==='ti-apple') return 'fruit';
  if(food.icon==='ti-flask') return 'supplements';
  if(['lentils','chickpeas','beans','edamame','tofu','tempeh','hummus'].some(x=>n.includes(x))) return 'legumes';
  if(food.icon==='ti-droplet') return 'oils_condiments';
  if(food.icon==='ti-leaf'||food.icon==='ti-plant-2') return 'vegetables';
  return 'general';
}
function normaliseFood(food){
  const aliases=[...(food.kw||[]),...(EXTRA_ALIASES[food.name]||[])];
  const uniqueAliases=[...new Set(aliases.map(a=>String(a).toLowerCase().trim()).filter(Boolean))];
  food.id=food.id||foodIdFromName(food.name);
  food.aliases=food.aliases||uniqueAliases;
  food.kw=food.kw||food.aliases;
  food.category=food.category||foodCategory(food);
  food.foodType=food.foodType||food.type||'solid';
  food.source=food.source||FOOD_SOURCE;
  food.countryCodes=(Array.isArray(food.countryCodes)&&food.countryCodes.length?food.countryCodes:FOOD_COUNTRY_CODES)
    .map(c=>String(c).toUpperCase().trim())
    .filter(Boolean);
  food.nutritionPer100g=food.nutritionPer100g||{
    calories:food.w?Math.round(food.kcal*100/food.w):food.kcal,
    protein:food.w?Math.round(food.p*100/food.w*10)/10:food.p,
    carbs:food.w?Math.round(food.c*100/food.w*10)/10:food.c,
    fat:food.w?Math.round(food.f*100/food.w*10)/10:food.f,
    fibre:food.w?Math.round((food.fi||0)*100/food.w*10)/10:(food.fi||0)
  };
  food.schemaVersion=food.schemaVersion||FOOD_SCHEMA_VERSION;
  return food;
}
FOODS.forEach(normaliseFood);

function normaliseCountryCode(countryCode){
  return String(countryCode||'').toUpperCase().trim();
}

function foodCountryCodes(food){
  return Array.isArray(food.countryCodes)&&food.countryCodes.length?food.countryCodes:FOOD_COUNTRY_CODES;
}

function normaliseFoodSearchText(text){
  return String(text||'')
    .toLowerCase()
    .replace(/&/g,' and ')
    .replace(/\byoghurt\b/g,'yogurt')
    .replace(/\byoghurts\b/g,'yogurts')
    .replace(/\bcourgettes?\b/g,'zucchini')
    .replace(/\baubergines?\b/g,'eggplant')
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .replace(/\s+/g,' ');
}

const UNSAFE_FOOD_MATCH_KEYS=new Set(['g','gram','grams','ml','slice','slices','scoop','scoops','serving','servings','piece','pieces']);
const SAFE_SHORT_FOOD_MATCH_KEYS=new Set(['pb']);
const FOOD_MATCH_IGNORED_WORDS=new Set([
  'of','some','a','an','the',
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'half','quarter',
  'slice','slices','piece','pieces','serving','servings','portion','portions',
  'scoop','scoops','cup','cups','tbsp','tsp','tablespoon','tablespoons','teaspoon','teaspoons',
  'small','medium','large','big','little','fresh','raw','cooked'
]);

function getFoodMatchKeys(food){
  const nameKey=normaliseFoodSearchText(food.name);
  const aliases=[...(food.aliases||[]),...(food.kw||[])]
    .map(normaliseFoodSearchText)
    .filter(term=>term&&(term.length>=4||SAFE_SHORT_FOOD_MATCH_KEYS.has(term))&&!UNSAFE_FOOD_MATCH_KEYS.has(term));
  return [...new Set([nameKey,...aliases].filter(Boolean))];
}

function foodMatchCountryScore(food,countryCode){
  const code=normaliseCountryCode(countryCode);
  const codes=foodCountryCodes(food);
  if(code&&code!=='GLOBAL'&&codes.includes(code)) return codes.includes('GLOBAL')?35:45;
  if(codes.includes('GLOBAL')) return 20;
  return 0;
}

function foodMatchTermScore(searchText,key){
  if(!searchText||!key) return 0;
  if(searchText===key) return 4000+key.length;
  return (` ${searchText} `).includes(` ${key} `)?2000+key.length:0;
}

function foodMatchTokens(text){
  return normaliseFoodSearchText(text).split(/\s+/).filter(Boolean);
}

function foodMatchCoverageScore(searchText,keys){
  const searchTokens=foodMatchTokens(searchText);
  if(searchTokens.length<2) return 0;
  const keyTokens=new Set(keys.flatMap(foodMatchTokens));
  return searchTokens.every(token=>keyTokens.has(token))?3000+searchText.length:0;
}

function foodMatchType(food,key,searchText){
  if(!food||!key||!searchText) return 'none';
  if(key==='__covered__') return 'covered-alias';
  if(searchText!==key) return 'partial';
  const nameKey=normaliseFoodSearchText(food.name);
  return key===nameKey?'exact-name':'exact-alias';
}

function foodMatchConfidence(match,competitors){
  if(!match) return 'none';
  if(['exact-name','exact-alias','covered-alias'].includes(match.matchType)) return 'high';
  const next=competitors.find(candidate=>candidate.food!==match.food);
  if(next&&next.score>=match.score-25) return 'low';
  return match.countryScore>=35?'medium':'low';
}

function foodMatchShouldConfirm(match,competitors){
  if(!match) return true;
  if(['exact-name','exact-alias','covered-alias'].includes(match.matchType)) return false;
  if(match.confidence!=='high') return true;
  const next=competitors.find(candidate=>candidate.food!==match.food);
  return !!(next&&next.score>=match.score-25);
}

function meaningfulFoodMatchText(text){
  return normaliseFoodSearchText(text)
    .split(/\s+/)
    .filter(token=>token&&!FOOD_MATCH_IGNORED_WORDS.has(token)&&!/^\d/.test(token))
    .join(' ');
}

function foodMatchCountryCode(countryCode){
  if(countryCode) return normaliseCountryCode(countryCode);
  if(typeof window!=='undefined'&&window.currentCountry) return normaliseCountryCode(window.currentCountry);
  if(typeof getUserCountry==='function') return normaliseCountryCode(getUserCountry());
  return 'GLOBAL';
}

function recentIngredientToFood(item){
  const name=String(item?.name||'').trim();
  const weight=Number(item?.weight)||Number(item?.serving?.grams)||0;
  if(!name||!weight) return null;
  return {
    id:'recent_'+foodIdFromName(name),
    name,
    w:Math.round(weight),
    kcal:Number(item.kcal)||0,
    p:Number(item.protein)||0,
    c:Number(item.carbs)||0,
    f:Number(item.fat)||0,
    fi:Number(item.fibre)||0,
    icon:item.icon||'ti-clipboard',
    type:item.type||'solid',
    aliases:[name],
    kw:[name],
    source:'recent_ingredient',
    countryCodes:FOOD_COUNTRY_CODES,
    nutritionPer100g:{
      calories:Math.round((Number(item.kcal)||0)*100/weight),
      protein:Math.round((Number(item.protein)||0)*100/weight*10)/10,
      carbs:Math.round((Number(item.carbs)||0)*100/weight*10)/10,
      fat:Math.round((Number(item.fat)||0)*100/weight*10)/10,
      fibre:Math.round((Number(item.fibre)||0)*100/weight*10)/10
    }
  };
}

function getRecentIngredientFoods(){
  if(typeof getRecentIngredients!=='function') return [];
  return getRecentIngredients().map(recentIngredientToFood).filter(Boolean);
}

function getFoodMatchFoods(countryCode,includeCustom=true){
  const code=foodMatchCountryCode(countryCode);
  const customFoods=includeCustom&&typeof getCustomFoods==='function'?getCustomFoods():[];
  const recentFoods=includeCustom?getRecentIngredientFoods():[];
  const baseFoods=getPreferredFoods(code);
  return [...recentFoods,...customFoods,...baseFoods];
}

function getFoodTextMatch(text,opts={}){
  const searchText=meaningfulFoodMatchText(text);
  if(!searchText) return null;
  const code=foodMatchCountryCode(opts.countryCode);
  const foods=Array.isArray(opts.foods)?opts.foods:getFoodMatchFoods(code,opts.includeCustom!==false);
  const candidates=[];
  foods.forEach((food,index)=>{
    const keys=getFoodMatchKeys(food);
    let bestKey='',bestTermScore=0;
    for(const key of keys){
      const termScore=foodMatchTermScore(searchText,key);
      if(termScore>bestTermScore){bestTermScore=termScore;bestKey=key;}
    }
    const coverageScore=foodMatchCoverageScore(searchText,keys);
    if(coverageScore>bestTermScore){bestTermScore=coverageScore;bestKey='__covered__';}
    if(!bestTermScore) return;
    const countryScore=foodMatchCountryScore(food,code);
    const score=bestTermScore+countryScore;
    candidates.push({food,key:bestKey,score,countryScore,index,matchType:foodMatchType(food,bestKey,searchText)});
  });
  candidates.sort((a,b)=>b.score-a.score||a.index-b.index);
  const best=candidates[0]||null;
  if(!best) return null;
  best.competitors=candidates.slice(1,5);
  best.confidence=foodMatchConfidence(best,candidates);
  best.shouldConfirm=foodMatchShouldConfirm(best,candidates);
  return best;
}

function resolveIngredientLocally(text,opts={}){
  const match=getFoodTextMatch(text,opts);
  if(!match){
    return {status:'unknown',food:null,confidence:'none',reason:'none',match:null};
  }
  const reason=match.matchType==='exact-name'
    ?'exact'
    :match.matchType==='exact-alias'
      ?'alias'
      :match.matchType==='covered-alias'
        ?'alias'
        :'fuzzy';
  const resolvedReason=match.food?.source==='recent_ingredient'||String(match.food?.id||'').startsWith('cf_')?'memory':reason;
  if(match.shouldConfirm){
    const options=[match.food,...(match.competitors||[]).map(c=>c.food)]
      .filter(Boolean)
      .filter((food,index,arr)=>arr.findIndex(f=>f.id===food.id||f.name===food.name)===index)
      .slice(0,4);
    return {
      status:'ambiguous',
      food:match.food,
      options,
      confidence:match.confidence,
      reason:resolvedReason,
      match,
      question:'Which one did you mean?'
    };
  }
  return {status:'matched',food:match.food,confidence:match.confidence,reason:resolvedReason,match};
}

function matchFoodByText(text,opts={}){
  const resolved=resolveIngredientLocally(text,opts);
  return resolved.status==='matched'||resolved.status==='ambiguous'?resolved.food:null;
}

function foodMatchesCountry(food,countryCode){
  const code=normaliseCountryCode(countryCode);
  const codes=foodCountryCodes(food);
  return codes.includes('GLOBAL')||(code&&codes.includes(code));
}

function isCountrySpecificFood(food,countryCode){
  const code=normaliseCountryCode(countryCode);
  const codes=foodCountryCodes(food);
  return !!code&&code!=='GLOBAL'&&codes.includes(code)&&!codes.includes('GLOBAL');
}

function globalFoods(){
  return FOODS.filter(food=>foodCountryCodes(food).includes('GLOBAL'));
}

function getFoodsForCountry(countryCode){
  const foods=FOODS.filter(food=>foodMatchesCountry(food,countryCode));
  const globals=globalFoods();
  return foods.length?foods:globals.length?globals:FOODS;
}

function getPreferredFoods(countryCode){
  const code=normaliseCountryCode(countryCode);
  const foods=getFoodsForCountry(code);
  if(!code||code==='GLOBAL') return foods.length?foods:FOODS;
  const countryFoods=foods.filter(food=>isCountrySpecificFood(food,code));
  if(!countryFoods.length) return foods.length?foods:FOODS;
  const countryKeys=new Set(countryFoods.flatMap(getFoodMatchKeys));
  const preferred=[
    ...countryFoods,
    ...foods.filter(food=>{
      if(countryFoods.includes(food)) return false;
      if(!foodCountryCodes(food).includes('GLOBAL')) return true;
      return !getFoodMatchKeys(food).some(key=>countryKeys.has(key));
    })
  ];
  return preferred.length?preferred:foods.length?foods:FOODS;
}

const AMBIG=[
  {trigger:['chicken'],  options:['Chicken breast','Chicken thigh'],      question:'Chicken breast or thigh?'},
  {trigger:['rice'],     options:['Brown rice','White rice'],              question:'Brown rice or white rice?'},
  {trigger:['fish'],     options:['Salmon','Tuna','Cod','Sea bass'],       question:'Which fish — salmon, tuna, cod or sea bass?'},
  {trigger:['tuna'],     options:['Tuna','Tuna canned'],                   question:'Fresh tuna or canned tuna?'},
  {trigger:['bread'],    options:['Bread','White bread','Rye bread'],      question:'Wholemeal, white or rye bread?'},
  {trigger:['milk'],     options:['Milk','Whole milk','Oat milk','Almond milk'], question:'Semi-skimmed, whole, oat or almond milk?'},
  {trigger:['pork'],     options:['Pork loin','Pork belly','Pork mince'], question:'Pork loin, belly or mince?'},
  {trigger:['lamb'],     options:['Lamb chops','Lamb mince'],              question:'Lamb chops or mince?'},
  {trigger:['turkey'],   options:['Turkey breast','Turkey mince'],         question:'Turkey breast or mince?'},
  {trigger:['yoghurt','yogurt'],options:['Greek yoghurt','Fat free Greek yoghurt','Full fat Greek yoghurt','Skyr'], question:'Which yoghurt — regular Greek, fat free, full fat, or skyr?'},
  {trigger:['beans'],    options:['Black beans','Kidney beans','Butter beans','Edamame'], question:'Black, kidney, butter beans or edamame?'},
];
