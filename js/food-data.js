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
  {name:'Chicken breast',  w:100,kcal:165,p:31,  c:0,   f:3.6, fi:0,   icon:'ti-meat',       kw:['chicken breast','chicken breasts','breast','grilled chicken breast'],quantityMode:'grams',defaultUnit:'breast',units:[{label:'breast',grams:170},{label:'g',grams:1}]},
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
  {name:'Egg',             w:50, kcal:78, p:6,   c:0.6, f:5,   fi:0,   icon:'ti-egg',        kw:['egg','eggs','whole egg','whole eggs','boiled egg','boiled eggs','scrambled egg','scrambled eggs','fried egg','fried eggs','poached egg','poached eggs'],quantityMode:'count',defaultUnit:'egg',units:[{label:'egg',grams:50},{label:'g',grams:1}]},
  {name:'Egg white',       w:33, kcal:17, p:3.6, c:0.2, f:0,   fi:0,   icon:'ti-egg',        kw:['egg white','egg whites','whites']},
  // Dairy
  {name:'Greek yoghurt',       w:100,kcal:59, p:10,  c:3.6, f:0.4, fi:0,   icon:'ti-glass',      kw:['greek yoghurt','greek yogurt','yoghurt','yogurt'],quantityMode:'grams'},
  {name:'Fat free Greek yoghurt',w:100,kcal:57, p:10,  c:4,   f:0.1, fi:0,   icon:'ti-glass',      kw:['fat free greek yogurt','fat free greek yoghurt','0% greek yogurt','0% greek yoghurt','0 percent greek yogurt','0 percent greek yoghurt','zero percent greek yogurt','nonfat greek yogurt','non fat greek yogurt','fat free yogurt','fat free yoghurt'],quantityMode:'grams'},
  {name:'Full fat Greek yoghurt',w:100,kcal:115,p:9,   c:3.8, f:7,   fi:0,   icon:'ti-glass',      kw:['full fat greek yogurt','full fat greek yoghurt','full fat yogurt','full fat yoghurt','5% greek yogurt','5% greek yoghurt','whole milk greek yogurt'],quantityMode:'grams'},
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
  {name:'Oats',            w:100,kcal:389,p:17,  c:66,  f:7,   fi:10,  icon:'ti-bowl-spoon', kw:['oats','oatmeal','porridge','rolled oats'],quantityMode:'grams',defaultUnit:'serving',units:[{label:'serving',grams:90},{label:'g',grams:1}]},
  {name:'Quinoa',          w:100,kcal:368,p:14,  c:64,  f:6,   fi:7,   icon:'ti-bowl-spoon', kw:['quinoa']},
  {name:'Couscous',        w:100,kcal:376,p:13,  c:73,  f:0.6, fi:5,   icon:'ti-bowl-spoon', kw:['couscous']},
  {name:'Barley',          w:100,kcal:354,p:10,  c:74,  f:2.3, fi:10,  icon:'ti-bowl-spoon', kw:['barley','pearl barley']},
  {name:'Bread',           w:35, kcal:79, p:3.5, c:14,  f:1,   fi:2,   icon:'ti-bread',      kw:['wholemeal bread','wholegrain bread','brown bread'],quantityMode:'slice',defaultUnit:'slice',units:[{label:'slice',grams:40,defaultQty:2},{label:'g',grams:1}]},
  {name:'White bread',     w:30, kcal:75, p:2.7, c:14,  f:0.9, fi:0.7, icon:'ti-bread',      kw:['white bread'],quantityMode:'slice',defaultUnit:'slice',units:[{label:'slice',grams:40,defaultQty:2},{label:'g',grams:1}]},
  {name:'Rye bread',       w:30, kcal:66, p:2.3, c:12,  f:0.6, fi:1.7, icon:'ti-bread',      kw:['rye bread','rye'],quantityMode:'slice',defaultUnit:'slice',units:[{label:'slice',grams:40,defaultQty:2},{label:'g',grams:1}]},
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
  {name:'Banana',          w:120,kcal:105,p:1.3, c:27,  f:0.4, fi:3.1, icon:'ti-apple',      kw:['banana'],quantityMode:'count',defaultUnit:'banana',units:[{label:'banana',grams:120},{label:'g',grams:1}]},
  {name:'Apple',           w:150,kcal:78, p:0.4, c:21,  f:0.2, fi:3.6, icon:'ti-apple',      kw:['apple'],quantityMode:'count',defaultUnit:'apple',units:[{label:'apple',grams:180},{label:'g',grams:1}]},
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
  {name:'Baked beans',     w:100,kcal:81, p:5,   c:15,  f:0.5, fi:3.8, icon:'ti-leaf',       kw:['baked beans','beans on toast','tinned baked beans'],countryCodes:['GB'],source:'cofid_2021',sourceId:'cofid:13-532',sourceDescription:'Baked beans, canned in tomato sauce',defaultUnit:'half tin',units:[{label:'half tin',grams:200},{label:'tin',grams:400},{label:'g',grams:1}],nutritionPer100g:{calories:81,protein:5,carbs:15,fat:0.5,fibre:3.8}},
  {name:'Crumpet',         w:55, kcal:97, p:3.6, c:19,  f:0.7, fi:1.3, icon:'ti-bread',      kw:['crumpet','crumpets'],countryCodes:['GB'],source:'curated',defaultUnit:'crumpet',units:[{label:'crumpet',grams:55,defaultQty:2},{label:'g',grams:1}],nutritionPer100g:{calories:176,protein:6.5,carbs:34.5,fat:1.3,fibre:2.4}},
  {name:'English muffin',  w:65, kcal:150,p:5.5, c:29,  f:1.5, fi:2,   icon:'ti-bread',      kw:['english muffin','breakfast muffin','muffin'],countryCodes:['GB'],source:'curated',defaultUnit:'muffin',units:[{label:'muffin',grams:65},{label:'g',grams:1}],nutritionPer100g:{calories:231,protein:8.5,carbs:44.6,fat:2.3,fibre:3.1}},
  {name:'Medium sliced bread',w:36,kcal:88,p:3.5,c:17,  f:0.9, fi:1.5, icon:'ti-bread',      kw:['medium sliced bread','toastie bread','bread slice','slice of bread','white medium bread','warburtons style bread'],countryCodes:['GB'],source:'curated',defaultUnit:'slice',units:[{label:'slice',grams:36,defaultQty:2},{label:'g',grams:1}],nutritionPer100g:{calories:244,protein:9.7,carbs:47.2,fat:2.5,fibre:4.2}},
  {name:'Bread roll',      w:70, kcal:190,p:7,   c:36,  f:2,   fi:2.5, icon:'ti-bread',      kw:['bread roll','bap','baps','roll','rolls','bread bun','bun','buns'],countryCodes:['GB'],source:'curated',defaultUnit:'roll',units:[{label:'roll',grams:70},{label:'g',grams:1}],nutritionPer100g:{calories:271,protein:10,carbs:51.4,fat:2.9,fibre:3.6}},
  {name:'Cheddar',         w:30, kcal:125,p:7.5, c:0.1, f:10.5,fi:0,   icon:'ti-cheese',     kw:['cheddar','cheddar cheese','mature cheddar','grated cheddar'],countryCodes:['GB'],source:'curated',defaultUnit:'slice',units:[{label:'slice',grams:25},{label:'matchbox',grams:30},{label:'g',grams:1}],nutritionPer100g:{calories:416,protein:25,carbs:0.5,fat:35,fibre:0}},
  {name:'Milk',            w:100,kcal:47, p:3.5, c:4.8, f:1.7, fi:0,   icon:'ti-glass',      kw:['milk','semi skimmed milk','semi-skimmed milk','semi skimmed','semi-skimmed'],type:'liquid',countryCodes:['GB'],source:'curated',defaultUnit:'ml',units:[{label:'ml',grams:1},{label:'pint',grams:568}],nutritionPer100g:{calories:47,protein:3.5,carbs:4.8,fat:1.7,fibre:0}},
  {name:'Greek yoghurt',   w:100,kcal:60, p:10,  c:3.8, f:0.4, fi:0,   icon:'ti-glass',      kw:['greek yoghurt','greek yogurt','natural greek yoghurt','natural greek yogurt'],countryCodes:['GB'],source:'curated',quantityMode:'grams',defaultUnit:'pot',units:[{label:'pot',grams:150},{label:'g',grams:1}],nutritionPer100g:{calories:60,protein:10,carbs:3.8,fat:0.4,fibre:0}},
  {name:'Porridge oats',   w:40, kcal:150,p:5.5, c:24,  f:3.2, fi:3.8, icon:'ti-bowl-spoon', kw:['porridge oats','porridge','rolled oats','oats'],countryCodes:['GB'],source:'curated',quantityMode:'grams',defaultUnit:'serving',units:[{label:'serving',grams:90},{label:'g',grams:1}],nutritionPer100g:{calories:375,protein:13.8,carbs:60,fat:8,fibre:9.5}},
  {name:'Digestive biscuit',w:15,kcal:72, p:1,   c:9.5, f:3.2, fi:0.5, icon:'ti-cookie',     kw:['digestive biscuit','digestive biscuits','digestive'],countryCodes:['GB'],source:'curated',defaultUnit:'biscuit',units:[{label:'biscuit',grams:15,defaultQty:2},{label:'g',grams:1}],nutritionPer100g:{calories:480,protein:6.7,carbs:63.3,fat:21.3,fibre:3.3}},
  {name:'Chocolate biscuit',w:18,kcal:90, p:1,   c:11,  f:4.5, fi:0.5, icon:'ti-cookie',     kw:['chocolate biscuit','chocolate biscuits','choc biscuit','choccy biscuit'],countryCodes:['GB'],source:'curated',defaultUnit:'biscuit',units:[{label:'biscuit',grams:18,defaultQty:2},{label:'g',grams:1}],nutritionPer100g:{calories:500,protein:5.6,carbs:61.1,fat:25,fibre:2.8}},
  {name:'Jacket potato',   w:250,kcal:232,p:6.3, c:53,  f:0.3, fi:5.5, icon:'ti-plant-2',    kw:['jacket potato','baked potato','jacket spud','spud'],countryCodes:['GB'],source:'curated',defaultUnit:'potato',units:[{label:'potato',grams:250},{label:'g',grams:1}],nutritionPer100g:{calories:93,protein:2.5,carbs:21.2,fat:0.1,fibre:2.2}},
  {name:'Chicken breast fillet',w:170,kcal:280,p:52.7,c:0,f:6.1,fi:0,  icon:'ti-meat',       kw:['chicken breast fillet','chicken fillet','chicken breast','skinless chicken breast fillet'],countryCodes:['GLOBAL','GB'],source:'curated',quantityMode:'grams',defaultUnit:'fillet',units:[{label:'fillet',grams:170},{label:'g',grams:1}],nutritionPer100g:{calories:165,protein:31,carbs:0,fat:3.6,fibre:0}},
  // Official USDA/CoFID expansion. US entries are also GLOBAL fallbacks; GB entries override them for UK users.
  {name:"Roast chicken",w:100,kcal:223,p:24,c:0,f:13.4,fi:0,icon:"ti-meat",kw:["roast chicken"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173635",sourceDescription:"Chicken, roasting, meat and skin, cooked, roasted",nutritionPer100g:{calories:223,protein:24,carbs:0,fat:13.4,fibre:0}},
  {name:"Roast chicken",w:100,kcal:177,p:27.3,c:0,f:7.5,fi:0,icon:"ti-meat",kw:["roast chicken"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:18-331",sourceDescription:"Chicken, meat, average, roasted",nutritionPer100g:{calories:177,protein:27.3,carbs:0,fat:7.5,fibre:0}},
  {name:"Turkey breast",w:100,kcal:155,p:21.9,c:0,f:7.5,fi:0,icon:"ti-meat",kw:["turkey breast"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171528",sourceDescription:"Turkey, retail parts, breast, meat and skin, raw",nutritionPer100g:{calories:155,protein:21.9,carbs:0,fat:7.5,fibre:0}},
  {name:"Turkey breast",w:100,kcal:155,p:35,c:0,f:1.7,fi:0,icon:"ti-meat",kw:["turkey breast"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:18-356",sourceDescription:"Turkey, breast, fillet, grilled, meat only",nutritionPer100g:{calories:155,protein:35,carbs:0,fat:1.7,fibre:0}},
  {name:"Duck breast",w:100,kcal:202,p:24.5,c:0,f:10.8,fi:0,icon:"ti-meat",kw:["duck breast"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171510",sourceDescription:"Duck, young duckling, domesticated, White Pekin, breast, meat and skin, boneless, cooked, roasted",nutritionPer100g:{calories:202,protein:24.5,carbs:0,fat:10.8,fibre:0}},
  {name:"Duck breast",w:100,kcal:388,p:13.1,c:0,f:37.3,fi:0,icon:"ti-meat",kw:["duck breast"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:18-371",sourceDescription:"Duck, raw, meat, fat and skin",nutritionPer100g:{calories:388,protein:13.1,carbs:0,fat:37.3,fibre:0}},
  {name:"Chicken liver",w:100,kcal:119,p:16.9,c:0.7,f:4.8,fi:0,icon:"ti-meat",kw:["chicken liver"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171060",sourceDescription:"Chicken, liver, all classes, raw",nutritionPer100g:{calories:119,protein:16.9,carbs:0.7,fat:4.8,fibre:0}},
  {name:"Chicken liver",w:100,kcal:92,p:17.7,c:0,f:2.3,fi:0,icon:"ti-meat",kw:["chicken liver"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:18-411",sourceDescription:"Liver, chicken, raw",nutritionPer100g:{calories:92,protein:17.7,carbs:0,fat:2.3,fibre:0}},
  {name:"Beef sirloin steak",w:100,kcal:214,p:19.9,c:0,f:14.3,fi:0,icon:"ti-meat",kw:["beef sirloin steak"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168728",sourceDescription:"Beef, top sirloin, steak, separable lean and fat, trimmed to 1/8\" fat, choice, raw",nutritionPer100g:{calories:214,protein:19.9,carbs:0,fat:14.3,fibre:0}},
  {name:"Beef sirloin steak",w:100,kcal:135,p:23.5,c:0,f:4.5,fi:0,icon:"ti-meat",kw:["beef sirloin steak"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:18-064",sourceDescription:"Beef, sirloin steak, raw, lean",nutritionPer100g:{calories:135,protein:23.5,carbs:0,fat:4.5,fibre:0}},
  {name:"Beef ribeye steak",w:100,kcal:241,p:18.7,c:0.2,f:18.4,fi:0,icon:"ti-meat",kw:["beef ribeye steak"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173403",sourceDescription:"Beef, rib eye steak, boneless, lip off, separable lean and fat, trimmed to 0\" fat, choice, raw",nutritionPer100g:{calories:241,protein:18.7,carbs:0.2,fat:18.4,fibre:0}},
  {name:"Beef ribeye steak",w:100,kcal:145,p:21.5,c:0,f:6.5,fi:0,icon:"ti-meat",kw:["beef ribeye steak"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:18-028",sourceDescription:"Beef, fore-rib/rib-roast, raw, lean",nutritionPer100g:{calories:145,protein:21.5,carbs:0,fat:6.5,fibre:0}},
  {name:"Beef rump steak",w:100,kcal:214,p:19.9,c:0,f:14.3,fi:0,icon:"ti-meat",kw:["beef rump steak"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168728",sourceDescription:"Beef, top sirloin, steak, separable lean and fat, trimmed to 1/8\" fat, choice, raw",nutritionPer100g:{calories:214,protein:19.9,carbs:0,fat:14.3,fibre:0}},
  {name:"Beef rump steak",w:100,kcal:125,p:22,c:0,f:4.1,fi:0,icon:"ti-meat",kw:["beef rump steak"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:18-043",sourceDescription:"Beef, rump steak, raw, lean",nutritionPer100g:{calories:125,protein:22,carbs:0,fat:4.1,fibre:0}},
  {name:"Beef burger patty",w:100,kcal:198,p:19.4,c:0,f:12.7,fi:0,icon:"ti-meat",kw:["beef burger patty"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168608",sourceDescription:"Beef, grass-fed, ground, raw",nutritionPer100g:{calories:198,protein:19.4,carbs:0,fat:12.7,fibre:0}},
  {name:"Beef burger patty",w:100,kcal:219,p:15.9,c:4.9,f:15.2,fi:0,icon:"ti-meat",kw:["beef burger patty"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:19-651",sourceDescription:"Burger, beef, 62-85% beef, raw",nutritionPer100g:{calories:219,protein:15.9,carbs:4.9,fat:15.2,fibre:0}},
  {name:"Pork chop",w:100,kcal:155,p:21.6,c:0,f:6.9,fi:0,icon:"ti-meat",kw:["pork chop"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:167839",sourceDescription:"Pork, fresh, loin, top loin (chops), boneless, separable lean and fat, raw",nutritionPer100g:{calories:155,protein:21.6,carbs:0,fat:6.9,fibre:0}},
  {name:"Pork chop",w:100,kcal:194,p:35.1,c:0,f:5.9,fi:0,icon:"ti-meat",kw:["pork chop"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:18-534",sourceDescription:"Pork, loin chops, grilled, lean",nutritionPer100g:{calories:194,protein:35.1,carbs:0,fat:5.9,fibre:0}},
  {name:"Pork tenderloin",w:100,kcal:120,p:20.6,c:0,f:3.5,fi:0,icon:"ti-meat",kw:["pork tenderloin"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168312",sourceDescription:"Pork, fresh, loin, tenderloin, separable lean and fat, raw",nutritionPer100g:{calories:120,protein:20.6,carbs:0,fat:3.5,fibre:0}},
  {name:"Pork tenderloin",w:100,kcal:96,p:22.8,c:0,f:0.5,fi:0,icon:"ti-meat",kw:["pork tenderloin"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:18-510",sourceDescription:"Pork, fillet medallions, raw, lean",nutritionPer100g:{calories:96,protein:22.8,carbs:0,fat:0.5,fibre:0}},
  {name:"Pork shoulder",w:100,kcal:236,p:17.2,c:0,f:18,fi:0,icon:"ti-meat",kw:["pork shoulder"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:167843",sourceDescription:"Pork, fresh, shoulder, whole, separable lean and fat, raw",nutritionPer100g:{calories:236,protein:17.2,carbs:0,fat:18,fibre:0}},
  {name:"Pork shoulder",w:100,kcal:121,p:20.8,c:0,f:4.2,fi:0,icon:"ti-meat",kw:["pork shoulder"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:18-601",sourceDescription:"Pork, hand, shoulder joint, raw, lean",nutritionPer100g:{calories:121,protein:20.8,carbs:0,fat:4.2,fibre:0}},
  {name:"Salami",w:100,kcal:261,p:12.6,c:1.9,f:22.2,fi:0,icon:"ti-meat",kw:["salami"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172935",sourceDescription:"Salami, cooked, beef",nutritionPer100g:{calories:261,protein:12.6,carbs:1.9,fat:22.2,fibre:0}},
  {name:"Salami",w:100,kcal:438,p:20.9,c:0.5,f:39.2,fi:0.1,icon:"ti-meat",kw:["salami"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:19-517",sourceDescription:"Salami",nutritionPer100g:{calories:438,protein:20.9,carbs:0.5,fat:39.2,fibre:0.1}},
  {name:"Chorizo",w:100,kcal:296,p:13.6,c:3.8,f:25.1,fi:0,icon:"ti-meat",kw:["chorizo"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173859",sourceDescription:"Sausage, pork, chorizo, link or ground, raw",nutritionPer100g:{calories:296,protein:13.6,carbs:3.8,fat:25.1,fibre:0}},
  {name:"Chorizo",w:100,kcal:395,p:24,c:2.4,f:32.2,fi:0,icon:"ti-meat",kw:["chorizo"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:19-516",sourceDescription:"Chorizo",nutritionPer100g:{calories:395,protein:24,carbs:2.4,fat:32.2,fibre:0}},
  {name:"Lamb leg",w:100,kcal:272,p:16.9,c:0,f:22.1,fi:0,icon:"ti-meat",kw:["lamb leg"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172488",sourceDescription:"Lamb, leg, sirloin half, separable lean and fat, trimmed to 1/4\" fat, choice, raw",nutritionPer100g:{calories:272,protein:16.9,carbs:0,fat:22.1,fibre:0}},
  {name:"Lamb leg",w:100,kcal:160,p:15,c:0,f:11.1,fi:0,icon:"ti-meat",kw:["lamb leg"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:18-190",sourceDescription:"Lamb, New Zealand, leg, whole, frozen, raw, lean and fat, weighed with bone",nutritionPer100g:{calories:160,protein:15,carbs:0,fat:11.1,fibre:0}},
  {name:"Lamb shoulder",w:100,kcal:272,p:16.2,c:0.2,f:22.9,fi:0,icon:"ti-meat",kw:["lamb shoulder"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:175262",sourceDescription:"Lamb, New Zealand, imported, square-cut shoulder, separable lean and fat, raw",nutritionPer100g:{calories:272,protein:16.2,carbs:0.2,fat:22.9,fibre:0}},
  {name:"Lamb shoulder",w:100,kcal:235,p:17.6,c:0,f:18.3,fi:0,icon:"ti-meat",kw:["lamb shoulder"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:18-170",sourceDescription:"Lamb, shoulder, raw, lean and fat",nutritionPer100g:{calories:235,protein:17.6,carbs:0,fat:18.3,fibre:0}},
  {name:"Veal",w:100,kcal:197,p:18.6,c:0,f:13.1,fi:0,icon:"ti-meat",kw:["veal"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:175290",sourceDescription:"Veal, ground, raw",nutritionPer100g:{calories:197,protein:18.6,carbs:0,fat:13.1,fibre:0}},
  {name:"Veal",w:100,kcal:106,p:22.7,c:0,f:1.7,fi:0,icon:"ti-meat",kw:["veal"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:18-486",sourceDescription:"Veal, escalope, raw",nutritionPer100g:{calories:106,protein:22.7,carbs:0,fat:1.7,fibre:0}},
  {name:"Trout",w:100,kcal:141,p:19.9,c:0,f:6.2,fi:0,icon:"ti-fish",kw:["trout"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173717",sourceDescription:"Fish, trout, rainbow, farmed, raw",nutritionPer100g:{calories:141,protein:19.9,carbs:0,fat:6.2,fibre:0}},
  {name:"Trout",w:100,kcal:112,p:19.4,c:0,f:3.8,fi:0,icon:"ti-fish",kw:["trout"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:16-224",sourceDescription:"Trout, brown, raw",nutritionPer100g:{calories:112,protein:19.4,carbs:0,fat:3.8,fibre:0}},
  {name:"Smoked salmon",w:100,kcal:117,p:18.3,c:0,f:4.3,fi:0,icon:"ti-fish",kw:["smoked salmon"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173687",sourceDescription:"Fish, salmon, chinook, smoked",nutritionPer100g:{calories:117,protein:18.3,carbs:0,fat:4.3,fibre:0}},
  {name:"Smoked salmon",w:100,kcal:184,p:22.8,c:0.5,f:10.1,fi:0,icon:"ti-fish",kw:["smoked salmon"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:16-412",sourceDescription:"Salmon, smoked (cold-smoked)",nutritionPer100g:{calories:184,protein:22.8,carbs:0.5,fat:10.1,fibre:0}},
  {name:"Canned salmon",w:100,kcal:153,p:20.6,c:0,f:7.2,fi:0,icon:"ti-fish",kw:["canned salmon"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:175174",sourceDescription:"Salmon, sockeye, canned, total can contents",nutritionPer100g:{calories:153,protein:20.6,carbs:0,fat:7.2,fibre:0}},
  {name:"Canned salmon",w:100,kcal:138,p:23.6,c:0,f:4.8,fi:0,icon:"ti-fish",kw:["canned salmon"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:16-420",sourceDescription:"Salmon, pink, canned in brine, drained",nutritionPer100g:{calories:138,protein:23.6,carbs:0,fat:4.8,fibre:0}},
  {name:"Fish fingers",w:100,kcal:277,p:11,c:21.7,f:16.2,fi:1.5,icon:"ti-fish",kw:["fish fingers"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174195",sourceDescription:"Fish, fish sticks, frozen, prepared",nutritionPer100g:{calories:277,protein:11,carbs:21.7,fat:16.2,fibre:1.5}},
  {name:"Fish fingers",w:100,kcal:223,p:14.3,c:22,f:9.2,fi:1.6,icon:"ti-fish",kw:["fish fingers"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:16-405",sourceDescription:"Fish fingers, cod, grilled/baked",nutritionPer100g:{calories:223,protein:14.3,carbs:22,fat:9.2,fibre:1.6}},
  {name:"Anchovies",w:100,kcal:210,p:28.9,c:0,f:9.7,fi:0,icon:"ti-fish",kw:["anchovies"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174183",sourceDescription:"Fish, anchovy, european, canned in oil, drained solids",nutritionPer100g:{calories:210,protein:28.9,carbs:0,fat:9.7,fibre:0}},
  {name:"Anchovies",w:100,kcal:191,p:25.2,c:0,f:10,fi:0,icon:"ti-fish",kw:["anchovies"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:16-448",sourceDescription:"Anchovies, canned in oil, drained",nutritionPer100g:{calories:191,protein:25.2,carbs:0,fat:10,fibre:0}},
  {name:"Mussels",w:100,kcal:86,p:11.9,c:3.7,f:2.2,fi:0,icon:"ti-fish",kw:["mussels"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174216",sourceDescription:"Mollusks, mussel, blue, raw",nutritionPer100g:{calories:86,protein:11.9,carbs:3.7,fat:2.2,fibre:0}},
  {name:"Mussels",w:100,kcal:74,p:12.1,c:2.5,f:1.8,fi:0,icon:"ti-fish",kw:["mussels"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:16-497",sourceDescription:"Mussels, raw",nutritionPer100g:{calories:74,protein:12.1,carbs:2.5,fat:1.8,fibre:0}},
  {name:"Scallops",w:100,kcal:111,p:20.5,c:5.4,f:0.8,fi:0,icon:"ti-fish",kw:["scallops"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:167742",sourceDescription:"Mollusks, scallop, (bay and sea), cooked, steamed",nutritionPer100g:{calories:111,protein:20.5,carbs:5.4,fat:0.8,fibre:0}},
  {name:"Scallops",w:100,kcal:118,p:23.2,c:3.4,f:1.4,fi:0,icon:"ti-fish",kw:["scallops"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:16-262",sourceDescription:"Scallops, steamed",nutritionPer100g:{calories:118,protein:23.2,carbs:3.4,fat:1.4,fibre:0}},
  {name:"Squid",w:100,kcal:92,p:15.6,c:3.1,f:1.4,fi:0,icon:"ti-fish",kw:["squid"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174223",sourceDescription:"Mollusks, squid, mixed species, raw",nutritionPer100g:{calories:92,protein:15.6,carbs:3.1,fat:1.4,fibre:0}},
  {name:"Squid",w:100,kcal:81,p:15.4,c:1.2,f:1.7,fi:0,icon:"ti-fish",kw:["squid"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:16-263",sourceDescription:"Squid, raw",nutritionPer100g:{calories:81,protein:15.4,carbs:1.2,fat:1.7,fibre:0}},
  {name:"Oysters",w:100,kcal:81,p:9.4,c:5,f:2.3,fi:0,icon:"ti-fish",kw:["oysters"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174219",sourceDescription:"Mollusks, oyster, Pacific, raw",nutritionPer100g:{calories:81,protein:9.4,carbs:5,fat:2.3,fibre:0}},
  {name:"Oysters",w:100,kcal:65,p:10.8,c:2.7,f:1.3,fi:0,icon:"ti-fish",kw:["oysters"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:16-260",sourceDescription:"Oysters, raw",nutritionPer100g:{calories:65,protein:10.8,carbs:2.7,fat:1.3,fibre:0}},
  {name:"Feta",w:100,kcal:265,p:14.2,c:3.9,f:21.5,fi:0,icon:"ti-cheese",kw:["feta"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173420",sourceDescription:"Cheese, feta",nutritionPer100g:{calories:265,protein:14.2,carbs:3.9,fat:21.5,fibre:0}},
  {name:"Feta",w:100,kcal:250,p:15.6,c:1.5,f:20.2,fi:0,icon:"ti-cheese",kw:["feta"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:12-525",sourceDescription:"Cheese, Feta",nutritionPer100g:{calories:250,protein:15.6,carbs:1.5,fat:20.2,fibre:0}},
  {name:"Brie",w:100,kcal:334,p:20.8,c:0.5,f:27.7,fi:0,icon:"ti-cheese",kw:["brie"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172177",sourceDescription:"Cheese, brie",nutritionPer100g:{calories:334,protein:20.8,carbs:0.5,fat:27.7,fibre:0}},
  {name:"Brie",w:100,kcal:343,p:20.3,c:0,f:29.1,fi:0,icon:"ti-cheese",kw:["brie"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:12-344",sourceDescription:"Cheese, Brie, with outer rind removed",nutritionPer100g:{calories:343,protein:20.3,carbs:0,fat:29.1,fibre:0}},
  {name:"Blue cheese",w:100,kcal:353,p:21.4,c:2.3,f:28.7,fi:0,icon:"ti-cheese",kw:["blue cheese"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172175",sourceDescription:"Cheese, blue",nutritionPer100g:{calories:353,protein:21.4,carbs:2.3,fat:28.7,fibre:0}},
  {name:"Blue cheese",w:100,kcal:342,p:20.5,c:0,f:28.9,fi:0,icon:"ti-cheese",kw:["blue cheese"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:12-354",sourceDescription:"Cheese, Danish blue",nutritionPer100g:{calories:342,protein:20.5,carbs:0,fat:28.9,fibre:0}},
  {name:"Ricotta",w:100,kcal:150,p:7.5,c:7.3,f:10.2,fi:0,icon:"ti-cheese",kw:["ricotta"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170851",sourceDescription:"Cheese, ricotta, whole milk",nutritionPer100g:{calories:150,protein:7.5,carbs:7.3,fat:10.2,fibre:0}},
  {name:"Ricotta",w:100,kcal:144,p:9.4,c:2,f:11,fi:0,icon:"ti-cheese",kw:["ricotta"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:12-176",sourceDescription:"Cheese, Ricotta",nutritionPer100g:{calories:144,protein:9.4,carbs:2,fat:11,fibre:0}},
  {name:"Goats cheese",w:100,kcal:452,p:30.5,c:2.2,f:35.6,fi:0,icon:"ti-cheese",kw:["goats cheese"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172197",sourceDescription:"Cheese, goat, hard type",nutritionPer100g:{calories:452,protein:30.5,carbs:2.2,fat:35.6,fibre:0}},
  {name:"Goats cheese",w:100,kcal:320,p:21.1,c:1,f:25.8,fi:0,icon:"ti-cheese",kw:["goats cheese"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:12-357",sourceDescription:"Cheese, goats milk, full fat, soft, white rind",nutritionPer100g:{calories:320,protein:21.1,carbs:1,fat:25.8,fibre:0}},
  {name:"Soya milk",w:100,kcal:33,p:2.9,c:1.7,f:1.6,fi:0.5,icon:"ti-glass",kw:["soy milk","soya milk"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:175215",sourceDescription:"Soymilk (all flavors), unsweetened, with added calcium, vitamins A and D",type:"liquid",nutritionPer100g:{calories:33,protein:2.9,carbs:1.7,fat:1.6,fibre:0.5}},
  {name:"Soya milk",w:100,kcal:26,p:2.4,c:0.5,f:1.6,fi:0.2,icon:"ti-glass",kw:["soy milk","soya milk"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:12-524",sourceDescription:"Milk, soya, non-dairy alternative to milk, unsweetened, fortified",type:"liquid",nutritionPer100g:{calories:26,protein:2.4,carbs:0.5,fat:1.6,fibre:0.2}},
  {name:"Goat milk",w:100,kcal:69,p:3.6,c:4.5,f:4.1,fi:0,icon:"ti-glass",kw:["goat milk"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171278",sourceDescription:"Milk, goat, fluid, with added vitamin D",type:"liquid",nutritionPer100g:{calories:69,protein:3.6,carbs:4.5,fat:4.1,fibre:0}},
  {name:"Goat milk",w:100,kcal:62,p:3.1,c:4.4,f:3.7,fi:0,icon:"ti-glass",kw:["goat milk"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:12-328",sourceDescription:"Milk, goats, pasteurised",type:"liquid",nutritionPer100g:{calories:62,protein:3.1,carbs:4.4,fat:3.7,fibre:0}},
  {name:"Single cream",w:100,kcal:131,p:3.1,c:4.3,f:11.5,fi:0,icon:"ti-glass",kw:["single cream"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171255",sourceDescription:"Cream, fluid, half and half",nutritionPer100g:{calories:131,protein:3.1,carbs:4.3,fat:11.5,fibre:0}},
  {name:"Single cream",w:100,kcal:193,p:3.3,c:2.2,f:19.1,fi:0,icon:"ti-glass",kw:["single cream"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:12-332",sourceDescription:"Cream, fresh, single",nutritionPer100g:{calories:193,protein:3.3,carbs:2.2,fat:19.1,fibre:0}},
  {name:"Double cream",w:100,kcal:340,p:2.8,c:2.8,f:36.1,fi:0,icon:"ti-glass",kw:["double cream"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170859",sourceDescription:"Cream, fluid, heavy whipping",nutritionPer100g:{calories:340,protein:2.8,carbs:2.8,fat:36.1,fibre:0}},
  {name:"Double cream",w:100,kcal:496,p:1.6,c:1.7,f:53.7,fi:0,icon:"ti-glass",kw:["double cream"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:12-334",sourceDescription:"Cream, fresh, double, including Jersey cream",nutritionPer100g:{calories:496,protein:1.6,carbs:1.7,fat:53.7,fibre:0}},
  {name:"Plain yoghurt",w:100,kcal:63,p:5.2,c:7,f:1.6,fi:0,icon:"ti-glass",kw:["plain yoghurt","plain yogurt"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170886",sourceDescription:"Yogurt, plain, low fat",nutritionPer100g:{calories:63,protein:5.2,carbs:7,fat:1.6,fibre:0}},
  {name:"Plain yoghurt",w:100,kcal:57,p:4.8,c:7.8,f:1,fi:0,icon:"ti-glass",kw:["plain yoghurt","plain yogurt"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:12-379",sourceDescription:"Yogurt, low fat, plain",nutritionPer100g:{calories:57,protein:4.8,carbs:7.8,fat:1,fibre:0}},
  {name:"Whole milk yoghurt",w:100,kcal:61,p:3.5,c:4.7,f:3.2,fi:0,icon:"ti-glass",kw:["whole milk yoghurt","whole milk yogurt"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171284",sourceDescription:"Yogurt, plain, whole milk",nutritionPer100g:{calories:61,protein:3.5,carbs:4.7,fat:3.2,fibre:0}},
  {name:"Whole milk yoghurt",w:100,kcal:79,p:5.7,c:7.8,f:3,fi:0,icon:"ti-glass",kw:["whole milk yoghurt","whole milk yogurt"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:12-184",sourceDescription:"Yogurt, whole milk, plain",nutritionPer100g:{calories:79,protein:5.7,carbs:7.8,fat:3,fibre:0}},
  {name:"Porridge, cooked",w:100,kcal:71,p:2.5,c:12,f:1.5,fi:1.7,icon:"ti-bowl-spoon",kw:["porridge, cooked"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173905",sourceDescription:"Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt",nutritionPer100g:{calories:71,protein:2.5,carbs:12,fat:1.5,fibre:1.7}},
  {name:"Porridge, cooked",w:100,kcal:84,p:4.6,c:12.1,f:2.3,fi:0.9,icon:"ti-bowl-spoon",kw:["porridge, cooked"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-789",sourceDescription:"Porridge oats, unfortified, cooked, made up with semi-skimmed milk",nutritionPer100g:{calories:84,protein:4.6,carbs:12.1,fat:2.3,fibre:0.9}},
  {name:"White rice, cooked",w:100,kcal:97,p:2,c:21.1,f:0.2,fi:1,icon:"ti-bowl-spoon",kw:["rice","white rice, cooked"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169711",sourceDescription:"Rice, white, glutinous, unenriched, cooked",nutritionPer100g:{calories:97,protein:2,carbs:21.1,fat:0.2,fibre:1}},
  {name:"White rice, cooked",w:100,kcal:117,p:2.8,c:26.5,f:0.7,fi:0.6,icon:"ti-bowl-spoon",kw:["rice","white rice, cooked"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-858",sourceDescription:"Rice, white, basmati, boiled in unsalted water",nutritionPer100g:{calories:117,protein:2.8,carbs:26.5,fat:0.7,fibre:0.6}},
  {name:"Brown rice, cooked",w:100,kcal:112,p:2.3,c:23.5,f:0.8,fi:1.8,icon:"ti-bowl-spoon",kw:["brown rice","brown rice, cooked"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168875",sourceDescription:"Rice, brown, medium-grain, cooked (Includes foods for USDA's Food Distribution Program)",nutritionPer100g:{calories:112,protein:2.3,carbs:23.5,fat:0.8,fibre:1.8}},
  {name:"Brown rice, cooked",w:100,kcal:131,p:3.3,c:28.7,f:1.1,fi:0.8,icon:"ti-bowl-spoon",kw:["brown rice","brown rice, cooked"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-867",sourceDescription:"Rice, brown, basmati, boiled in unsalted water",nutritionPer100g:{calories:131,protein:3.3,carbs:28.7,fat:1.1,fibre:0.8}},
  {name:"Basmati rice, cooked",w:100,kcal:130,p:2.7,c:28.2,f:0.3,fi:0.4,icon:"ti-bowl-spoon",kw:["basmati rice, cooked"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168878",sourceDescription:"Rice, white, long-grain, regular, enriched, cooked",nutritionPer100g:{calories:130,protein:2.7,carbs:28.2,fat:0.3,fibre:0.4}},
  {name:"Basmati rice, cooked",w:100,kcal:117,p:2.8,c:26.5,f:0.7,fi:0.6,icon:"ti-bowl-spoon",kw:["basmati rice, cooked"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-858",sourceDescription:"Rice, white, basmati, boiled in unsalted water",nutritionPer100g:{calories:117,protein:2.8,carbs:26.5,fat:0.7,fibre:0.6}},
  {name:"Pasta, cooked",w:100,kcal:130,p:5.3,c:23.5,f:1.7,fi:0,icon:"ti-bowl-spoon",kw:["pasta, cooked"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168901",sourceDescription:"Pasta, homemade, made with egg, cooked",nutritionPer100g:{calories:130,protein:5.3,carbs:23.5,fat:1.7,fibre:0}},
  {name:"Pasta, cooked",w:100,kcal:159,p:6.6,c:31.8,f:1.5,fi:1.9,icon:"ti-bowl-spoon",kw:["pasta, cooked"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-450",sourceDescription:"Pasta, plain, fresh, boiled",nutritionPer100g:{calories:159,protein:6.6,carbs:31.8,fat:1.5,fibre:1.9}},
  {name:"Spaghetti, cooked",w:100,kcal:130,p:4.6,c:26.1,f:0.6,fi:0,icon:"ti-bowl-spoon",kw:["spaghetti, cooked"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168912",sourceDescription:"Spaghetti, spinach, cooked",nutritionPer100g:{calories:130,protein:4.6,carbs:26.1,fat:0.6,fibre:0}},
  {name:"Spaghetti, cooked",w:100,kcal:141,p:4.4,c:31.5,f:0.6,fi:1.5,icon:"ti-bowl-spoon",kw:["spaghetti, cooked"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-722",sourceDescription:"Pasta, white, spaghetti, dried, boiled in unsalted water",nutritionPer100g:{calories:141,protein:4.4,carbs:31.5,fat:0.6,fibre:1.5}},
  {name:"Egg noodles, cooked",w:100,kcal:138,p:4.5,c:25.2,f:2.1,fi:1.2,icon:"ti-bowl-spoon",kw:["egg noodles, cooked"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169732",sourceDescription:"Noodles, egg, enriched, cooked",nutritionPer100g:{calories:138,protein:4.5,carbs:25.2,fat:2.1,fibre:1.2}},
  {name:"Egg noodles, cooked",w:100,kcal:129,p:4.7,c:27.5,f:0.8,fi:1.7,icon:"ti-bowl-spoon",kw:["egg noodles, cooked"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-941",sourceDescription:"Noodles, egg, fine, dried, boiled in unsalted water",nutritionPer100g:{calories:129,protein:4.7,carbs:27.5,fat:0.8,fibre:1.7}},
  {name:"Couscous, cooked",w:100,kcal:112,p:3.8,c:23.2,f:0.2,fi:1.4,icon:"ti-bowl-spoon",kw:["couscous, cooked"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169700",sourceDescription:"Couscous, cooked",nutritionPer100g:{calories:112,protein:3.8,carbs:23.2,fat:0.2,fibre:1.4}},
  {name:"Couscous, cooked",w:100,kcal:178,p:7.2,c:37.5,f:1,fi:1.9,icon:"ti-bowl-spoon",kw:["couscous, cooked"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-902",sourceDescription:"Couscous, plain, cooked",nutritionPer100g:{calories:178,protein:7.2,carbs:37.5,fat:1,fibre:1.9}},
  {name:"Barley, cooked",w:100,kcal:123,p:2.3,c:28.2,f:0.4,fi:3.8,icon:"ti-bowl-spoon",kw:["barley, cooked"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170285",sourceDescription:"Barley, pearled, cooked",nutritionPer100g:{calories:123,protein:2.3,carbs:28.2,fat:0.4,fibre:3.8}},
  {name:"Barley, cooked",w:100,kcal:120,p:2.7,c:27.6,f:0.6,fi:0,icon:"ti-bowl-spoon",kw:["barley, cooked"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-003",sourceDescription:"Barley, pearl, boiled",nutritionPer100g:{calories:120,protein:2.7,carbs:27.6,fat:0.6,fibre:0}},
  {name:"Cornflakes",w:100,kcal:384,p:5.9,c:88,f:0.9,fi:2.7,icon:"ti-bowl-spoon",kw:["cornflakes"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174648",sourceDescription:"Cereals ready-to-eat, RALSTON Corn Flakes",nutritionPer100g:{calories:384,protein:5.9,carbs:88,fat:0.9,fibre:2.7}},
  {name:"Cornflakes",w:100,kcal:376,p:7.1,c:90.9,f:0.8,fi:1.8,icon:"ti-bowl-spoon",kw:["cornflakes"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-742",sourceDescription:"Breakfast cereal, cornflakes, fortified",nutritionPer100g:{calories:376,protein:7.1,carbs:90.9,fat:0.8,fibre:1.8}},
  {name:"Shredded wheat",w:100,kcal:348,p:11.2,c:81,f:2,fi:11.8,icon:"ti-bowl-spoon",kw:["shredded wheat"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172987",sourceDescription:"Cereals ready-to-eat, QUAKER, Shredded Wheat, bagged cereal",nutritionPer100g:{calories:348,protein:11.2,carbs:81,fat:2,fibre:11.8}},
  {name:"Shredded wheat",w:100,kcal:333,p:10.9,c:71.2,f:2.5,fi:10.5,icon:"ti-bowl-spoon",kw:["shredded wheat"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-775",sourceDescription:"Breakfast cereal, shredded wheat type, unfortified",nutritionPer100g:{calories:333,protein:10.9,carbs:71.2,fat:2.5,fibre:10.5}},
  {name:"Weetabix",w:100,kcal:337,p:11.4,c:79,f:2,fi:12.4,icon:"ti-bowl-spoon",kw:["weetabix"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173910",sourceDescription:"Cereals ready-to-eat, POST, Shredded Wheat, original big biscuit",nutritionPer100g:{calories:337,protein:11.4,carbs:79,fat:2,fibre:12.4}},
  {name:"Weetabix",w:100,kcal:332,p:10.5,c:72.7,f:1.9,fi:7.3,icon:"ti-bowl-spoon",kw:["weetabix"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-773",sourceDescription:"Breakfast cereal, wheat biscuits, Weetabix type, fortified",nutritionPer100g:{calories:332,protein:10.5,carbs:72.7,fat:1.9,fibre:7.3}},
  {name:"Wholemeal bread",w:100,kcal:252,p:12.4,c:42.7,f:3.5,fi:6,icon:"ti-bread",kw:["whole wheat bread","wholemeal bread"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172688",sourceDescription:"Bread, whole-wheat, commercially prepared",nutritionPer100g:{calories:252,protein:12.4,carbs:42.7,fat:3.5,fibre:6}},
  {name:"Wholemeal bread",w:100,kcal:217,p:9.4,c:42,f:2.5,fi:5,icon:"ti-bread",kw:["whole wheat bread","wholemeal bread"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-981",sourceDescription:"Bread, wholemeal, average",nutritionPer100g:{calories:217,protein:9.4,carbs:42,fat:2.5,fibre:5}},
  {name:"Pitta bread",w:100,kcal:275,p:9.1,c:55.7,f:1.2,fi:2.2,icon:"ti-bread",kw:["pita bread","pitta bread"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172816",sourceDescription:"Bread, pita, white, unenriched",nutritionPer100g:{calories:275,protein:9.1,carbs:55.7,fat:1.2,fibre:2.2}},
  {name:"Pitta bread",w:100,kcal:255,p:9.1,c:55.1,f:1.3,fi:2.4,icon:"ti-bread",kw:["pita bread","pitta bread"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-974",sourceDescription:"Bread, pitta, white",nutritionPer100g:{calories:255,protein:9.1,carbs:55.1,fat:1.3,fibre:2.4}},
  {name:"Naan bread",w:100,kcal:291,p:9.6,c:50.4,f:5.7,fi:2.2,icon:"ti-bread",kw:["naan bread"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171845",sourceDescription:"Bread, naan, plain, commercially prepared, refrigerated",nutritionPer100g:{calories:291,protein:9.6,carbs:50.4,fat:5.7,fibre:2.2}},
  {name:"Naan bread",w:100,kcal:285,p:7.8,c:50.2,f:7.3,fi:2,icon:"ti-bread",kw:["naan bread"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-973",sourceDescription:"Bread, naan, retail",nutritionPer100g:{calories:285,protein:7.8,carbs:50.2,fat:7.3,fibre:2}},
  {name:"Croissant",w:100,kcal:406,p:8.2,c:45.8,f:21,fi:2.6,icon:"ti-bread",kw:["croissant"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174987",sourceDescription:"Croissants, butter",nutritionPer100g:{calories:406,protein:8.2,carbs:45.8,fat:21,fibre:2.6}},
  {name:"Croissant",w:100,kcal:373,p:8.3,c:43.3,f:19.7,fi:1.6,icon:"ti-bread",kw:["croissant"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-988",sourceDescription:"Croissants",nutritionPer100g:{calories:373,protein:8.3,carbs:43.3,fat:19.7,fibre:1.6}},
  {name:"Pancake",w:100,kcal:227,p:6.4,c:28.3,f:9.7,fi:0,icon:"ti-bread",kw:["pancake"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:175009",sourceDescription:"Pancakes, plain, prepared from recipe",nutritionPer100g:{calories:227,protein:6.4,carbs:28.3,fat:9.7,fibre:0}},
  {name:"Pancake",w:100,kcal:234,p:6.3,c:37.9,f:7.4,fi:0.9,icon:"ti-bread",kw:["pancake"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-1141",sourceDescription:"Pancakes, sweet, made with skimmed milk, homemade",nutritionPer100g:{calories:234,protein:6.3,carbs:37.9,fat:7.4,fibre:0.9}},
  {name:"Baked beans",w:100,kcal:94,p:4.8,c:21.1,f:0.4,fi:4.1,icon:"ti-leaf",kw:["baked beans"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:175182",sourceDescription:"Beans, baked, canned, plain or vegetarian",nutritionPer100g:{calories:94,protein:4.8,carbs:21.1,fat:0.4,fibre:4.1}},
  {name:"Cannellini beans",w:100,kcal:114,p:7.3,c:21.2,f:0.3,fi:4.8,icon:"ti-leaf",kw:["cannellini beans"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:175204",sourceDescription:"Beans, white, mature seeds, canned",nutritionPer100g:{calories:114,protein:7.3,carbs:21.2,fat:0.3,fibre:4.8}},
  {name:"Cannellini beans",w:100,kcal:104,p:7.6,c:15.9,f:1.6,fi:6.1,icon:"ti-leaf",kw:["cannellini beans"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-666",sourceDescription:"Beans, cannellini, canned, re-heated, drained",nutritionPer100g:{calories:104,protein:7.6,carbs:15.9,fat:1.6,fibre:6.1}},
  {name:"Black eyed beans",w:100,kcal:117,p:8.1,c:20.3,f:0.7,fi:3.6,icon:"ti-leaf",kw:["black eyed beans"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:175209",sourceDescription:"Cowpeas, catjang, mature seeds, cooked, boiled, without salt",nutritionPer100g:{calories:117,protein:8.1,carbs:20.3,fat:0.7,fibre:3.6}},
  {name:"Black eyed beans",w:100,kcal:116,p:8.8,c:19.9,f:0.7,fi:3.5,icon:"ti-leaf",kw:["black eyed beans"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-063",sourceDescription:"Beans, blackeye, whole, dried, boiled in unsalted water",nutritionPer100g:{calories:116,protein:8.8,carbs:19.9,fat:0.7,fibre:3.5}},
  {name:"Haricot beans",w:100,kcal:140,p:8.2,c:26.1,f:0.6,fi:10.5,icon:"ti-leaf",kw:["haricot beans"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173746",sourceDescription:"Beans, navy, mature seeds, cooked, boiled, without salt",nutritionPer100g:{calories:140,protein:8.2,carbs:26.1,fat:0.6,fibre:10.5}},
  {name:"Haricot beans",w:100,kcal:96,p:7.1,c:15.6,f:1,fi:6.1,icon:"ti-leaf",kw:["haricot beans"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-665",sourceDescription:"Beans, haricot, canned, re-heated, drained",nutritionPer100g:{calories:96,protein:7.1,carbs:15.6,fat:1,fibre:6.1}},
  {name:"Red lentils",w:100,kcal:116,p:9,c:20.1,f:0.4,fi:7.9,icon:"ti-leaf",kw:["red lentils"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172421",sourceDescription:"Lentils, mature seeds, cooked, boiled, without salt",nutritionPer100g:{calories:116,protein:9,carbs:20.1,fat:0.4,fibre:7.9}},
  {name:"Red lentils",w:100,kcal:102,p:8.1,c:16.9,f:0.7,fi:1.9,icon:"ti-leaf",kw:["red lentils"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-658",sourceDescription:"Lentils, red, split, dried, boiled in unsalted water",nutritionPer100g:{calories:102,protein:8.1,carbs:16.9,fat:0.7,fibre:1.9}},
  {name:"Green lentils",w:100,kcal:116,p:9,c:20.1,f:0.4,fi:7.9,icon:"ti-leaf",kw:["green lentils"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172421",sourceDescription:"Lentils, mature seeds, cooked, boiled, without salt",nutritionPer100g:{calories:116,protein:9,carbs:20.1,fat:0.4,fibre:7.9}},
  {name:"Green lentils",w:100,kcal:92,p:7.8,c:14.5,f:0.7,fi:3.8,icon:"ti-leaf",kw:["green lentils"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-661",sourceDescription:"Lentils, green and brown, whole, dried, boiled in unsalted water",nutritionPer100g:{calories:92,protein:7.8,carbs:14.5,fat:0.7,fibre:3.8}},
  {name:"Mung beans",w:100,kcal:105,p:7,c:19.1,f:0.4,fi:7.6,icon:"ti-leaf",kw:["mung beans"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174257",sourceDescription:"Mung beans, mature seeds, cooked, boiled, without salt",nutritionPer100g:{calories:105,protein:7,carbs:19.1,fat:0.4,fibre:7.6}},
  {name:"Mung beans",w:100,kcal:92,p:7.8,c:15.3,f:0.4,fi:0,icon:"ti-leaf",kw:["mung beans"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-099",sourceDescription:"Beans, mung, dahl, dried, boiled in unsalted water",nutritionPer100g:{calories:92,protein:7.8,carbs:15.3,fat:0.4,fibre:0}},
  {name:"Broad beans",w:100,kcal:110,p:7.6,c:19.6,f:0.4,fi:5.4,icon:"ti-leaf",kw:["broad beans"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173753",sourceDescription:"Broadbeans (fava beans), mature seeds, cooked, boiled, without salt",nutritionPer100g:{calories:110,protein:7.6,carbs:19.6,fat:0.4,fibre:5.4}},
  {name:"Broad beans",w:100,kcal:91,p:9,c:12.3,f:1,fi:5.4,icon:"ti-leaf",kw:["broad beans"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-648",sourceDescription:"Beans, broad, whole, boiled in unsalted water",nutritionPer100g:{calories:91,protein:9,carbs:12.3,fat:1,fibre:5.4}},
  {name:"Soya beans",w:100,kcal:172,p:18.2,c:8.4,f:9,fi:6,icon:"ti-leaf",kw:["soy beans","soya beans"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174271",sourceDescription:"Soybeans, mature cooked, boiled, without salt",nutritionPer100g:{calories:172,protein:18.2,carbs:8.4,fat:9,fibre:6}},
  {name:"Soya beans",w:100,kcal:141,p:14,c:5.1,f:7.3,fi:6.1,icon:"ti-leaf",kw:["soy beans","soya beans"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-116",sourceDescription:"Beans, soya, dried, boiled in unsalted water",nutritionPer100g:{calories:141,protein:14,carbs:5.1,fat:7.3,fibre:6.1}},
  {name:"Aubergine",w:100,kcal:25,p:1,c:5.9,f:0.2,fi:3,icon:"ti-plant-2",kw:["aubergine","eggplant"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169228",sourceDescription:"Eggplant, raw",nutritionPer100g:{calories:25,protein:1,carbs:5.9,fat:0.2,fibre:3}},
  {name:"Aubergine",w:100,kcal:15,p:0.9,c:2.2,f:0.4,fi:2,icon:"ti-plant-2",kw:["aubergine","eggplant"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-161",sourceDescription:"Aubergine, raw",nutritionPer100g:{calories:15,protein:0.9,carbs:2.2,fat:0.4,fibre:2}},
  {name:"Butternut squash",w:100,kcal:40,p:0.9,c:10.5,f:0.1,fi:3.2,icon:"ti-plant-2",kw:["butternut squash"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169296",sourceDescription:"Squash, winter, butternut, cooked, baked, without salt",nutritionPer100g:{calories:40,protein:0.9,carbs:10.5,fat:0.1,fibre:3.2}},
  {name:"Butternut squash",w:100,kcal:39,p:1.4,c:8.4,f:0.2,fi:1.4,icon:"ti-plant-2",kw:["butternut squash"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-644",sourceDescription:"Squash, butternut, baked",nutritionPer100g:{calories:39,protein:1.4,carbs:8.4,fat:0.2,fibre:1.4}},
  {name:"Brussels sprouts",w:100,kcal:36,p:2.5,c:7.1,f:0.5,fi:2.6,icon:"ti-plant-2",kw:["brussels sprouts"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168513",sourceDescription:"Brussels sprouts, cooked, boiled, drained, with salt",nutritionPer100g:{calories:36,protein:2.5,carbs:7.1,fat:0.5,fibre:2.6}},
  {name:"Brussels sprouts",w:100,kcal:32,p:3.1,c:4.2,f:0.4,fi:3.1,icon:"ti-plant-2",kw:["brussels sprouts"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-630",sourceDescription:"Brussels sprouts, boiled in unsalted water",nutritionPer100g:{calories:32,protein:3.1,carbs:4.2,fat:0.4,fibre:3.1}},
  {name:"Pak choi",w:100,kcal:13,p:1.5,c:2.2,f:0.2,fi:1,icon:"ti-plant-2",kw:["pak choi"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170390",sourceDescription:"Cabbage, chinese (pak-choi), raw",nutritionPer100g:{calories:13,protein:1.5,carbs:2.2,fat:0.2,fibre:1}},
  {name:"Pak choi",w:100,kcal:14,p:1.5,c:1.9,f:0.1,fi:0,icon:"ti-plant-2",kw:["pak choi"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-516",sourceDescription:"Pak choi, steamed",nutritionPer100g:{calories:14,protein:1.5,carbs:1.9,fat:0.1,fibre:0}},
  {name:"Spring onion",w:100,kcal:32,p:1.8,c:7.3,f:0.2,fi:2.6,icon:"ti-plant-2",kw:["spring onion"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170005",sourceDescription:"Onions, spring or scallions (includes tops and bulb), raw",nutritionPer100g:{calories:32,protein:1.8,carbs:7.3,fat:0.2,fibre:2.6}},
  {name:"Spring onion",w:100,kcal:23,p:2,c:3,f:0.5,fi:1.5,icon:"ti-plant-2",kw:["spring onion"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-352",sourceDescription:"Spring onions, bulbs and tops, raw",nutritionPer100g:{calories:23,protein:2,carbs:3,fat:0.5,fibre:1.5}},
  {name:"Red cabbage",w:100,kcal:31,p:1.4,c:7.4,f:0.2,fi:2.1,icon:"ti-plant-2",kw:["red cabbage"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169977",sourceDescription:"Cabbage, red, raw",nutritionPer100g:{calories:31,protein:1.4,carbs:7.4,fat:0.2,fibre:2.1}},
  {name:"Red cabbage",w:100,kcal:21,p:1.1,c:3.7,f:0.3,fi:2.5,icon:"ti-plant-2",kw:["red cabbage"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-190",sourceDescription:"Cabbage, red, raw",nutritionPer100g:{calories:21,protein:1.1,carbs:3.7,fat:0.3,fibre:2.5}},
  {name:"Savoy cabbage",w:100,kcal:27,p:2,c:6.1,f:0.1,fi:3.1,icon:"ti-plant-2",kw:["savoy cabbage"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170388",sourceDescription:"Cabbage, savoy, raw",nutritionPer100g:{calories:27,protein:2,carbs:6.1,fat:0.1,fibre:3.1}},
  {name:"Savoy cabbage",w:100,kcal:26,p:1.8,c:4.4,f:0.2,fi:2.3,icon:"ti-plant-2",kw:["savoy cabbage"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-582",sourceDescription:"Cabbage, average, raw",nutritionPer100g:{calories:26,protein:1.8,carbs:4.4,fat:0.2,fibre:2.3}},
  {name:"Fennel",w:100,kcal:31,p:1.2,c:7.3,f:0.2,fi:3.1,icon:"ti-plant-2",kw:["fennel"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169385",sourceDescription:"Fennel, bulb, raw",nutritionPer100g:{calories:31,protein:1.2,carbs:7.3,fat:0.2,fibre:3.1}},
  {name:"Fennel",w:100,kcal:12,p:0.9,c:1.8,f:0.2,fi:2.4,icon:"ti-plant-2",kw:["fennel"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-241",sourceDescription:"Fennel, Florence, raw",nutritionPer100g:{calories:12,protein:0.9,carbs:1.8,fat:0.2,fibre:2.4}},
  {name:"Radish",w:100,kcal:16,p:0.7,c:3.4,f:0.1,fi:1.6,icon:"ti-plant-2",kw:["radish"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169276",sourceDescription:"Radishes, raw",nutritionPer100g:{calories:16,protein:0.7,carbs:3.4,fat:0.1,fibre:1.6}},
  {name:"Radish",w:100,kcal:33,p:3.5,c:3.5,f:0.5,fi:0,icon:"ti-plant-2",kw:["radish"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-332",sourceDescription:"Radish leaves, raw",nutritionPer100g:{calories:33,protein:3.5,carbs:3.5,fat:0.5,fibre:0}},
  {name:"Turnip",w:100,kcal:28,p:0.9,c:6.4,f:0.1,fi:1.8,icon:"ti-plant-2",kw:["turnip"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170465",sourceDescription:"Turnips, raw",nutritionPer100g:{calories:28,protein:0.9,carbs:6.4,fat:0.1,fibre:1.8}},
  {name:"Turnip",w:100,kcal:23,p:0.9,c:4.7,f:0.3,fi:2.4,icon:"ti-plant-2",kw:["turnip"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-389",sourceDescription:"Turnip, flesh only, raw",nutritionPer100g:{calories:23,protein:0.9,carbs:4.7,fat:0.3,fibre:2.4}},
  {name:"Parsnip",w:100,kcal:75,p:1.2,c:18,f:0.3,fi:4.9,icon:"ti-plant-2",kw:["parsnip"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170417",sourceDescription:"Parsnips, raw",nutritionPer100g:{calories:75,protein:1.2,carbs:18,fat:0.3,fibre:4.9}},
  {name:"Parsnip",w:100,kcal:64,p:1.8,c:12.5,f:1.1,fi:4.6,icon:"ti-plant-2",kw:["parsnip"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-312",sourceDescription:"Parsnip, raw",nutritionPer100g:{calories:64,protein:1.8,carbs:12.5,fat:1.1,fibre:4.6}},
  {name:"Swede",w:100,kcal:37,p:1.1,c:8.6,f:0.2,fi:2.3,icon:"ti-plant-2",kw:["swede"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168454",sourceDescription:"Rutabagas, raw",nutritionPer100g:{calories:37,protein:1.1,carbs:8.6,fat:0.2,fibre:2.3}},
  {name:"Swede",w:100,kcal:24,p:0.7,c:5,f:0.3,fi:1.9,icon:"ti-plant-2",kw:["swede"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-359",sourceDescription:"Swede, flesh only, raw",nutritionPer100g:{calories:24,protein:0.7,carbs:5,fat:0.3,fibre:1.9}},
  {name:"Pumpkin",w:100,kcal:26,p:1,c:6.5,f:0.1,fi:0.5,icon:"ti-plant-2",kw:["pumpkin"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168448",sourceDescription:"Pumpkin, raw",nutritionPer100g:{calories:26,protein:1,carbs:6.5,fat:0.1,fibre:0.5}},
  {name:"Pumpkin",w:100,kcal:13,p:0.7,c:2.2,f:0.2,fi:1,icon:"ti-plant-2",kw:["pumpkin"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-326",sourceDescription:"Pumpkin, flesh only, raw",nutritionPer100g:{calories:13,protein:0.7,carbs:2.2,fat:0.2,fibre:1}},
  {name:"Watercress",w:100,kcal:11,p:2.3,c:1.3,f:0.1,fi:0.5,icon:"ti-plant-2",kw:["watercress"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170068",sourceDescription:"Watercress, raw",nutritionPer100g:{calories:11,protein:2.3,carbs:1.3,fat:0.1,fibre:0.5}},
  {name:"Watercress",w:100,kcal:10,p:1.9,c:0,f:0.3,fi:1.5,icon:"ti-plant-2",kw:["watercress"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-669",sourceDescription:"Watercress, raw",nutritionPer100g:{calories:10,protein:1.9,carbs:0,fat:0.3,fibre:1.5}},
  {name:"Rocket",w:100,kcal:25,p:2.6,c:3.6,f:0.7,fi:1.6,icon:"ti-plant-2",kw:["rocket"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169387",sourceDescription:"Arugula, raw",nutritionPer100g:{calories:25,protein:2.6,carbs:3.6,fat:0.7,fibre:1.6}},
  {name:"Rocket",w:100,kcal:18,p:3.6,c:0,f:0.4,fi:1.3,icon:"ti-plant-2",kw:["rocket"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-522",sourceDescription:"Rocket, raw",nutritionPer100g:{calories:18,protein:3.6,carbs:0,fat:0.4,fibre:1.3}},
  {name:"Garlic",w:100,kcal:149,p:6.4,c:33.1,f:0.5,fi:2.1,icon:"ti-plant-2",kw:["garlic"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169230",sourceDescription:"Garlic, raw",nutritionPer100g:{calories:149,protein:6.4,carbs:33.1,fat:0.5,fibre:2.1}},
  {name:"Garlic",w:100,kcal:98,p:7.9,c:16.3,f:0.6,fi:4.1,icon:"ti-plant-2",kw:["garlic"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-244",sourceDescription:"Garlic, raw",nutritionPer100g:{calories:98,protein:7.9,carbs:16.3,fat:0.6,fibre:4.1}},
  {name:"Ginger",w:100,kcal:80,p:1.8,c:17.8,f:0.8,fi:2,icon:"ti-plant-2",kw:["ginger"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169231",sourceDescription:"Ginger root, raw",nutritionPer100g:{calories:80,protein:1.8,carbs:17.8,fat:0.8,fibre:2}},
  {name:"Ginger",w:100,kcal:44,p:1.8,c:8.1,f:0.8,fi:0,icon:"ti-plant-2",kw:["ginger"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-890",sourceDescription:"Ginger, fresh",nutritionPer100g:{calories:44,protein:1.8,carbs:8.1,fat:0.8,fibre:0}},
  {name:"Chilli pepper",w:100,kcal:40,p:1.9,c:8.8,f:0.4,fi:1.5,icon:"ti-plant-2",kw:["chili pepper","chilli pepper"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170106",sourceDescription:"Peppers, hot chili, red, raw",nutritionPer100g:{calories:40,protein:1.9,carbs:8.8,fat:0.4,fibre:1.5}},
  {name:"Chilli pepper",w:100,kcal:20,p:2.9,c:0.7,f:0.6,fi:0,icon:"ti-plant-2",kw:["chili pepper","chilli pepper"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-316",sourceDescription:"Peppers, capsicum, chilli, green, raw",nutritionPer100g:{calories:20,protein:2.9,carbs:0.7,fat:0.6,fibre:0}},
  {name:"Sweetcorn",w:100,kcal:96,p:3.4,c:21,f:1.5,fi:2.4,icon:"ti-plant-2",kw:["sweetcorn"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168525",sourceDescription:"Corn, sweet, yellow, cooked, boiled, drained, with salt",nutritionPer100g:{calories:96,protein:3.4,carbs:21,fat:1.5,fibre:2.4}},
  {name:"Sweetcorn",w:100,kcal:67,p:3.6,c:9.5,f:1.9,fi:2.6,icon:"ti-plant-2",kw:["sweetcorn"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-508",sourceDescription:"Sweetcorn, kernels, boiled 'on the cob' in unsalted water",nutritionPer100g:{calories:67,protein:3.6,carbs:9.5,fat:1.9,fibre:2.6}},
  {name:"Apple, raw",w:100,kcal:52,p:0.3,c:13.8,f:0.2,fi:2.4,icon:"ti-apple",kw:["apple","apple, raw"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171688",sourceDescription:"Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)",quantityMode:"count",defaultUnit:"apple",units:[{label:"apple",grams:180},{label:"g",grams:1}],nutritionPer100g:{calories:52,protein:0.3,carbs:13.8,fat:0.2,fibre:2.4}},
  {name:"Apple, raw",w:100,kcal:51,p:0.6,c:11.6,f:0.5,fi:1.3,icon:"ti-apple",kw:["apple","apple, raw"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-319",sourceDescription:"Apples, eating, raw, flesh and skin",quantityMode:"count",defaultUnit:"apple",units:[{label:"apple",grams:180},{label:"g",grams:1}],nutritionPer100g:{calories:51,protein:0.6,carbs:11.6,fat:0.5,fibre:1.3}},
  {name:"Apricots",w:100,kcal:48,p:1.4,c:11.1,f:0.4,fi:2,icon:"ti-apple",kw:["apricots"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171697",sourceDescription:"Apricots, raw",nutritionPer100g:{calories:48,protein:1.4,carbs:11.1,fat:0.4,fibre:2}},
  {name:"Apricots",w:100,kcal:31,p:0.9,c:7.2,f:0.1,fi:1.7,icon:"ti-apple",kw:["apricots"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-025",sourceDescription:"Apricots, raw, flesh and skin",nutritionPer100g:{calories:31,protein:0.9,carbs:7.2,fat:0.1,fibre:1.7}},
  {name:"Blackberries",w:100,kcal:43,p:1.4,c:9.6,f:0.5,fi:5.3,icon:"ti-apple",kw:["blackberries"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173946",sourceDescription:"Blackberries, raw",nutritionPer100g:{calories:43,protein:1.4,carbs:9.6,fat:0.5,fibre:5.3}},
  {name:"Blackberries",w:100,kcal:27,p:1.1,c:5.6,f:0.2,fi:3.1,icon:"ti-apple",kw:["blackberries"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-388",sourceDescription:"Blackberries, raw",nutritionPer100g:{calories:27,protein:1.1,carbs:5.6,fat:0.2,fibre:3.1}},
  {name:"Cherries",w:100,kcal:63,p:1.1,c:16,f:0.2,fi:2.1,icon:"ti-apple",kw:["cherries"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171719",sourceDescription:"Cherries, sweet, raw",nutritionPer100g:{calories:63,protein:1.1,carbs:16,fat:0.2,fibre:2.1}},
  {name:"Cherries",w:100,kcal:63,p:1.2,c:14.6,f:0.4,fi:0.9,icon:"ti-apple",kw:["cherries"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-382",sourceDescription:"Cherries, flesh and skin, raw",nutritionPer100g:{calories:63.1,protein:1.2,carbs:14.6,fat:0.4,fibre:0.9}},
  {name:"Grapefruit",w:100,kcal:32,p:0.6,c:8.1,f:0.1,fi:1.1,icon:"ti-apple",kw:["grapefruit"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173033",sourceDescription:"Grapefruit, raw, pink and red and white, all areas",nutritionPer100g:{calories:32,protein:0.6,carbs:8.1,fat:0.1,fibre:1.1}},
  {name:"Grapefruit",w:100,kcal:34,p:0.9,c:6.9,f:0.5,fi:1.3,icon:"ti-apple",kw:["grapefruit"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-384",sourceDescription:"Grapefruit, flesh only, raw",nutritionPer100g:{calories:34.1,protein:0.9,carbs:6.9,fat:0.5,fibre:1.3}},
  {name:"Lemon",w:100,kcal:29,p:1.1,c:9.3,f:0.3,fi:2.8,icon:"ti-apple",kw:["lemon"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:167746",sourceDescription:"Lemons, raw, without peel",nutritionPer100g:{calories:29,protein:1.1,carbs:9.3,fat:0.3,fibre:2.8}},
  {name:"Lemon",w:100,kcal:9,p:0.5,c:1.4,f:0.2,fi:0,icon:"ti-apple",kw:["lemon"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-130",sourceDescription:"Lemons, flesh only, raw, weighed with peel and pips",nutritionPer100g:{calories:9,protein:0.5,carbs:1.4,fat:0.2,fibre:0}},
  {name:"Lime",w:100,kcal:30,p:0.7,c:10.5,f:0.2,fi:2.8,icon:"ti-apple",kw:["lime"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168155",sourceDescription:"Limes, raw",nutritionPer100g:{calories:30,protein:0.7,carbs:10.5,fat:0.2,fibre:2.8}},
  {name:"Lime",w:100,kcal:9,p:0.4,c:1.6,f:0.1,fi:0.1,icon:"ti-apple",kw:["lime"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-279",sourceDescription:"Lime juice, fresh",nutritionPer100g:{calories:9,protein:0.4,carbs:1.6,fat:0.1,fibre:0.1}},
  {name:"Melon",w:100,kcal:34,p:0.8,c:8.2,f:0.2,fi:0.9,icon:"ti-apple",kw:["melon"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169092",sourceDescription:"Melons, cantaloupe, raw",nutritionPer100g:{calories:34,protein:0.8,carbs:8.2,fat:0.2,fibre:0.9}},
  {name:"Melon",w:100,kcal:19,p:0.6,c:4.2,f:0.1,fi:1,icon:"ti-apple",kw:["melon"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-339",sourceDescription:"Melon, Canteloupe-type, flesh only",nutritionPer100g:{calories:19,protein:0.6,carbs:4.2,fat:0.1,fibre:1}},
  {name:"Nectarine",w:100,kcal:44,p:1.1,c:10.6,f:0.3,fi:1.7,icon:"ti-apple",kw:["nectarine"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169914",sourceDescription:"Nectarines, raw",nutritionPer100g:{calories:44,protein:1.1,carbs:10.6,fat:0.3,fibre:1.7}},
  {name:"Nectarine",w:100,kcal:43,p:1,c:9.8,f:0.3,fi:1.2,icon:"ti-apple",kw:["nectarine"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-380",sourceDescription:"Nectarines, flesh and skin, raw",nutritionPer100g:{calories:43,protein:1,carbs:9.8,fat:0.3,fibre:1.2}},
  {name:"Peach",w:100,kcal:39,p:0.9,c:9.5,f:0.2,fi:1.5,icon:"ti-apple",kw:["peach"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169928",sourceDescription:"Peaches, yellow, raw",nutritionPer100g:{calories:39,protein:0.9,carbs:9.5,fat:0.2,fibre:1.5}},
  {name:"Peach",w:100,kcal:33,p:1,c:7.6,f:0.1,fi:1.5,icon:"ti-apple",kw:["peach"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-299",sourceDescription:"Peaches, raw, flesh and skin",nutritionPer100g:{calories:33,protein:1,carbs:7.6,fat:0.1,fibre:1.5}},
  {name:"Plum",w:100,kcal:46,p:0.7,c:11.4,f:0.3,fi:1.4,icon:"ti-apple",kw:["plum"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169949",sourceDescription:"Plums, raw",nutritionPer100g:{calories:46,protein:0.7,carbs:11.4,fat:0.3,fibre:1.4}},
  {name:"Plum",w:100,kcal:41,p:0.6,c:9.7,f:0.3,fi:1.6,icon:"ti-apple",kw:["plum"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-372",sourceDescription:"Plums, dessert, flesh and skin, raw",nutritionPer100g:{calories:41,protein:0.6,carbs:9.7,fat:0.3,fibre:1.6}},
  {name:"Pomegranate",w:100,kcal:83,p:1.7,c:18.7,f:1.2,fi:4,icon:"ti-apple",kw:["pomegranate"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169134",sourceDescription:"Pomegranates, raw",nutritionPer100g:{calories:83,protein:1.7,carbs:18.7,fat:1.2,fibre:4}},
  {name:"Pomegranate",w:100,kcal:44,p:0.2,c:11.6,f:0,fi:0,icon:"ti-apple",kw:["pomegranate"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-341",sourceDescription:"Pomegranate juice drink",nutritionPer100g:{calories:44,protein:0.2,carbs:11.6,fat:0,fibre:0}},
  {name:"Dates",w:100,kcal:277,p:1.8,c:75,f:0.1,fi:6.7,icon:"ti-apple",kw:["dates"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168191",sourceDescription:"Dates, medjool",nutritionPer100g:{calories:277,protein:1.8,carbs:75,fat:0.1,fibre:6.7}},
  {name:"Dates",w:100,kcal:235,p:2.4,c:58.7,f:0.6,fi:4,icon:"ti-apple",kw:["dates"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-394",sourceDescription:"Dates, dried, flesh and skin",nutritionPer100g:{calories:235,protein:2.4,carbs:58.7,fat:0.6,fibre:4}},
  {name:"Raisins",w:100,kcal:296,p:2.5,c:78.5,f:0.5,fi:6.8,icon:"ti-apple",kw:["raisins"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168166",sourceDescription:"Raisins, seeded",nutritionPer100g:{calories:296,protein:2.5,carbs:78.5,fat:0.5,fibre:6.8}},
  {name:"Raisins",w:100,kcal:256,p:3,c:62.6,f:1,fi:2,icon:"ti-apple",kw:["raisins"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-393",sourceDescription:"Raisins, dried",nutritionPer100g:{calories:256,protein:3,carbs:62.6,fat:1,fibre:2}},
  {name:"Prunes",w:100,kcal:240,p:2.2,c:63.9,f:0.4,fi:7.1,icon:"ti-apple",kw:["prunes"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168162",sourceDescription:"Plums, dried (prunes), uncooked",nutritionPer100g:{calories:240,protein:2.2,carbs:63.9,fat:0.4,fibre:7.1}},
  {name:"Prunes",w:100,kcal:149,p:2.3,c:36.5,f:0.3,fi:5.7,icon:"ti-apple",kw:["prunes"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-391",sourceDescription:"Prunes, ready-to-eat, semi-dried",nutritionPer100g:{calories:149,protein:2.3,carbs:36.5,fat:0.3,fibre:5.7}},
  {name:"Dried figs",w:100,kcal:249,p:3.3,c:63.9,f:0.9,fi:9.8,icon:"ti-apple",kw:["dried figs"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174665",sourceDescription:"Figs, dried, uncooked",nutritionPer100g:{calories:249,protein:3.3,carbs:63.9,fat:0.9,fibre:9.8}},
  {name:"Dried figs",w:100,kcal:143,p:1.9,c:34.3,f:0.8,fi:3.9,icon:"ti-apple",kw:["dried figs"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-093",sourceDescription:"Figs, dried, stewed with sugar",nutritionPer100g:{calories:143,protein:1.9,carbs:34.3,fat:0.8,fibre:3.9}},
  {name:"Peanuts",w:100,kcal:587,p:24.4,c:21.3,f:49.7,fi:8.4,icon:"ti-nut",kw:["peanuts"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173806",sourceDescription:"Peanuts, all types, dry-roasted, without salt",nutritionPer100g:{calories:587,protein:24.4,carbs:21.3,fat:49.7,fibre:8.4}},
  {name:"Peanuts",w:100,kcal:590,p:25.7,c:10.3,f:49.8,fi:6.4,icon:"ti-nut",kw:["peanuts"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-878",sourceDescription:"Peanuts, dry roasted",nutritionPer100g:{calories:590,protein:25.7,carbs:10.3,fat:49.8,fibre:6.4}},
  {name:"Hazelnuts",w:100,kcal:628,p:14.9,c:16.7,f:60.8,fi:9.7,icon:"ti-nut",kw:["hazelnuts"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170581",sourceDescription:"Nuts, hazelnuts or filberts",nutritionPer100g:{calories:628,protein:14.9,carbs:16.7,fat:60.8,fibre:9.7}},
  {name:"Hazelnuts",w:100,kcal:899,p:0,c:0,f:99.9,fi:0,icon:"ti-nut",kw:["hazelnuts"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-037",sourceDescription:"Oil, hazelnut",nutritionPer100g:{calories:899,protein:0,carbs:0,fat:99.9,fibre:0}},
  {name:"Pecans",w:100,kcal:691,p:9.2,c:13.9,f:72,fi:9.6,icon:"ti-nut",kw:["pecans"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170182",sourceDescription:"Nuts, pecans",nutritionPer100g:{calories:691,protein:9.2,carbs:13.9,fat:72,fibre:9.6}},
  {name:"Pecans",w:100,kcal:689,p:9.2,c:5.8,f:70.1,fi:4.7,icon:"ti-nut",kw:["pecans"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-837",sourceDescription:"Pecan nuts, kernel only",nutritionPer100g:{calories:689,protein:9.2,carbs:5.8,fat:70.1,fibre:4.7}},
  {name:"Brazil nuts",w:100,kcal:659,p:14.3,c:11.7,f:67.1,fi:7.5,icon:"ti-nut",kw:["brazil nuts"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170569",sourceDescription:"Nuts, brazilnuts, dried, unblanched",nutritionPer100g:{calories:659,protein:14.3,carbs:11.7,fat:67.1,fibre:7.5}},
  {name:"Brazil nuts",w:100,kcal:683,p:14.3,c:3.1,f:68.2,fi:4.3,icon:"ti-nut",kw:["brazil nuts"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-871",sourceDescription:"Brazil nuts, kernel only",nutritionPer100g:{calories:683,protein:14.3,carbs:3.1,fat:68.2,fibre:4.3}},
  {name:"Macadamia nuts",w:100,kcal:718,p:7.9,c:13.8,f:75.8,fi:8.6,icon:"ti-nut",kw:["macadamia nuts"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170178",sourceDescription:"Nuts, macadamia nuts, raw",nutritionPer100g:{calories:718,protein:7.9,carbs:13.8,fat:75.8,fibre:8.6}},
  {name:"Macadamia nuts",w:100,kcal:748,p:7.9,c:4.8,f:77.6,fi:5.3,icon:"ti-nut",kw:["macadamia nuts"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-891",sourceDescription:"Macadamia nuts, salted",nutritionPer100g:{calories:748,protein:7.9,carbs:4.8,fat:77.6,fibre:5.3}},
  {name:"Sesame seeds",w:100,kcal:570,p:17.8,c:26.2,f:48,fi:9.3,icon:"ti-nut",kw:["sesame seeds"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169410",sourceDescription:"Seeds, sesame butter, tahini, from raw and stone ground kernels",nutritionPer100g:{calories:570,protein:17.8,carbs:26.2,fat:48,fibre:9.3}},
  {name:"Sesame seeds",w:100,kcal:598,p:18.2,c:0.9,f:58,fi:7.9,icon:"ti-nut",kw:["sesame seeds"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-844",sourceDescription:"Sesame seeds",nutritionPer100g:{calories:598,protein:18.2,carbs:0.9,fat:58,fibre:7.9}},
  {name:"Rapeseed oil",w:100,kcal:884,p:0,c:0,f:100,fi:0,icon:"ti-droplet",kw:["canola oil","rapeseed oil"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172336",sourceDescription:"Oil, canola",type:"liquid",nutritionPer100g:{calories:884,protein:0,carbs:0,fat:100,fibre:0}},
  {name:"Rapeseed oil",w:100,kcal:899,p:0,c:0,f:99.9,fi:0,icon:"ti-droplet",kw:["canola oil","rapeseed oil"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-041",sourceDescription:"Oil, rapeseed",type:"liquid",nutritionPer100g:{calories:899,protein:0,carbs:0,fat:99.9,fibre:0}},
  {name:"Sunflower oil",w:100,kcal:884,p:0,c:0,f:100,fi:0,icon:"ti-droplet",kw:["sunflower oil"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171025",sourceDescription:"Oil, sunflower, linoleic, (approx. 65%)",type:"liquid",nutritionPer100g:{calories:884,protein:0,carbs:0,fat:100,fibre:0}},
  {name:"Sunflower oil",w:100,kcal:899,p:0,c:0,f:99.9,fi:0,icon:"ti-droplet",kw:["sunflower oil"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-045",sourceDescription:"Oil, sunflower",type:"liquid",nutritionPer100g:{calories:899,protein:0,carbs:0,fat:99.9,fibre:0}},
  {name:"Mustard",w:100,kcal:60,p:3.7,c:5.8,f:3.3,fi:4,icon:"ti-droplet",kw:["mustard"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172234",sourceDescription:"Mustard, prepared, yellow",type:"liquid",nutritionPer100g:{calories:60,protein:3.7,carbs:5.8,fat:3.3,fibre:4}},
  {name:"Mustard",w:100,kcal:139,p:7.1,c:9.7,f:8.2,fi:0,icon:"ti-droplet",kw:["mustard"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-364",sourceDescription:"Mustard, smooth",type:"liquid",nutritionPer100g:{calories:139,protein:7.1,carbs:9.7,fat:8.2,fibre:0}},
  {name:"Vinegar",w:100,kcal:18,p:0,c:0,f:0,fi:0,icon:"ti-droplet",kw:["vinegar"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172237",sourceDescription:"Vinegar, distilled",type:"liquid",nutritionPer100g:{calories:18,protein:0,carbs:0,fat:0,fibre:0}},
  {name:"Vinegar",w:100,kcal:22,p:0.4,c:0.6,f:0,fi:0,icon:"ti-droplet",kw:["vinegar"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-339",sourceDescription:"Vinegar",type:"liquid",nutritionPer100g:{calories:22,protein:0.4,carbs:0.6,fat:0,fibre:0}},
  {name:"Jam",w:100,kcal:278,p:0.4,c:68.9,f:0.1,fi:1.1,icon:"ti-droplet",kw:["jam"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169641",sourceDescription:"Jams and preserves",type:"liquid",nutritionPer100g:{calories:278,protein:0.4,carbs:68.9,fat:0.1,fibre:1.1}},
  {name:"Jam",w:100,kcal:261,p:0.6,c:69,f:0,fi:0,icon:"ti-droplet",kw:["jam"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-073",sourceDescription:"Jam, fruit with edible seeds",type:"liquid",nutritionPer100g:{calories:261,protein:0.6,carbs:69,fat:0,fibre:0}},
  {name:"Marmalade",w:100,kcal:246,p:0.3,c:66.3,f:0,fi:0.7,icon:"ti-droplet",kw:["marmalade"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168819",sourceDescription:"Marmalade, orange",type:"liquid",nutritionPer100g:{calories:246,protein:0.3,carbs:66.3,fat:0,fibre:0.7}},
  {name:"Marmalade",w:100,kcal:261,p:0.1,c:69.5,f:0,fi:0.3,icon:"ti-droplet",kw:["marmalade"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-078",sourceDescription:"Marmalade",type:"liquid",nutritionPer100g:{calories:261,protein:0.1,carbs:69.5,fat:0,fibre:0.3}},
  {name:"Barbecue sauce",w:100,kcal:172,p:0.8,c:40.8,f:0.6,fi:0.9,icon:"ti-droplet",kw:["barbecue sauce"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174523",sourceDescription:"Sauce, barbecue",type:"liquid",nutritionPer100g:{calories:172,protein:0.8,carbs:40.8,fat:0.6,fibre:0.9}},
  {name:"Barbecue sauce",w:100,kcal:140,p:1,c:36.1,f:0.1,fi:0.5,icon:"ti-droplet",kw:["barbecue sauce"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-705",sourceDescription:"Barbecue sauce",type:"liquid",nutritionPer100g:{calories:140,protein:1,carbs:36.1,fat:0.1,fibre:0.5}},
  {name:"Tartare sauce",w:100,kcal:211,p:1,c:13.3,f:16.7,fi:0.5,icon:"ti-droplet",kw:["tartare sauce"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171826",sourceDescription:"Sauce, tartar, ready-to-serve",type:"liquid",nutritionPer100g:{calories:211,protein:1,carbs:13.3,fat:16.7,fibre:0.5}},
  {name:"Tartare sauce",w:100,kcal:299,p:1.3,c:17.9,f:24.6,fi:0,icon:"ti-droplet",kw:["tartare sauce"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-722",sourceDescription:"Tartare sauce",type:"liquid",nutritionPer100g:{calories:299,protein:1.3,carbs:17.9,fat:24.6,fibre:0}},
  {name:"Worcestershire sauce",w:100,kcal:77,p:0,c:19.2,f:0,fi:0,icon:"ti-droplet",kw:["worcestershire sauce"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171610",sourceDescription:"Sauce, worcestershire",type:"liquid",nutritionPer100g:{calories:77,protein:0,carbs:19.2,fat:0,fibre:0}},
  {name:"Worcestershire sauce",w:100,kcal:113,p:1.4,c:28.3,f:0.1,fi:0,icon:"ti-droplet",kw:["worcestershire sauce"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-723",sourceDescription:"Worcestershire sauce",type:"liquid",nutritionPer100g:{calories:113,protein:1.4,carbs:28.3,fat:0.1,fibre:0}},
  {name:"Dark chocolate",w:100,kcal:546,p:4.9,c:61.2,f:31.3,fi:7,icon:"ti-cookie",kw:["dark chocolate"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170271",sourceDescription:"Chocolate, dark, 45- 59% cacao solids",nutritionPer100g:{calories:546,protein:4.9,carbs:61.2,fat:31.3,fibre:7}},
  {name:"Dark chocolate",w:100,kcal:510,p:5,c:63.5,f:28,fi:2.5,icon:"ti-cookie",kw:["dark chocolate"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-491",sourceDescription:"Chocolate, plain",nutritionPer100g:{calories:510,protein:5,carbs:63.5,fat:28,fibre:2.5}},
  {name:"Milk chocolate",w:100,kcal:535,p:7.7,c:59.4,f:29.7,fi:3.4,icon:"ti-cookie",kw:["milk chocolate"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:167587",sourceDescription:"Candies, milk chocolate",nutritionPer100g:{calories:535,protein:7.7,carbs:59.4,fat:29.7,fibre:3.4}},
  {name:"Milk chocolate",w:100,kcal:519,p:7.3,c:56,f:31.1,fi:1.3,icon:"ti-cookie",kw:["milk chocolate"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-648",sourceDescription:"Chocolate, milk",nutritionPer100g:{calories:519,protein:7.3,carbs:56,fat:31.1,fibre:1.3}},
  {name:"Chocolate chip cookie",w:100,kcal:444,p:3.6,c:65.8,f:19.8,fi:1.8,icon:"ti-cookie",kw:["chocolate chip cookie"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172717",sourceDescription:"Cookies, chocolate chip, commercially prepared, soft-type",nutritionPer100g:{calories:444,protein:3.6,carbs:65.8,fat:19.8,fibre:1.8}},
  {name:"Chocolate chip cookie",w:100,kcal:384,p:6.3,c:53.6,f:17.5,fi:1.6,icon:"ti-cookie",kw:["chocolate chip cookie"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-1094",sourceDescription:"Muffins, American style, chocolate chip, homemade",nutritionPer100g:{calories:384,protein:6.3,carbs:53.6,fat:17.5,fibre:1.6}},
  {name:"Brownie",w:100,kcal:405,p:4.8,c:63.9,f:16.3,fi:2.1,icon:"ti-cookie",kw:["brownie"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172713",sourceDescription:"Cookies, brownies, commercially prepared",nutritionPer100g:{calories:405,protein:4.8,carbs:63.9,fat:16.3,fibre:2.1}},
  {name:"Brownie",w:100,kcal:506,p:6.2,c:54.3,f:30.8,fi:1.7,icon:"ti-cookie",kw:["brownie"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-1127",sourceDescription:"Brownies, chocolate, homemade",nutritionPer100g:{calories:506,protein:6.2,carbs:54.3,fat:30.8,fibre:1.7}},
  {name:"Sponge cake",w:100,kcal:290,p:5.4,c:61,f:2.7,fi:0.5,icon:"ti-cookie",kw:["sponge cake"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172706",sourceDescription:"Cake, sponge, commercially prepared",nutritionPer100g:{calories:290,protein:5.4,carbs:61,fat:2.7,fibre:0.5}},
  {name:"Sponge cake",w:100,kcal:463,p:6.4,c:53.1,f:26.4,fi:0.9,icon:"ti-cookie",kw:["sponge cake"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-956",sourceDescription:"Cake, sponge, homemade",nutritionPer100g:{calories:463,protein:6.4,carbs:53.1,fat:26.4,fibre:0.9}},
  {name:"Ice cream",w:100,kcal:207,p:3.5,c:23.6,f:11,fi:0.7,icon:"ti-cookie",kw:["ice cream"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:167575",sourceDescription:"Ice creams, vanilla",nutritionPer100g:{calories:207,protein:3.5,carbs:23.6,fat:11,fibre:0.7}},
  {name:"Ice cream",w:100,kcal:169,p:3.2,c:22,f:8.2,fi:0,icon:"ti-cookie",kw:["ice cream"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:12-508",sourceDescription:"Ice cream, dairy, vanilla, soft scoop",nutritionPer100g:{calories:169,protein:3.2,carbs:22,fat:8.2,fibre:0}},
  {name:"Crisps",w:100,kcal:532,p:6.4,c:53.8,f:34,fi:3.1,icon:"ti-cookie",kw:["crisps","potato chips"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169677",sourceDescription:"Snacks, potato chips, plain, salted",nutritionPer100g:{calories:532,protein:6.4,carbs:53.8,fat:34,fibre:3.1}},
  {name:"Crisps",w:100,kcal:493,p:6.2,c:55.8,f:28.8,fi:4.6,icon:"ti-cookie",kw:["crisps","potato chips"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-671",sourceDescription:"Potato crisps, fried in sunflower oil",nutritionPer100g:{calories:493,protein:6.2,carbs:55.8,fat:28.8,fibre:4.6}},
  {name:"Popcorn",w:100,kcal:387,p:12.9,c:77.8,f:4.5,fi:14.5,icon:"ti-cookie",kw:["popcorn"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:167959",sourceDescription:"Snacks, popcorn, air-popped",nutritionPer100g:{calories:387,protein:12.9,carbs:77.8,fat:4.5,fibre:14.5}},
  {name:"Popcorn",w:100,kcal:470,p:9,c:59.3,f:23.5,fi:0,icon:"ti-cookie",kw:["popcorn"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-692",sourceDescription:"Popcorn, salted, retail",nutritionPer100g:{calories:470,protein:9,carbs:59.3,fat:23.5,fibre:0}},
  {name:"Tortilla chips",w:100,kcal:497,p:6.6,c:67.4,f:22.3,fi:4.7,icon:"ti-cookie",kw:["tortilla chips"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173143",sourceDescription:"Tortilla chips, yellow, plain, salted",nutritionPer100g:{calories:497,protein:6.6,carbs:67.4,fat:22.3,fibre:4.7}},
  {name:"Tortilla chips",w:100,kcal:504,p:7.2,c:60.8,f:27.4,fi:5.7,icon:"ti-cookie",kw:["tortilla chips"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-644",sourceDescription:"Tortilla chips fried in sunflower oil",nutritionPer100g:{calories:504,protein:7.2,carbs:60.8,fat:27.4,fibre:5.7}},
  {name:"Orange juice",w:100,kcal:45,p:0.7,c:10.4,f:0.2,fi:0.2,icon:"ti-glass",kw:["orange juice"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:169098",sourceDescription:"Orange juice, raw (Includes foods for USDA's Food Distribution Program)",type:"liquid",nutritionPer100g:{calories:45,protein:0.7,carbs:10.4,fat:0.2,fibre:0.2}},
  {name:"Orange juice",w:100,kcal:36,p:0.9,c:8.6,f:0,fi:0.2,icon:"ti-glass",kw:["orange juice"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-329",sourceDescription:"Orange juice, chilled",type:"liquid",nutritionPer100g:{calories:36,protein:0.9,carbs:8.6,fat:0,fibre:0.2}},
  {name:"Apple juice",w:100,kcal:46,p:0.1,c:11.3,f:0.1,fi:0.2,icon:"ti-glass",kw:["apple juice"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:167771",sourceDescription:"Apple juice, canned or bottled, unsweetened, with added ascorbic acid",type:"liquid",nutritionPer100g:{calories:46,protein:0.1,carbs:11.3,fat:0.1,fibre:0.2}},
  {name:"Apple juice",w:100,kcal:37,p:0.1,c:9.7,f:0,fi:0,icon:"ti-glass",kw:["apple juice"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:14-331",sourceDescription:"Apple juice, clear, ambient and chilled",type:"liquid",nutritionPer100g:{calories:37,protein:0.1,carbs:9.7,fat:0,fibre:0}},
  {name:"Tomato juice",w:100,kcal:17,p:0.8,c:3.5,f:0.3,fi:0.4,icon:"ti-glass",kw:["tomato juice"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170545",sourceDescription:"Tomato juice, canned, without salt added",type:"liquid",nutritionPer100g:{calories:17,protein:0.8,carbs:3.5,fat:0.3,fibre:0.4}},
  {name:"Tomato juice",w:100,kcal:14,p:0.8,c:3,f:0,fi:0.6,icon:"ti-glass",kw:["tomato juice"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:13-382",sourceDescription:"Tomato juice",type:"liquid",nutritionPer100g:{calories:14,protein:0.8,carbs:3,fat:0,fibre:0.6}},
  {name:"Coffee",w:100,kcal:2,p:0.3,c:0.2,f:0,fi:0,icon:"ti-glass",kw:["coffee"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171881",sourceDescription:"Beverages, coffee, brewed, breakfast blend",type:"liquid",nutritionPer100g:{calories:2,protein:0.3,carbs:0.2,fat:0,fibre:0}},
  {name:"Coffee",w:100,kcal:27,p:2,c:3.2,f:0.8,fi:0,icon:"ti-glass",kw:["coffee"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-632",sourceDescription:"Coffee, cappuccino, latte",type:"liquid",nutritionPer100g:{calories:27,protein:2,carbs:3.2,fat:0.8,fibre:0}},
  {name:"Tea",w:100,kcal:0,p:0,c:0,f:0,fi:0,icon:"ti-glass",kw:["tea"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171946",sourceDescription:"Beverages, tea, hibiscus, brewed",type:"liquid",nutritionPer100g:{calories:0,protein:0,carbs:0,fat:0,fibre:0}},
  {name:"Tea",w:100,kcal:0,p:0.1,c:0,f:0,fi:0,icon:"ti-glass",kw:["tea"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-165",sourceDescription:"Tea, black, infusion, average",type:"liquid",nutritionPer100g:{calories:0,protein:0.1,carbs:0,fat:0,fibre:0}},
  {name:"Cola",w:100,kcal:42,p:0,c:10.4,f:0.2,fi:0,icon:"ti-glass",kw:["cola"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174852",sourceDescription:"Beverages, carbonated, cola, regular",type:"liquid",nutritionPer100g:{calories:42,protein:0,carbs:10.4,fat:0.2,fibre:0}},
  {name:"Cola",w:100,kcal:41,p:0,c:10.9,f:0,fi:0,icon:"ti-glass",kw:["cola"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-175",sourceDescription:"Cola",type:"liquid",nutritionPer100g:{calories:41,protein:0,carbs:10.9,fat:0,fibre:0}},
  {name:"Lemonade",w:100,kcal:14,p:0,c:3.6,f:0,fi:0,icon:"ti-glass",kw:["lemonade"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174859",sourceDescription:"Lemonade, powder, prepared with water",type:"liquid",nutritionPer100g:{calories:14,protein:0,carbs:3.6,fat:0,fibre:0}},
  {name:"Lemonade",w:100,kcal:22,p:0,c:5.8,f:0,fi:0,icon:"ti-glass",kw:["lemonade"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-179",sourceDescription:"Lemonade",type:"liquid",nutritionPer100g:{calories:22,protein:0,carbs:5.8,fat:0,fibre:0}},
  {name:"Beer",w:100,kcal:43,p:0.5,c:3.5,f:0,fi:0,icon:"ti-glass",kw:["beer"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:168746",sourceDescription:"Alcoholic beverage, beer, regular, all",type:"liquid",nutritionPer100g:{calories:43,protein:0.5,carbs:3.5,fat:0,fibre:0}},
  {name:"Beer",w:100,kcal:24,p:0.3,c:0,f:0,fi:0,icon:"ti-glass",kw:["beer"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-749",sourceDescription:"Lager, standard",type:"liquid",nutritionPer100g:{calories:24,protein:0.3,carbs:0,fat:0,fibre:0}},
  {name:"Red wine",w:100,kcal:85,p:0.1,c:2.6,f:0,fi:0,icon:"ti-glass",kw:["red wine"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173190",sourceDescription:"Alcoholic beverage, wine, table, red",type:"liquid",nutritionPer100g:{calories:85,protein:0.1,carbs:2.6,fat:0,fibre:0}},
  {name:"Red wine",w:100,kcal:76,p:0.1,c:0.2,f:0,fi:0,icon:"ti-glass",kw:["red wine"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-752",sourceDescription:"Wine, red",type:"liquid",nutritionPer100g:{calories:76,protein:0.1,carbs:0.2,fat:0,fibre:0}},
  {name:"White wine",w:100,kcal:82,p:0.1,c:2.6,f:0,fi:0,icon:"ti-glass",kw:["white wine"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:174837",sourceDescription:"Alcoholic beverage, wine, table, white",type:"liquid",nutritionPer100g:{calories:82,protein:0.1,carbs:2.6,fat:0,fibre:0}},
  {name:"White wine",w:100,kcal:75,p:0.1,c:0.6,f:0,fi:0,icon:"ti-glass",kw:["white wine"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-755",sourceDescription:"Wine, white, dry",type:"liquid",nutritionPer100g:{calories:75,protein:0.1,carbs:0.6,fat:0,fibre:0}},
  {name:"Pizza, cheese and tomato",w:100,kcal:268,p:10.4,c:29,f:12.3,fi:2.2,icon:"ti-bowl-spoon",kw:["pizza, cheese and tomato"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170317",sourceDescription:"Pizza, cheese topping, regular crust, frozen, cooked",nutritionPer100g:{calories:268,protein:10.4,carbs:29,fat:12.3,fibre:2.2}},
  {name:"Pizza, cheese and tomato",w:100,kcal:272,p:12.2,c:36.1,f:9.8,fi:1.7,icon:"ti-bowl-spoon",kw:["pizza, cheese and tomato"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-936",sourceDescription:"Pizza, cheese and tomato, retail",nutritionPer100g:{calories:272,protein:12.2,carbs:36.1,fat:9.8,fibre:1.7}},
  {name:"Lasagne",w:100,kcal:135,p:7.3,c:15.4,f:4.9,fi:1.7,icon:"ti-bowl-spoon",kw:["lasagne"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172114",sourceDescription:"Lasagna with meat sauce, frozen, prepared",nutritionPer100g:{calories:135,protein:7.3,carbs:15.4,fat:4.9,fibre:1.7}},
  {name:"Lasagne",w:100,kcal:180,p:9.6,c:15.2,f:9.6,fi:0.9,icon:"ti-bowl-spoon",kw:["lasagne"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:19-481",sourceDescription:"Lasagne, homemade",nutritionPer100g:{calories:180,protein:9.6,carbs:15.2,fat:9.6,fibre:0.9}},
  {name:"Chilli con carne",w:100,kcal:107,p:5.8,c:13.1,f:3.5,fi:3.3,icon:"ti-bowl-spoon",kw:["chili con carne","chilli con carne"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172097",sourceDescription:"Chili con carne with beans, canned entree",nutritionPer100g:{calories:107,protein:5.8,carbs:13.1,fat:3.5,fibre:3.3}},
  {name:"Chilli con carne",w:100,kcal:120,p:9.2,c:4.4,f:7.5,fi:1.1,icon:"ti-bowl-spoon",kw:["chili con carne","chilli con carne"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:19-478",sourceDescription:"Chilli con carne, homemade",nutritionPer100g:{calories:120,protein:9.2,carbs:4.4,fat:7.5,fibre:1.1}},
  {name:"Chicken curry",w:100,kcal:240,p:14.6,c:14.9,f:13.6,fi:1.7,icon:"ti-bowl-spoon",kw:["chicken curry"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173346",sourceDescription:"Chicken tenders, breaded, frozen, prepared",nutritionPer100g:{calories:240,protein:14.6,carbs:14.9,fat:13.6,fibre:1.7}},
  {name:"Chicken curry",w:100,kcal:105,p:10.5,c:4.8,f:5,fi:0,icon:"ti-bowl-spoon",kw:["chicken curry"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:19-449",sourceDescription:"Curry, chicken balti, retail",nutritionPer100g:{calories:105,protein:10.5,carbs:4.8,fat:5,fibre:0}},
  {name:"Lentil soup",w:100,kcal:56,p:3.7,c:8.2,f:1.1,fi:0,icon:"ti-bowl-spoon",kw:["lentil soup"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171549",sourceDescription:"Soup, lentil with ham, canned, ready-to-serve",nutritionPer100g:{calories:56,protein:3.7,carbs:8.2,fat:1.1,fibre:0}},
  {name:"Lentil soup",w:100,kcal:121,p:5.9,c:14.6,f:4.8,fi:1.4,icon:"ti-bowl-spoon",kw:["lentil soup"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-808",sourceDescription:"Soup, lentil, homemade",nutritionPer100g:{calories:121,protein:5.9,carbs:14.6,fat:4.8,fibre:1.4}},
  {name:"Tomato soup",w:100,kcal:66,p:1.5,c:15.2,f:0.4,fi:1.1,icon:"ti-bowl-spoon",kw:["tomato soup"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:172882",sourceDescription:"Soup, tomato, canned, condensed",nutritionPer100g:{calories:66,protein:1.5,carbs:15.2,fat:0.4,fibre:1.1}},
  {name:"Tomato soup",w:100,kcal:37,p:0.9,c:4.3,f:1.9,fi:0.8,icon:"ti-bowl-spoon",kw:["tomato soup"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-636",sourceDescription:"Soup, tomato, carton, chilled",nutritionPer100g:{calories:37,protein:0.9,carbs:4.3,fat:1.9,fibre:0.8}},
  {name:"Minestrone soup",w:100,kcal:68,p:3.5,c:9.2,f:2,fi:0.8,icon:"ti-bowl-spoon",kw:["minestrone soup"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171153",sourceDescription:"Soup, minestrone, canned, condensed",nutritionPer100g:{calories:68,protein:3.5,carbs:9.2,fat:2,fibre:0.8}},
  {name:"Minestrone soup",w:100,kcal:60,p:2.1,c:7.6,f:2.3,fi:0.9,icon:"ti-bowl-spoon",kw:["minestrone soup"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-810",sourceDescription:"Soup, minestrone, homemade",nutritionPer100g:{calories:60,protein:2.1,carbs:7.6,fat:2.3,fibre:0.9}},
  {name:"Chicken noodle soup",w:100,kcal:48,p:2.4,c:6.1,f:1.6,fi:0.9,icon:"ti-bowl-spoon",kw:["chicken noodle soup"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:171543",sourceDescription:"Soup, chicken noodle, canned, condensed",nutritionPer100g:{calories:48,protein:2.4,carbs:6.1,fat:1.6,fibre:0.9}},
  {name:"Chicken noodle soup",w:100,kcal:19,p:1,c:3.2,f:0.3,fi:0.2,icon:"ti-bowl-spoon",kw:["chicken noodle soup"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:17-714",sourceDescription:"Soup, chicken noodle, dried, as served",nutritionPer100g:{calories:19,protein:1,carbs:3.2,fat:0.3,fibre:0.2}},
  {name:"Fish and chips",w:100,kcal:282,p:11.3,c:26.4,f:14.6,fi:1.4,icon:"ti-bowl-spoon",kw:["fish and chips"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170319",sourceDescription:"McDONALD'S, FILET-O-FISH",nutritionPer100g:{calories:282,protein:11.3,carbs:26.4,fat:14.6,fibre:1.4}},
  {name:"Fish and chips",w:100,kcal:240,p:16.8,c:10.7,f:14.7,fi:0.5,icon:"ti-bowl-spoon",kw:["fish and chips"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:16-368",sourceDescription:"Cod, in batter, fried, takeaway",nutritionPer100g:{calories:240,protein:16.8,carbs:10.7,fat:14.7,fibre:0.5}},
  {name:"Cheeseburger",w:100,kcal:286,p:14.6,c:23.7,f:14.8,fi:1,icon:"ti-bowl-spoon",kw:["cheeseburger"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170329",sourceDescription:"BURGER KING, Cheeseburger",nutritionPer100g:{calories:286,protein:14.6,carbs:23.7,fat:14.8,fibre:1}},
  {name:"Cheeseburger",w:100,kcal:254,p:13.6,c:28.3,f:10.4,fi:0.7,icon:"ti-bowl-spoon",kw:["cheeseburger"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:19-545",sourceDescription:"Burger, cheeseburger, takeaway",nutritionPer100g:{calories:254,protein:13.6,carbs:28.3,fat:10.4,fibre:0.7}},
  {name:"Chicken sandwich",w:100,kcal:286,p:12.1,c:26.2,f:14.7,fi:2.4,icon:"ti-bowl-spoon",kw:["chicken sandwich"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170331",sourceDescription:"BURGER KING, Original Chicken Sandwich",nutritionPer100g:{calories:286,protein:12.1,carbs:26.2,fat:14.7,fibre:2.4}},
  {name:"Chicken sandwich",w:100,kcal:172,p:10.7,c:22.5,f:4.9,fi:1.1,icon:"ti-bowl-spoon",kw:["chicken sandwich"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-964",sourceDescription:"Sandwich, white bread, chicken salad",nutritionPer100g:{calories:172,protein:10.7,carbs:22.5,fat:4.9,fibre:1.1}},
  {name:"Tuna sandwich",w:100,kcal:218,p:12.3,c:15.9,f:12,fi:0.7,icon:"ti-bowl-spoon",kw:["tuna sandwich"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170299",sourceDescription:"Fast foods, submarine sandwich, tuna on white bread with lettuce and tomato",nutritionPer100g:{calories:218,protein:12.3,carbs:15.9,fat:12,fibre:0.7}},
  {name:"Tuna sandwich",w:100,kcal:237,p:12.5,c:25.3,f:10.2,fi:1,icon:"ti-bowl-spoon",kw:["tuna sandwich"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-967",sourceDescription:"Sandwich, white bread, tuna mayonnaise",nutritionPer100g:{calories:237,protein:12.5,carbs:25.3,fat:10.2,fibre:1}},
  {name:"Ham sandwich",w:100,kcal:151,p:9.1,c:22.9,f:2.5,fi:1.3,icon:"ti-bowl-spoon",kw:["ham sandwich"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:170707",sourceDescription:"Fast foods, submarine sandwich, ham on white bread with lettuce and tomato",nutritionPer100g:{calories:151,protein:9.1,carbs:22.9,fat:2.5,fibre:1.3}},
  {name:"Ham sandwich",w:100,kcal:163,p:8.2,c:25,f:4.1,fi:1.2,icon:"ti-bowl-spoon",kw:["ham sandwich"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-965",sourceDescription:"Sandwich, white bread, ham salad",nutritionPer100g:{calories:163,protein:8.2,carbs:25,fat:4.1,fibre:1.2}},
  {name:"Egg mayonnaise sandwich",w:100,kcal:228,p:13.6,c:21.7,f:9.7,fi:1.1,icon:"ti-bowl-spoon",kw:["egg mayonnaise sandwich"],countryCodes:["GLOBAL","US"],source:"usda_sr_legacy_2018",sourceId:"fdc:173307",sourceDescription:"McDONALD'S, Egg McMUFFIN",nutritionPer100g:{calories:228,protein:13.6,carbs:21.7,fat:9.7,fibre:1.1}},
  {name:"Egg mayonnaise sandwich",w:100,kcal:243,p:8.8,c:28.5,f:11.2,fi:1.2,icon:"ti-bowl-spoon",kw:["egg mayonnaise sandwich"],countryCodes:["GB"],source:"cofid_2021",sourceId:"cofid:11-966",sourceDescription:"Sandwich, white bread, egg mayonnaise",nutritionPer100g:{calories:243,protein:8.8,carbs:28.5,fat:11.2,fibre:1.2}},

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
  'Protein powder':['whey','whey protein','protein','protein scoop','scoop of whey','choc protein','chocolate protein','choc protein powder','chocolate protein powder'],
  'Olive oil':['oil','evoo','extra virgin oil'],
  'Milk':['semi skimmed milk','semi-skimmed milk','semi skimmed','semi-skimmed','skimmed milk'],
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
  'Coriander':['cilantro'],
  'Cheddar':['grated cheese','grated cheddar','mature cheese','mature cheddar','cheese'],
  'Chicken breast fillet':['chicken fillet','chicken fillets','breast fillet','breast fillets']
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
  'small','medium','large','big','little','fresh','raw'
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
  return !!code&&code!=='GLOBAL'&&codes.includes(code);
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
