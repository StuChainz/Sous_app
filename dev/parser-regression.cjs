#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');

const QUANTITY_HINT_RE = /\b(?:\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple|half|quarter|handful|splash|drizzle|pinch|knob|pat|spoon|tablespoon|teaspoon|tbsp|tsp|cup|cups|slice|slices|scoop|scoops|ml|g|kg|oz|grams?|millilit(?:re|er)s?|lit(?:re|er)s?)\b/i;
const COMPACT_QUANTITY_RE = /\b\d+(?:\.\d+)?\s*(?:g|kg|ml|l|oz|tbsp|tsp|cups?)\b/i;
const COMMAND_WORD_RE = /\b(?:undo|remove|delete|swap|switch|replace|change|make|set|edit|clear|start again|usual|same|summary|done|finish)\b/i;

const tests = [
  {input:'greek yogurt', expect:{minItems:1, confirm:true}},
  {input:'50g greek yogurt', expect:{minItems:1, quantity:true, confirm:true}},
  {input:'full fat greek yogurt 50g', expect:{minItems:1, names:['Full fat Greek yoghurt'], quantity:true}},
  {input:'2 slices bread', expect:{minItems:1, quantity:true, confirm:true}},
  {input:'1 slice toast', expect:{minItems:1, quantity:true}},
  {input:'spoon of olive oil', expect:{minItems:1, names:['Olive oil']}},
  {input:'tablespoon of oil', expect:{minItems:1, names:['Olive oil'], quantity:true}},
  {input:'chicken rice and veg', expect:{minItems:2, confirm:true}},
  {input:'chicken and sauce', expect:{minItems:1, confirm:true}},
  {input:'cheese', expect:{minItems:1, names:['Cheddar']}},
  {input:'cheddar 30g', expect:{minItems:1, names:['Cheddar'], quantity:true}},
  {input:'cottage cheese 1 cup', expect:{minItems:1, names:['Cottage cheese'], quantity:true}},
  {input:'swap cheddar for cottage cheese', expect:{command:'changeFood'}},
  {input:'delete rice', expect:{command:'remove'}},
  {input:'remove bread', expect:{command:'remove'}},
  {input:'add two eggs and toast', expect:{minItems:2, names:['Egg'], quantity:true}},
  {input:'banana and peanut butter', expect:{minItems:2, names:['Banana','Peanut butter']}},
  {input:'whey protein shake', expect:{minItems:1, names:['Protein powder']}},
  {input:'oats milk banana', expect:{minItems:2}},
  {input:'coffee with milk', expect:{minItems:1, confirm:true}},

  {input:'add chicken breast', expect:{minItems:1, names:['Chicken breast']}},
  {input:'100g chicken breast', expect:{minItems:1, names:['Chicken breast'], quantity:true}},
  {input:'chicken breast 150 grams', expect:{minItems:1, names:['Chicken breast'], quantity:true}},
  {input:'one chicken breast fillet', expect:{minItems:1, quantity:true}},
  {input:'two chicken thighs', expect:{minItems:1, names:['Chicken thigh'], quantity:true}},
  {input:'200g turkey mince', expect:{minItems:1, names:['Turkey mince'], quantity:true}},
  {input:'steak 180g', expect:{minItems:1, names:['Beef steak'], quantity:true}},
  {input:'beef mince 250g', expect:{minItems:1, names:['Beef mince'], quantity:true}},
  {input:'bacon two rashers', expect:{minItems:1, names:['Bacon'], quantity:true}},
  {input:'two sausages', expect:{minItems:1, quantity:true}},
  {input:'salmon 120g', expect:{minItems:1, names:['Salmon'], quantity:true}},
  {input:'tin of tuna', expect:{minItems:1, confirm:true}},
  {input:'cod and potatoes', expect:{minItems:2, names:['Cod','Potato']}},
  {input:'prawns 150g', expect:{minItems:1, names:['Prawns'], quantity:true}},
  {input:'two eggs', expect:{minItems:1, names:['Egg'], quantity:true}},
  {input:'three egg whites', expect:{minItems:1, names:['Egg white'], quantity:true}},
  {input:'scrambled eggs on toast', expect:{minItems:2}},
  {input:'poached egg and rye bread', expect:{minItems:2, names:['Egg','Rye bread']}},

  {input:'milk 200ml', expect:{minItems:1, quantity:true, confirm:true}},
  {input:'semi skimmed milk 100ml', expect:{minItems:1, names:['Milk'], quantity:true}},
  {input:'whole milk 250ml', expect:{minItems:1, names:['Whole milk'], quantity:true}},
  {input:'oat milk 150ml', expect:{minItems:1, names:['Oat milk'], quantity:true}},
  {input:'almond milk half cup', expect:{minItems:1, names:['Almond milk'], quantity:true}},
  {input:'fat free greek yogurt 170g', expect:{minItems:1, names:['Fat free Greek yoghurt'], quantity:true}},
  {input:'natural greek yoghurt pot', expect:{minItems:1, names:['Greek yoghurt']}},
  {input:'skyr 150g', expect:{minItems:1, names:['Skyr'], quantity:true}},
  {input:'mozzarella 40g', expect:{minItems:1, names:['Mozzarella'], quantity:true}},
  {input:'parmesan 10g', expect:{minItems:1, names:['Parmesan'], quantity:true}},
  {input:'cream cheese tablespoon', expect:{minItems:1, names:['Cream cheese'], quantity:true}},
  {input:'butter teaspoon', expect:{minItems:1, names:['Butter'], quantity:true}},
  {input:'knob of butter', expect:{minItems:1, names:['Butter'], quantity:true}},

  {input:'rice', expect:{minItems:1, confirm:true}},
  {input:'white rice 180g', expect:{minItems:1, names:['White rice'], quantity:true}},
  {input:'brown rice 100g', expect:{minItems:1, names:['Brown rice'], quantity:true}},
  {input:'pasta 75g', expect:{minItems:1, names:['Pasta'], quantity:true}},
  {input:'spaghetti 90g', expect:{minItems:1, names:['Pasta'], quantity:true}},
  {input:'oats 40g', expect:{minItems:1, quantity:true}},
  {input:'half cup oats', expect:{minItems:1, quantity:true}},
  {input:'porridge oats and milk', expect:{minItems:2}},
  {input:'quinoa 80g', expect:{minItems:1, names:['Quinoa'], quantity:true}},
  {input:'couscous 100g', expect:{minItems:1, names:['Couscous'], quantity:true}},
  {input:'one wrap', expect:{minItems:1, names:['Tortilla wrap'], quantity:true}},
  {input:'bagel with cream cheese', expect:{minItems:2, names:['Bagel','Cream cheese']}},
  {input:'two rice cakes', expect:{minItems:1, names:['Rice cake'], quantity:true}},
  {input:'bread roll', expect:{minItems:1, names:['Bread roll']}},

  {input:'broccoli 80g', expect:{minItems:1, names:['Broccoli'], quantity:true}},
  {input:'brocoli 50g', expect:{minItems:1, names:['Broccoli'], quantity:true}},
  {input:'spinach handful', expect:{minItems:1, names:['Spinach'], quantity:true}},
  {input:'kale 30g', expect:{minItems:1, names:['Kale'], quantity:true}},
  {input:'sweet potato 200g', expect:{minItems:1, names:['Sweet potato'], quantity:true}},
  {input:'jacket potato', expect:{minItems:1}},
  {input:'tomatoes and cucumber', expect:{minItems:2, names:['Tomato','Cucumber']}},
  {input:'onion and mushrooms', expect:{minItems:2, names:['Onion','Mushrooms']}},
  {input:'bell peppers 100g', expect:{minItems:1, names:['Peppers'], quantity:true}},
  {input:'carrot celery onion', expect:{minItems:3}},
  {input:'courgette 100g', expect:{minItems:1, names:['Courgette'], quantity:true}},
  {input:'zucchini 100g', expect:{minItems:1, names:['Courgette'], quantity:true}},
  {input:'cauliflower rice', expect:{minItems:1}},
  {input:'peas and green beans', expect:{minItems:2, names:['Garden peas','Green beans']}},
  {input:'avocado half', expect:{minItems:1, names:['Avocado'], quantity:true}},
  {input:'lettuce tomato cucumber', expect:{minItems:3}},

  {input:'banana', expect:{minItems:1, names:['Banana']}},
  {input:'two bananas', expect:{minItems:1, names:['Banana'], quantity:true}},
  {input:'apple and peanut butter', expect:{minItems:2, names:['Apple','Peanut butter']}},
  {input:'orange', expect:{minItems:1, names:['Orange']}},
  {input:'strawberries 100g', expect:{minItems:1, names:['Strawberries'], quantity:true}},
  {input:'blueberries handful', expect:{minItems:1, names:['Blueberries'], quantity:true}},
  {input:'raspberries and greek yoghurt', expect:{minItems:2, confirm:true}},
  {input:'grapes 80g', expect:{minItems:1, names:['Grapes'], quantity:true}},
  {input:'mango and pineapple', expect:{minItems:2, names:['Mango','Pineapple']}},
  {input:'pear and kiwi', expect:{minItems:2, names:['Pear','Kiwi']}},

  {input:'almonds 30g', expect:{minItems:1, names:['Almonds'], quantity:true}},
  {input:'walnuts handful', expect:{minItems:1, names:['Walnuts'], quantity:true}},
  {input:'cashews 25g', expect:{minItems:1, names:['Cashews'], quantity:true}},
  {input:'pistachios 20g', expect:{minItems:1, names:['Pistachios'], quantity:true}},
  {input:'peanut butter tablespoon', expect:{minItems:1, names:['Peanut butter'], quantity:true}},
  {input:'almond butter 1 tbsp', expect:{minItems:1, names:['Almond butter'], quantity:true}},
  {input:'chia seeds teaspoon', expect:{minItems:1, names:['Chia seeds'], quantity:true}},
  {input:'flaxseed 10g', expect:{minItems:1, names:['Flaxseeds'], quantity:true}},
  {input:'pumpkin seeds 15g', expect:{minItems:1, names:['Pumpkin seeds'], quantity:true}},

  {input:'olive oil 1 tbsp', expect:{minItems:1, names:['Olive oil'], quantity:true}},
  {input:'extra virgin olive oil drizzle', expect:{minItems:1, names:['Olive oil'], quantity:true}},
  {input:'coconut oil teaspoon', expect:{minItems:1, names:['Coconut oil'], quantity:true}},
  {input:'vegetable oil tablespoon', expect:{minItems:1, names:['Vegetable oil'], quantity:true}},
  {input:'ketchup 20g', expect:{minItems:1, names:['Ketchup'], quantity:true}},
  {input:'mayo 15g', expect:{minItems:1, names:['Mayonnaise'], quantity:true}},
  {input:'soy sauce 10ml', expect:{minItems:1, names:['Soy sauce'], quantity:true}},
  {input:'honey teaspoon', expect:{minItems:1, names:['Honey'], quantity:true}},
  {input:'hummus 50g', expect:{minItems:1, names:['Hummus'], quantity:true}},
  {input:'pesto tablespoon', expect:{minItems:1, names:['Pesto'], quantity:true}},

  {input:'protein powder scoop', expect:{minItems:1, names:['Protein powder'], quantity:true}},
  {input:'two scoops whey', expect:{minItems:1, names:['Protein powder'], quantity:true}},
  {input:'choc protein powder 30g', expect:{minItems:1, names:['Protein powder'], quantity:true}},
  {input:'casein protein scoop', expect:{minItems:1, names:['Casein protein'], quantity:true}},
  {input:'collagen powder 10g', expect:{minItems:1, names:['Collagen powder'], quantity:true}},

  {input:'chicken breast rice and broccoli', expect:{minItems:3, names:['Chicken breast','Broccoli']}},
  {input:'100g chicken 200g rice 50g broccoli', expect:{minItems:3, quantity:true, confirm:true}},
  {input:'salmon potatoes and green beans', expect:{minItems:3, names:['Salmon','Potato','Green beans']}},
  {input:'eggs toast and avocado', expect:{minItems:3}},
  {input:'oats whey banana and milk', expect:{minItems:4}},
  {input:'greek yogurt blueberries and honey', expect:{minItems:3, confirm:true}},
  {input:'tuna pasta mayo and sweetcorn', expect:{minItems:4, confirm:true}},
  {input:'beef mince pasta and tomato sauce', expect:{minItems:3}},
  {input:'chicken wrap with lettuce and mayo', expect:{minItems:4, confirm:true}},
  {input:'baked beans on toast', expect:{minItems:2}},
  {input:'coffee milk and sugar', expect:{minItems:1, confirm:true}},
  {input:'protein shake with oat milk and banana', expect:{minItems:3, names:['Protein powder','Oat milk','Banana']}},

  {input:'undo that', expect:{command:'undo'}},
  {input:'remove last item', expect:{command:'undo'}},
  {input:'remove milk', expect:{command:'remove'}},
  {input:'delete the rice', expect:{command:'remove'}},
  {input:'actually make that 50 grams', expect:{command:'changeLastWeight'}},
  {input:'make that 2 slices', expect:{command:'changeLastWeight'}},
  {input:'change cheddar to mozzarella', expect:{command:'changeFood'}},
  {input:'replace chicken breast with chicken thigh', expect:{command:'changeFood'}},
  {input:'brown rice instead of white rice', expect:{command:'changeFood'}},
  {input:'use olive oil instead', expect:{command:'changeLastFood'}},
  {input:'actually oat milk not milk', expect:{command:'changeFood'}},
  {input:'actually 75g', expect:{command:'changeLastWeight'}},
  {input:'actually chicken thigh', expect:{command:'changeLastFood'}},
  {input:'change rice to 200 grams', expect:{command:'changeWeight'}},
  {input:'set bread to one slice', expect:{command:'changeWeight'}},
  {input:'clear this meal', expect:{command:'clear'}},
  {input:'start again', expect:{command:'clear'}},
  {input:'show meal summary', expect:{command:'summary'}},
  {input:'done', expect:{command:'summary'}},
];

function makeLocalStorage(){
  const store = new Map();
  return {
    getItem(key){ return store.has(String(key)) ? store.get(String(key)) : null; },
    setItem(key,value){ store.set(String(key), String(value)); },
    removeItem(key){ store.delete(String(key)); },
    clear(){ store.clear(); },
  };
}

function createParserContext(){
  const context = {
    console,
    Date,
    Math,
    RegExp,
    JSON,
    Number,
    String,
    Array,
    Object,
    parseFloat,
    parseInt,
    isNaN,
    localStorage: makeLocalStorage(),
    meal: [],
    currentMealSection: null,
    nextIngId: 1,
    document: {
      querySelector(){ return null; },
    },
    speak(){},
    showToast(){},
    getCustomFoods(){ return []; },
    getRecentIngredients(){ return []; },
    getUsualMeals(){ return {}; },
    getUserCountry(){ return 'GLOBAL'; },
  };
  vm.createContext(context);
  for(const file of ['food-data.js', 'parser.js']){
    const source = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
    vm.runInContext(source, context, {filename:file});
  }
  const required = ['parseText', 'splitIngredients', 'resolveIngredientLocally', 'parserIsUncertain'];
  const missing = required.filter(name => typeof context[name] !== 'function');
  if(missing.length) throw new Error(`Missing parser globals: ${missing.join(', ')}`);
  return context;
}

function itemSummary(item){
  if(item.command){
    return {
      type: 'command',
      command: item.command,
      target: item.target || null,
      replacement: item.replacement || null,
      quantityText: item.quantityText || null,
      section: item.section || null,
      query: item.query || null,
    };
  }
  if(item.ambiguous){
    return {
      type: 'ambiguous',
      label: item.label || null,
      amount: item.amount ?? null,
      question: item.question || null,
      matches: Array.isArray(item.matches) ? item.matches.map(food => food.name) : [],
    };
  }
  return {
    type: 'food',
    name: item.name || null,
    weight: item.weight ?? null,
    displayWeight: item.displayWeight || null,
    weightSpecified: !!item.weightSpecified,
    kcal: item.kcal ?? null,
    protein: item.protein ?? null,
    carbs: item.carbs ?? null,
    fat: item.fat ?? null,
    fibre: item.fibre ?? null,
    confidence: item.confidence || null,
    needsConfirm: !!item.needsConfirm,
    rawFoodName: item.rawFood && item.rawFood.name ? item.rawFood.name : null,
    customMacro: !!item.customMacro,
  };
}

function namesFromResult(summary){
  return summary
    .filter(item => item.type === 'food')
    .map(item => item.name)
    .filter(Boolean);
}

function ambiguousNames(summary){
  return summary
    .filter(item => item.type === 'ambiguous')
    .flatMap(item => item.matches || []);
}

function commandsFromResult(summary){
  return summary
    .filter(item => item.type === 'command')
    .map(item => item.command);
}

function confirmationRequired(summary){
  return summary.some(item => item.type === 'ambiguous' || item.needsConfirm || item.confidence === 'low');
}

function hasExpectedName(summary, expectedName){
  const wanted = String(expectedName).toLowerCase();
  return [...namesFromResult(summary), ...ambiguousNames(summary)]
    .some(name => String(name).toLowerCase() === wanted);
}

function foodItems(summary){
  return summary.filter(item => item.type === 'food');
}

function ambiguousItems(summary){
  return summary.filter(item => item.type === 'ambiguous');
}

function hasQuantityHint(input){
  return QUANTITY_HINT_RE.test(input) || COMPACT_QUANTITY_RE.test(input);
}

function explicitQuantityCaptured(summary, input){
  return foodItems(summary).some(item => item.weightSpecified || item.customMacro || item.displayWeight)
    || (hasQuantityHint(input) && ambiguousItems(summary).some(item => item.amount !== null));
}

function duplicateNames(summary){
  const seen = new Set();
  const duplicates = new Set();
  for(const name of namesFromResult(summary)){
    const key = name.toLowerCase();
    if(seen.has(key)) duplicates.add(name);
    seen.add(key);
  }
  return [...duplicates];
}

function runOne(context, test, index){
  const started = Date.now();
  const record = {
    index: index + 1,
    input: test.input,
    parsedResults: [],
    itemCount: 0,
    itemNames: [],
    quantities: [],
    commandsDetected: [],
    confirmationRequired: false,
    errorsThrown: [],
    suspicious: [],
    failures: [],
    pass: true,
    elapsedMs: 0,
  };

  try{
    const raw = context.parseText(test.input) || [];
    record.parsedResults = raw.map(itemSummary);
    record.itemCount = record.parsedResults.filter(item => item.type !== 'command').length;
    record.itemNames = namesFromResult(record.parsedResults);
    record.quantities = record.parsedResults
      .filter(item => item.type === 'food' || item.type === 'ambiguous')
      .map(item => ({
        name: item.name || item.label || null,
        weight: item.weight ?? item.amount ?? null,
        weightSpecified: !!item.weightSpecified,
      }));
    record.commandsDetected = commandsFromResult(record.parsedResults);
    record.confirmationRequired = confirmationRequired(record.parsedResults);

    const expect = test.expect || {};
    if(expect.command && !record.commandsDetected.includes(expect.command)){
      record.failures.push(`expected command "${expect.command}", got ${record.commandsDetected.join(', ') || 'none'}`);
    }
    if(expect.minItems != null && record.itemCount < expect.minItems){
      record.failures.push(`expected at least ${expect.minItems} item(s), got ${record.itemCount}`);
    }
    for(const name of expect.names || []){
      if(!hasExpectedName(record.parsedResults, name)){
        record.failures.push(`missing expected food "${name}"`);
      }
    }
    if(expect.quantity && !explicitQuantityCaptured(record.parsedResults, test.input)){
      record.failures.push('expected a quantity/weight to be captured');
    }
    if(expect.confirm === true && !record.confirmationRequired){
      record.suspicious.push('expected confirmation/ambiguity but none was reported');
    }
    if(expect.confirm === false && record.confirmationRequired){
      record.suspicious.push('confirmation required unexpectedly');
    }

    const nonCommandInput = !expect.command && !COMMAND_WORD_RE.test(test.input);
    if(!record.parsedResults.length){
      record.suspicious.push('empty parser result');
      if(nonCommandInput) record.failures.push('no food or command parsed');
    }
    if(record.parsedResults.length && record.itemCount === 0 && !record.commandsDetected.length){
      record.suspicious.push('parser returned no food items and no command');
    }
    if(hasQuantityHint(test.input) && record.itemCount > 0 && !explicitQuantityCaptured(record.parsedResults, test.input)){
      record.suspicious.push('input mentions quantity but no quantity was captured');
    }
    if(hasQuantityHint(test.input)){
      const missing = foodItems(record.parsedResults).filter(item => !item.weightSpecified && item.weight === null);
      if(missing.length) record.suspicious.push(`missing quantities on ${missing.map(item => item.name).join(', ')}`);
    }
    const duplicates = duplicateNames(record.parsedResults);
    if(duplicates.length) record.suspicious.push(`duplicate item name(s): ${duplicates.join(', ')}`);
    for(const item of record.parsedResults){
      if(item.type === 'ambiguous') record.suspicious.push(`ambiguous "${item.label}" -> ${(item.matches || []).join(' / ') || 'no options'}`);
      if(item.type === 'food' && item.confidence && item.confidence !== 'high') record.suspicious.push(`low confidence item: ${item.name} (${item.confidence})`);
    }
  }catch(error){
    record.errorsThrown.push(error && error.stack ? error.stack : String(error));
    record.failures.push('unexpected error thrown');
  }

  record.elapsedMs = Date.now() - started;
  record.pass = record.failures.length === 0 && record.errorsThrown.length === 0;
  return record;
}

function severity(record){
  let score = 0;
  if(record.errorsThrown.length) score += 1000;
  score += record.failures.length * 100;
  score += record.suspicious.length * 10;
  if(!record.parsedResults.length) score += 25;
  return score;
}

function printRecord(record){
  console.log(`\n#${record.index} ${record.pass ? 'PASS' : 'FAIL'} ${record.input}`);
  if(record.failures.length) console.log(`  Failures: ${record.failures.join(' | ')}`);
  if(record.suspicious.length) console.log(`  Suspicious: ${record.suspicious.join(' | ')}`);
  if(record.errorsThrown.length) console.log(`  Errors: ${record.errorsThrown.map(e => e.split('\n')[0]).join(' | ')}`);
  console.log(`  Items: ${record.itemCount} ${record.itemNames.length ? `(${record.itemNames.join(', ')})` : ''}`);
  console.log(`  Quantities: ${record.quantities.map(q => `${q.name || 'item'}=${q.weight == null ? '?' : q.weight}${q.weightSpecified ? '*' : ''}`).join(', ') || 'none'}`);
  console.log(`  Commands: ${record.commandsDetected.join(', ') || 'none'}`);
  console.log(`  Confirmation required: ${record.confirmationRequired ? 'yes' : 'no'}`);
  console.log(`  Parsed: ${JSON.stringify(record.parsedResults)}`);
}

function main(){
  const args = new Set(process.argv.slice(2));
  const context = createParserContext();
  const records = tests.map((test, index) => runOne(context, test, index));
  const failed = records.filter(record => !record.pass);
  const suspicious = records.filter(record => record.suspicious.length);
  const errors = records.filter(record => record.errorsThrown.length);
  const duplicates = records.filter(record => record.suspicious.some(item => item.includes('duplicate item name')));
  const missingQuantities = records.filter(record => record.suspicious.some(item => item.includes('quantity')));
  const unknownFoods = records.filter(record => record.failures.some(item => item.includes('no food') || item.includes('missing expected food') || item.includes('expected at least')));
  const worst = records
    .filter(record => !record.pass || record.suspicious.length)
    .sort((a,b) => severity(b) - severity(a) || a.index - b.index)
    .slice(0, 20);

  const summary = {
    total: records.length,
    passed: records.length - failed.length,
    failed: failed.length,
    unexpectedErrors: errors.length,
    suspiciousOutputs: suspicious.length,
    duplicates: duplicates.length,
    missingQuantities: missingQuantities.length,
    unknownFoods: unknownFoods.length,
  };

  if(args.has('--json')){
    console.log(JSON.stringify({summary, worst20: worst, records}, null, 2));
    process.exit(failed.length || errors.length ? 1 : 0);
  }

  console.log('Sous parser regression harness');
  console.log('================================');
  console.log(`Total: ${summary.total}`);
  console.log(`Pass/fail: ${summary.passed} pass, ${summary.failed} fail`);
  console.log(`Unexpected errors: ${summary.unexpectedErrors}`);
  console.log(`Suspicious outputs: ${summary.suspiciousOutputs}`);
  console.log(`Duplicates: ${summary.duplicates}`);
  console.log(`Missing quantities: ${summary.missingQuantities}`);
  console.log(`Unknown foods / missing expected items: ${summary.unknownFoods}`);
  console.log('\nWorst 20 failures/suspicious cases first');
  console.log('----------------------------------------');
  if(!worst.length){
    console.log('No failures or suspicious cases.');
  } else {
    worst.forEach(printRecord);
  }

  if(args.has('--all')){
    console.log('\nAll records');
    console.log('-----------');
    records.forEach(printRecord);
  } else {
    console.log('\nTip: run with --all for every record, or --json for machine-readable output.');
  }

  process.exit(failed.length || errors.length ? 1 : 0);
}

main();
