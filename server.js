// Local AI proxy server.
// Keeps the OpenAI API key server-side and avoids CORS issues from the browser.
// The frontend calls /api/interpret instead of OpenAI directly.

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const {
  getConsumablePresets,
  findConsumablePresetByText,
  resolveConsumablePresetQuantity,
  createConsumablePresetRow,
  createCustomConsumableEstimate
} = require('./js/consumable-presets.js');

const app = express();
const PORT = process.env.PORT || 3001;
const ROOT_DIR = __dirname;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function loadLocalEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return;
    const key = match[1];
    if (process.env[key] !== undefined) return;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

loadLocalEnv();

app.set('trust proxy', 1);
app.use(express.json({ limit: '6mb' }));
const allowedOrigins = [
  /^http:\/\/localhost(:\d+)?$/,
  'https://stuchainz.github.io'
];
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const ok = allowedOrigins.some(allowed => (
      allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
    ));
    return ok ? cb(null, true) : cb(new Error('Not allowed by CORS'));
  }
}));

// Serve the frontend from the project root without exposing local secrets.
app.use(express.static(ROOT_DIR, { dotfiles: 'ignore' }));

function rateLimitResponse(message) {
  return { error: message || 'Too many requests. Please wait a moment and try again.' };
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: IS_PRODUCTION ? 180 : 1200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: rateLimitResponse('Too many API requests. Please wait a moment and try again.')
});

const expensiveApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: IS_PRODUCTION ? 30 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: rateLimitResponse('Too many AI requests. Please wait a moment and try again.')
});

app.use('/api', apiLimiter);
app.use([
  '/api/photo-estimate',
  '/api/photo-estimate-adjust',
  '/api/menu-scan',
  '/api/menu-scan/photo-update',
  '/api/realtime/session',
  '/api/interpret',
  '/api/repair-transcript',
  '/api/interpret-action'
], expensiveApiLimiter);

const REALTIME_MODEL = 'gpt-realtime-mini';
const REALTIME_VOICE = 'marin';

function errorBody(error, detailKey, detailValue) {
  const body = { error };
  if (!IS_PRODUCTION && detailValue !== undefined && detailValue !== null && detailValue !== '') {
    body[detailKey || 'detail'] = detailValue;
  }
  return body;
}

function clampConfidence(value) {
  const confidence = String(value || '').toLowerCase().trim();
  return ['low', 'medium', 'high'].includes(confidence) ? confidence : 'low';
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function cleanNullableGrams(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalisePhotoEstimate(parsed) {
  const fallbackTotals = parsed && typeof parsed === 'object'
    ? (parsed.totals || {})
    : {};
  const rawItems = Array.isArray(parsed && parsed.items) ? parsed.items : [];
  const items = rawItems
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      name: String(item.name || 'Photo item').trim() || 'Photo item',
      estimatedGrams: cleanNullableGrams(item.estimatedGrams),
      calories: cleanNumber(item.calories),
      protein: cleanNumber(item.protein),
      carbs: cleanNumber(item.carbs),
      fat: cleanNumber(item.fat),
      confidence: clampConfidence(item.confidence || parsed.confidence),
      notes: String(item.notes || '')
    }));

  if (!items.length) {
    items.push({
      name: String(parsed && parsed.mealName || 'Photo meal').trim() || 'Photo meal',
      estimatedGrams: null,
      calories: cleanNumber(fallbackTotals.calories || parsed && parsed.estimatedCalories),
      protein: cleanNumber(fallbackTotals.protein || parsed && parsed.protein),
      carbs: cleanNumber(fallbackTotals.carbs || parsed && parsed.carbs),
      fat: cleanNumber(fallbackTotals.fat || parsed && parsed.fat),
      confidence: clampConfidence(parsed && parsed.confidence),
      notes: String(parsed && parsed.notes || '')
    });
  }

  const rowTotals = items.reduce((totals, item) => ({
    calories: totals.calories + item.calories,
    protein: totals.protein + item.protein,
    carbs: totals.carbs + item.carbs,
    fat: totals.fat + item.fat
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  return {
    mealName: String(parsed && parsed.mealName || 'Photo meal').trim() || 'Photo meal',
    confidence: clampConfidence(parsed && parsed.confidence),
    items,
    totals: {
      calories: Math.round(rowTotals.calories),
      protein: Math.round(rowTotals.protein * 10) / 10,
      carbs: Math.round(rowTotals.carbs * 10) / 10,
      fat: Math.round(rowTotals.fat * 10) / 10
    },
    notes: String(parsed && parsed.notes || '')
  };
}

function menuScanPhotoUpdateSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      mealName: { type: 'string' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            estimatedGrams: { type: ['number', 'null'] },
            calories: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            notes: { type: 'string' },
            source: { type: 'string', enum: ['menu_scan', 'consumable_preset', 'consumable_ai_estimate'] },
            presetId: { type: ['string', 'null'] }
          },
          required: ['name', 'estimatedGrams', 'calories', 'protein', 'carbs', 'fat', 'confidence', 'notes', 'source', 'presetId']
        }
      },
      totals: {
        type: 'object',
        additionalProperties: false,
        properties: {
          calories: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' }
        },
        required: ['calories', 'protein', 'carbs', 'fat']
      },
      notes: { type: 'string' }
    },
    required: ['mealName', 'confidence', 'items', 'totals', 'notes']
  };
}

function normaliseMenuScanPhotoRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 20)
    .filter(row => row && typeof row === 'object')
    .map(row => ({
      name: String(row.name || '').trim().slice(0, 140),
      estimatedGrams: cleanNullableGrams(row.estimatedGrams ?? row.grams ?? row.weight),
      calories: cleanNumber(row.calories ?? row.kcal),
      protein: cleanNumber(row.protein),
      carbs: cleanNumber(row.carbs),
      fat: cleanNumber(row.fat),
      confidence: clampConfidence(row.confidence),
      notes: String(row.notes || '').slice(0, 260),
      source: ['menu_scan', 'consumable_preset', 'consumable_ai_estimate'].includes(row.source) ? row.source : 'menu_scan',
      presetId: row.presetId ? String(row.presetId).slice(0, 120) : null
    }))
    .filter(row => row.name);
}

function normaliseMenuScanPhotoUpdate(parsed) {
  const rawItems = Array.isArray(parsed && parsed.items) ? parsed.items : [];
  const items = rawItems
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      name: String(item.name || 'Menu item').trim() || 'Menu item',
      estimatedGrams: cleanNullableGrams(item.estimatedGrams),
      calories: cleanNumber(item.calories),
      protein: cleanNumber(item.protein),
      carbs: cleanNumber(item.carbs),
      fat: cleanNumber(item.fat),
      confidence: clampConfidence(item.confidence || parsed.confidence),
      notes: String(item.notes || ''),
      source: ['menu_scan', 'consumable_preset', 'consumable_ai_estimate'].includes(item.source) ? item.source : 'menu_scan',
      presetId: item.presetId ? String(item.presetId) : null
    }));
  const rowTotals = items.reduce((totals, item) => ({
    calories: totals.calories + item.calories,
    protein: totals.protein + item.protein,
    carbs: totals.carbs + item.carbs,
    fat: totals.fat + item.fat
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  return {
    mealName: String(parsed && parsed.mealName || 'Updated menu meal').trim() || 'Updated menu meal',
    source: 'menu_scan',
    confidence: clampConfidence(parsed && parsed.confidence),
    items,
    totals: {
      calories: Math.round(rowTotals.calories),
      protein: Math.round(rowTotals.protein * 10) / 10,
      carbs: Math.round(rowTotals.carbs * 10) / 10,
      fat: Math.round(rowTotals.fat * 10) / 10
    },
    notes: String(parsed && parsed.notes || '')
  };
}

function normalisePhotoAdjustEstimate(parsed) {
  const rawItems = Array.isArray(parsed && parsed.items) ? parsed.items : [];
  const items = rawItems
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const grams = cleanNullableGrams(item.grams ?? item.estimatedGrams);
      const kcal = cleanNumber(item.kcal ?? item.calories);
      return {
        name: String(item.name || 'Photo item').trim() || 'Photo item',
        quantity: item.quantity === null || item.quantity === undefined || item.quantity === ''
          ? null
          : cleanNumber(item.quantity),
        unit: String(item.unit || (grams !== null ? 'g' : '')).trim(),
        grams,
        kcal,
        protein: cleanNumber(item.protein),
        carbs: cleanNumber(item.carbs),
        fat: cleanNumber(item.fat),
        fibre: cleanNumber(item.fibre ?? item.fiber),
        confidence: clampConfidence(item.confidence),
        reason: String(item.reason || item.notes || '')
      };
    });

  return {
    items,
    summary: String(parsed && parsed.summary || ''),
    warnings: Array.isArray(parsed && parsed.warnings)
      ? parsed.warnings.map(warning => String(warning || '').trim()).filter(Boolean).slice(0, 5)
      : []
  };
}

const MENU_MACRO_KEYS = ['kcal', 'protein', 'carbs', 'fat'];

function recoverableError(error, detailKey, detailValue) {
  return { ...errorBody(error, detailKey, detailValue), recoverable: true };
}

function roundSignedMacro(value, key) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return key === 'kcal'
    ? Math.round(number)
    : Math.round(number * 10) / 10;
}

function cleanMenuKcal(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

function cleanMenuMacro(value) {
  return cleanMacro(value);
}

function normaliseMenuMacroSet(value, { requireTargets = false } = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const out = {};

  for (const key of MENU_MACRO_KEYS) {
    const raw = source[key];
    if (raw === undefined || raw === null || raw === '') {
      if (requireTargets) return null;
      out[key] = 0;
      continue;
    }

    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0 || (requireTargets && number <= 0)) {
      return null;
    }

    out[key] = key === 'kcal' ? Math.round(number) : Math.round(number * 10) / 10;
  }

  return out;
}

function subtractMenuMacros(left, right) {
  return MENU_MACRO_KEYS.reduce((out, key) => {
    out[key] = roundSignedMacro((left && left[key] || 0) - (right && right[key] || 0), key);
    return out;
  }, {});
}

function sumMenuRows(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((totals, row) => {
    totals.kcal += Number(row && (row.kcal ?? row.calories)) || 0;
    totals.protein += Number(row && row.protein) || 0;
    totals.carbs += Number(row && row.carbs) || 0;
    totals.fat += Number(row && row.fat) || 0;
    return totals;
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

function remainingAfterMenuRows(remaining, rows) {
  return subtractMenuMacros(remaining, sumMenuRows(rows));
}

function cleanMenuText(value, maxLength = 800) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normaliseMenuNameKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const MENU_CANONICAL_FOOD_TERMS = new Set([
  'chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'salmon', 'tuna', 'cod', 'fish', 'prawn', 'prawns',
  'shrimp', 'crab', 'egg', 'eggs', 'rice', 'pasta', 'noodles', 'bread', 'toast', 'potato', 'beans',
  'lentils', 'chickpeas', 'tofu', 'cheese', 'yoghurt', 'yogurt', 'milk', 'cream', 'butter', 'salad',
  'soup', 'stew', 'curry', 'wrap', 'sandwich', 'burger', 'pizza', 'tortilla', 'oats', 'avocado',
  'tomato', 'mushroom', 'spinach', 'broccoli', 'peas', 'corn', 'sausage', 'bacon', 'ham'
]);

const MENU_PRESERVE_DISH_TERMS = new Set([
  'shakshuka',
  'bibimbap',
  'chilaquiles',
  'arepa',
  'arepa reina pepiada',
  'reina pepiada',
  'huevos rancheros',
  'croque madame',
  'creme brulee',
  'pho',
  'ramen',
  'udon',
  'soba',
  'bao',
  'banh mi',
  'biryani',
  'tagine',
  'mezze',
  'hummus',
  'falafel',
  'tostada',
  'quesadilla',
  'enchilada',
  'tamale',
  'gnocchi',
  'risotto',
  'paella',
  'lasagne',
  'pierogi',
  'schnitzel',
  'katsu',
  'sashimi',
  'sushi',
  'ceviche',
  'empanada',
  'laksa',
  'rendang',
  'satay',
  'tikka',
  'masala',
  'dosa',
  'idli',
  'injera',
  'jollof',
  'moussaka',
  'shawarma',
  'gyros',
  'bulgogi'
]);

const MENU_FAKE_DISH_TERMS = new Set([
  'shakeplate',
  'eggcano',
  'toastbucket',
  'ricewhip'
]);

const MENU_SMALL_NAME_WORDS = new Set(['and', 'or', 'of', 'the', 'with', 'in', 'on', 'a', 'an', 'al', 'el', 'la', 'le', 'de', 'di']);

function titleCaseMenuDish(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/[A-Z]/.test(raw.slice(1))) return raw;
  return raw.toLowerCase().replace(/\p{L}[\p{L}'-]*/gu, (word, offset) => {
    if (offset > 0 && MENU_SMALL_NAME_WORDS.has(word)) return word;
    return word.charAt(0).toLocaleUpperCase() + word.slice(1);
  });
}

function menuNameTokens(value) {
  return normaliseMenuNameKey(value).split(/\s+/).filter(Boolean);
}

function menuLooksLikeKnownFood(value) {
  const key = normaliseMenuNameKey(value);
  if (!key) return false;
  const tokens = menuNameTokens(value);
  if (tokens.some(token => MENU_CANONICAL_FOOD_TERMS.has(token))) return true;
  for (const term of MENU_CANONICAL_FOOD_TERMS) {
    if (term.includes(' ') && key.includes(term)) return true;
  }
  return false;
}

function menuLooksLikeKnownDishEntity(value) {
  const key = normaliseMenuNameKey(value);
  if (!key) return false;
  if (MENU_PRESERVE_DISH_TERMS.has(key)) return true;
  for (const term of MENU_PRESERVE_DISH_TERMS) {
    if (term.includes(' ') ? key.includes(term) : menuNameTokens(value).includes(term)) return true;
  }
  return false;
}

function menuLooksInvented(value) {
  const key = normaliseMenuNameKey(value);
  if (!key) return true;
  if (MENU_FAKE_DISH_TERMS.has(key)) return true;
  const tokens = menuNameTokens(value);
  return tokens.length === 1 && /(?:bucket|whip|cano|plate)$/.test(tokens[0]) && !menuLooksLikeKnownDishEntity(value);
}

function levenshteinDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const prev = Array.from({ length: right.length + 1 }, (_, index) => index);
  const curr = Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = curr[j];
  }
  return prev[right.length];
}

function menuNameSimilarity(left, right) {
  const a = normaliseMenuNameKey(left);
  const b = normaliseMenuNameKey(right);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLength = Math.max(a.length, b.length);
  return maxLength ? 1 - (levenshteinDistance(a, b) / maxLength) : 1;
}

function menuConfidenceScore(confidence, similarity = 1) {
  const base = confidence === 'high' ? 0.9 : confidence === 'medium' ? 0.65 : 0.35;
  return Math.max(0.05, Math.min(0.99, Math.round((base * 0.75 + similarity * 0.25) * 100) / 100));
}

function validateMenuOcrName({ menuText, suggestedName, confidence }) {
  const originalRaw = cleanMenuText(menuText || suggestedName, 120);
  const correctedRaw = cleanMenuText(suggestedName || menuText, 120);
  const original = originalRaw || correctedRaw || 'Menu option';
  const corrected = correctedRaw || original;
  const clampedConfidence = clampConfidence(confidence);
  const similarity = menuNameSimilarity(original, corrected);
  const changed = normaliseMenuNameKey(original) !== normaliseMenuNameKey(corrected);
  const lowConfidence = clampedConfidence === 'low' || similarity < 0.72;
  const originalLooksLikeDish = menuLooksLikeKnownDishEntity(original);
  const correctedKnown = menuLooksLikeKnownFood(corrected) || menuLooksLikeKnownDishEntity(corrected);
  const correctedInvented = menuLooksInvented(corrected);

  let displayName = corrected;
  let correctionPreserved = false;
  let correctionRejected = false;
  let reason = '';

  if (changed && lowConfidence && originalLooksLikeDish && (!correctedKnown || correctedInvented)) {
    displayName = titleCaseMenuDish(original);
    correctionPreserved = true;
    correctionRejected = true;
    reason = 'preserved_likely_dish_name';
  } else if (correctedInvented && (!correctedKnown || lowConfidence)) {
    displayName = originalLooksLikeDish ? titleCaseMenuDish(original) : 'Unclear menu item';
    correctionRejected = true;
    correctionPreserved = originalLooksLikeDish;
    reason = originalLooksLikeDish ? 'rejected_invented_correction' : 'rejected_invented_name';
  } else if (!changed && originalLooksLikeDish && clampedConfidence !== 'high') {
    displayName = titleCaseMenuDish(original);
    correctionPreserved = true;
    reason = 'preserved_uncertain_dish_name';
  }

  const adjustedConfidence = correctionRejected || (correctionPreserved && clampedConfidence !== 'high')
    ? 'low'
    : clampedConfidence;

  return {
    displayName: cleanMenuText(displayName, 120) || 'Unclear menu item',
    confidence: adjustedConfidence,
    ocr: {
      originalText: original,
      correctedText: corrected,
      confidenceScore: menuConfidenceScore(adjustedConfidence, similarity),
      correctionForced: changed && !correctionPreserved && !correctionRejected,
      correctionPreserved,
      correctionRejected,
      lowConfidence: adjustedConfidence === 'low' || correctionRejected,
      reason
    }
  };
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removePresetPhrases(text, presetItem) {
  let next = String(text || '');
  const phrases = [presetItem && presetItem.name, ...(presetItem && presetItem.aliases || [])]
    .map(phrase => String(phrase || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  phrases.forEach(phrase => {
    const pattern = escapeRegExp(phrase).replace(/\s+/g, '\\s+');
    next = next.replace(new RegExp(`\\b${pattern}\\b`, 'ig'), ' ');
  });

  return next.replace(/\s+/g, ' ').trim();
}

function normaliseReservedConsumableRow(row) {
  return {
    id: String(row && row.id || '').trim() || `reserved_${Date.now()}`,
    presetId: row && row.presetId ? String(row.presetId) : null,
    name: String(row && row.name || 'Reserved item').trim() || 'Reserved item',
    quantity: Number.isFinite(Number(row && row.quantity)) ? Number(row.quantity) : null,
    unit: String(row && row.unit || 'serving').trim() || 'serving',
    kcal: cleanMenuKcal(row && (row.kcal ?? row.calories)),
    calories: cleanMenuKcal(row && (row.calories ?? row.kcal)),
    protein: cleanMenuMacro(row && row.protein),
    carbs: cleanMenuMacro(row && row.carbs),
    fat: cleanMenuMacro(row && row.fat),
    source: String(row && row.source || 'consumable_preset'),
    confidence: clampConfidence(row && row.confidence),
    editable: row && row.editable !== undefined ? !!row.editable : true,
    loggable: row && row.loggable !== undefined ? !!row.loggable : true,
    reservable: row && row.reservable !== undefined ? !!row.reservable : true,
    reservedQuantity: cleanMenuMacro(row && row.reservedQuantity) || 1,
    servingLabel: cleanMenuText(row && row.servingLabel, 40),
    notes: String(row && row.notes || '')
  };
}

function titleCasePresetName(value) {
  return String(value || '').replace(/\b[a-z]/g, char => char.toUpperCase());
}

function createReservedPresetRow(presetItem, requestText) {
  const quantityInfo = resolveConsumablePresetQuantity(requestText, presetItem);
  const multiplier = Math.max(1, Math.min(6, Math.round(Number(quantityInfo && quantityInfo.quantity) || 1)));
  const baseQuantity = Number(presetItem && presetItem.defaultQuantity) || Number(presetItem && presetItem.quantity) || 1;
  const unit = presetItem && (presetItem.defaultUnit || presetItem.unit) || 'serving';
  const name = multiplier > 1
    ? `${titleCasePresetName(presetItem.name)} × ${multiplier}`
    : presetItem.name;

  return createConsumablePresetRow(presetItem, {
    id: `consumable_${presetItem.id}${multiplier > 1 ? `_x${multiplier}` : ''}`,
    name,
    quantity: unit === 'serving' ? multiplier : baseQuantity * multiplier,
    unit,
    kcal: (Number(presetItem.kcal) || 0) * multiplier,
    protein: (Number(presetItem.protein) || 0) * multiplier,
    carbs: (Number(presetItem.carbs) || 0) * multiplier,
    fat: (Number(presetItem.fat) || 0) * multiplier,
    reservedQuantity: multiplier,
    servingLabel: quantityInfo && quantityInfo.servingLabel || `${multiplier} serving${multiplier === 1 ? '' : 's'}`,
    notes: multiplier > 1 ? `${quantityInfo && quantityInfo.servingLabel || `${multiplier} servings`} reserved` : ''
  });
}

function resolveReservedConsumables(requestText) {
  let remainingText = cleanMenuText(requestText, 1000);
  const knownPresetIds = new Set(getConsumablePresets().map(item => item.id));
  const rowsByPresetId = new Map();
  const rows = [];

  for (let i = 0; i < 12 && remainingText; i += 1) {
    const presetItem = findConsumablePresetByText(remainingText);
    if (!presetItem || !knownPresetIds.has(presetItem.id)) break;

    const row = normaliseReservedConsumableRow(createReservedPresetRow(presetItem, remainingText));
    const existing = rowsByPresetId.get(presetItem.id);
    if (!existing) {
      rowsByPresetId.set(presetItem.id, row);
      rows.push(row);
    } else if ((row.reservedQuantity || 1) > (existing.reservedQuantity || 1)) {
      rowsByPresetId.set(presetItem.id, row);
      const index = rows.indexOf(existing);
      if (index !== -1) rows[index] = row;
    }

    const nextText = removePresetPhrases(remainingText, presetItem);
    if (nextText === remainingText) break;
    remainingText = nextText;
  }

  return rows;
}

function removeReservedConsumablesFromRequestText(requestText, reservedItems) {
  let text = cleanMenuText(requestText, 1000);
  const presetsById = new Map(getConsumablePresets().map(item => [item.id, item]));

  (Array.isArray(reservedItems) ? reservedItems : []).forEach(row => {
    const presetItem = row && row.presetId ? presetsById.get(row.presetId) : null;
    if (presetItem) text = removePresetPhrases(text, presetItem);
  });

  return text;
}

function cleanMenuWarnings(value) {
  return Array.isArray(value)
    ? value.map(warning => String(warning || '').trim()).filter(Boolean).slice(0, 5)
    : [];
}

function normaliseMenuRange(value, key) {
  const source = value && typeof value === 'object' ? value : {};
  const likelyRaw = source.likely ?? source.high ?? source.low ?? 0;
  const likely = key === 'kcal' ? cleanMenuKcal(likelyRaw) : cleanMenuMacro(likelyRaw);
  let low = key === 'kcal' ? cleanMenuKcal(source.low ?? likely) : cleanMenuMacro(source.low ?? likely);
  let high = key === 'kcal' ? cleanMenuKcal(source.high ?? likely) : cleanMenuMacro(source.high ?? likely);

  low = Math.min(low, likely);
  high = Math.max(high, likely);

  return { low, likely, high };
}

function normaliseMenuEstimate(value) {
  return {
    kcal: normaliseMenuRange(value && value.kcal, 'kcal'),
    protein: normaliseMenuRange(value && value.protein, 'protein'),
    carbs: normaliseMenuRange(value && value.carbs, 'carbs'),
    fat: normaliseMenuRange(value && value.fat, 'fat')
  };
}

function slugifyMenuId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'item';
}

function normaliseMenuRows(rows, suggestion, index, ocrInfo = null) {
  const rawRows = Array.isArray(rows) ? rows : [];
  const sourceRows = rawRows.length ? rawRows : [{
    name: suggestion && (suggestion.suggestedName || suggestion.menuText) || `Menu option ${index + 1}`,
    quantity: 1,
    unit: 'serving',
    kcal: suggestion && suggestion.estimate && suggestion.estimate.kcal && suggestion.estimate.kcal.likely,
    protein: suggestion && suggestion.estimate && suggestion.estimate.protein && suggestion.estimate.protein.likely,
    carbs: suggestion && suggestion.estimate && suggestion.estimate.carbs && suggestion.estimate.carbs.likely,
    fat: suggestion && suggestion.estimate && suggestion.estimate.fat && suggestion.estimate.fat.likely
  }];

  return sourceRows
    .filter(row => row && typeof row === 'object')
    .slice(0, 8)
    .map(row => {
      const rawName = String(row.name || 'Menu item').trim() || 'Menu item';
      const rowNameKey = normaliseMenuNameKey(rawName);
      const shouldUsePreservedName = ocrInfo && ocrInfo.ocr && ocrInfo.ocr.correctionRejected && (
        rowNameKey === normaliseMenuNameKey(ocrInfo.ocr.correctedText) ||
        menuLooksInvented(rawName)
      );
      return {
        name: shouldUsePreservedName ? ocrInfo.displayName : rawName,
        quantity: row.quantity === null || row.quantity === undefined || row.quantity === ''
          ? null
          : cleanMenuMacro(row.quantity),
        unit: String(row.unit || 'serving').trim() || 'serving',
        kcal: cleanMenuKcal(row.kcal ?? row.calories),
        protein: cleanMenuMacro(row.protein),
        carbs: cleanMenuMacro(row.carbs),
        fat: cleanMenuMacro(row.fat),
        source: 'menu_scan',
        ocr: shouldUsePreservedName ? ocrInfo.ocr : undefined
      };
    })
    .filter(row => row.name);
}

function normaliseCustomReservedItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const name = cleanMenuText(item.name, 120);
      if (!name) return null;
      const dedupeKey = name.toLowerCase();
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);
      const customPreset = createCustomConsumableEstimate({
        name,
        kcal: item.kcal,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        quantity: item.quantity,
        unit: item.unit || 'serving'
      });
      return normaliseReservedConsumableRow(createConsumablePresetRow(customPreset, {
        notes: cleanMenuWarnings(item.warnings).join(' ') || String(item.reason || '')
      }));
    })
    .filter(Boolean)
    .slice(0, 5);
}

function normaliseMenuScanResult(parsed, context) {
  const knownReservedItems = Array.isArray(context.reservedItems) ? context.reservedItems : [];
  const customReservedItems = normaliseCustomReservedItems(parsed && parsed.customReservedItems);
  const reservedItems = [...knownReservedItems, ...customReservedItems];
  const remainingAfterReserved = remainingAfterMenuRows(context.remainingBefore, reservedItems);
  const rawSuggestions = Array.isArray(parsed && parsed.suggestions) ? parsed.suggestions : [];

  const suggestions = rawSuggestions
    .filter(item => item && typeof item === 'object')
    .slice(0, 8)
    .map((item, index) => {
      const estimate = normaliseMenuEstimate(item.estimate || {});
      const provisional = { ...item, estimate };
      const ocrInfo = validateMenuOcrName({
        menuText: item.menuText || item.suggestedName || item.rows && item.rows[0] && item.rows[0].name || `Menu option ${index + 1}`,
        suggestedName: item.suggestedName || item.rows && item.rows[0] && item.rows[0].name || item.menuText || `Menu option ${index + 1}`,
        confidence: item.confidence
      });
      const rows = normaliseMenuRows(item.rows, { ...provisional, suggestedName: ocrInfo.displayName }, index, ocrInfo);
      const suggestedName = cleanMenuText(ocrInfo.displayName || rows[0] && rows[0].name || item.menuText || `Menu option ${index + 1}`, 120);
      const id = cleanMenuText(item.id, 80) || `menu_${index + 1}_${slugifyMenuId(suggestedName)}`;
      const confidence = ocrInfo.confidence || clampConfidence(item.confidence);
      const warnings = cleanMenuWarnings(item.warnings);
      if (ocrInfo.ocr.lowConfidence) {
        const readLabel = ocrInfo.ocr.correctionRejected
          ? `Low confidence menu read: we think this says ${suggestedName}. Tap to correct.`
          : `We think this says ${suggestedName}. Tap to correct if needed.`;
        if (!warnings.some(warning => normaliseMenuNameKey(warning) === normaliseMenuNameKey(readLabel))) {
          warnings.unshift(readLabel);
        }
      }
      return {
        id,
        menuText: cleanMenuText(item.menuText || suggestedName, 240),
        suggestedName,
        rank: Math.max(1, Math.round(Number(item.rank) || index + 1)),
        fitScore: Math.max(0, Math.min(100, Math.round(Number(item.fitScore) || 0))),
        confidence,
        reason: cleanMenuText(item.reason, 280),
        portionAssumptions: cleanMenuText(item.portionAssumptions, 280),
        warnings,
        estimate,
        rows,
        ocr: ocrInfo.ocr
      };
    })
    .filter(item => item.suggestedName && item.rows.length)
    .sort((a, b) => a.rank - b.rank || b.fitScore - a.fitScore)
    .slice(0, 5)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    requestSummary: cleanMenuText(parsed && parsed.requestSummary || context.requestText || 'Menu scan', 240),
    reservedItems,
    remainingBefore: context.remainingBefore,
    remainingAfterReserved,
    suggestions
  };
}

function menuScanSchema() {
  const rangeSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      low: { type: 'number' },
      likely: { type: 'number' },
      high: { type: 'number' }
    },
    required: ['low', 'likely', 'high']
  };

  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      requestSummary: { type: 'string' },
      customReservedItems: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            quantity: { type: ['number', 'null'] },
            unit: { type: 'string' },
            kcal: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
            reason: { type: 'string' },
            warnings: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['name', 'quantity', 'unit', 'kcal', 'protein', 'carbs', 'fat', 'reason', 'warnings']
        }
      },
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            menuText: { type: 'string' },
            suggestedName: { type: 'string' },
            rank: { type: 'number' },
            fitScore: { type: 'number' },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            reason: { type: 'string' },
            portionAssumptions: { type: 'string' },
            warnings: {
              type: 'array',
              items: { type: 'string' }
            },
            estimate: {
              type: 'object',
              additionalProperties: false,
              properties: {
                kcal: rangeSchema,
                protein: rangeSchema,
                carbs: rangeSchema,
                fat: rangeSchema
              },
              required: ['kcal', 'protein', 'carbs', 'fat']
            },
            rows: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  quantity: { type: ['number', 'null'] },
                  unit: { type: 'string' },
                  kcal: { type: 'number' },
                  protein: { type: 'number' },
                  carbs: { type: 'number' },
                  fat: { type: 'number' },
                  source: { type: 'string', enum: ['menu_scan'] }
                },
                required: ['name', 'quantity', 'unit', 'kcal', 'protein', 'carbs', 'fat', 'source']
              }
            }
          },
          required: ['id', 'menuText', 'suggestedName', 'rank', 'fitScore', 'confidence', 'reason', 'portionAssumptions', 'warnings', 'estimate', 'rows']
        }
      }
    },
    required: ['requestSummary', 'customReservedItems', 'suggestions']
  };
}

function cleanBarcode(value) {
  const code = String(value || '').replace(/\D/g, '');
  return code.length >= 6 && code.length <= 18 ? code : '';
}

function cleanMacro(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 10) / 10 : 0;
}

function pickNutriment(nutriments, keys) {
  for (const key of keys) {
    if (nutriments && nutriments[key] !== undefined && nutriments[key] !== null && nutriments[key] !== '') {
      return cleanMacro(nutriments[key]);
    }
  }
  return 0;
}

function normaliseBarcodeProduct(code, product) {
  const nutriments = product && product.nutriments ? product.nutriments : {};
  const name = String(
    product && (
      product.product_name ||
      product.abbreviated_product_name ||
      product.generic_name ||
      product.brands ||
      ''
    ) || ''
  ).trim();

  const servingQuantity = cleanMacro(product && product.serving_quantity);
  const servingUnit = String(product && product.serving_quantity_unit || '').trim().toLowerCase();
  const productQuantity = cleanMacro(product && product.product_quantity);
  const productUnit = String(product && product.product_quantity_unit || '').trim().toLowerCase();
  const servingGrams = servingQuantity && (!servingUnit || ['g', 'ml'].includes(servingUnit))
    ? servingQuantity
    : productQuantity && (!productUnit || ['g', 'ml'].includes(productUnit))
      ? productQuantity
      : null;
  const quantityUnit = servingUnit || productUnit;
  const type = ['ml', 'l', 'cl'].includes(quantityUnit) ? 'liquid' : 'solid';

  return {
    barcode: code,
    name: name || `Barcode ${code}`,
    brand: String(product && product.brands || '').split(',')[0].trim(),
    quantity: String(product && product.quantity || product && product.serving_size || '').trim(),
    servingGrams,
    imageUrl: String(product && product.image_front_small_url || '').trim(),
    source: 'openfoodfacts',
    sourceId: `off:${code}`,
    nutritionPer100g: {
      calories: pickNutriment(nutriments, ['energy-kcal_100g', 'energy-kcal', 'energy-kcal_value']),
      protein: pickNutriment(nutriments, ['proteins_100g', 'proteins', 'proteins_value']),
      carbs: pickNutriment(nutriments, ['carbohydrates_100g', 'carbohydrates', 'carbohydrates_value']),
      fat: pickNutriment(nutriments, ['fat_100g', 'fat', 'fat_value']),
      fibre: pickNutriment(nutriments, ['fiber_100g', 'fiber', 'fiber_value', 'fibre_100g', 'fibre'])
    },
    raw: {
      productName: product && product.product_name || '',
      brands: product && product.brands || '',
      quantity: product && product.quantity || '',
      servingSize: product && product.serving_size || ''
    },
    type
  };
}

function compactRealtimeFoods(foods) {
  if (!Array.isArray(foods)) return '';
  return foods
    .slice(0, 160)
    .map(food => {
      const name = String(food && food.name || '').trim();
      if (!name) return '';
      const aliases = Array.isArray(food.aliases) ? food.aliases : (Array.isArray(food.kw) ? food.kw : []);
      const compactAliases = aliases
        .map(alias => String(alias || '').trim())
        .filter(Boolean)
        .slice(0, 5);
      return [name, ...compactAliases].join(' / ');
    })
    .filter(Boolean)
    .join('; ');
}

app.post('/api/realtime/session', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server.' });
  }

  const { section = null, foods = [] } = req.body || {};
  const validSections = new Set(['breakfast', 'lunch', 'dinner', 'snacks', 'supplements']);
  const resolvedSection = validSections.has(section) ? section : null;
  const foodContext = compactRealtimeFoods(foods);

  const instructions = [
    'You are Sous realtime voice input for food logging.',
    'Return exactly one compact JSON object and nothing else. No markdown, no prose, no code fences.',
    'Allowed actions are log_ingredients, clarify, and cancel.',
    'For food logging, extract ingredient rows only. Never include calories, macros, nutrition, confidence, or database IDs.',
    'Never invent nutrition. Never save meals. Never say a meal was saved.',
    'Prefer canonical food names from the provided list when the user clearly said that food. Otherwise keep the user wording.',
    'If the request depends on unknown meal memory, a usual meal, substitutions in an unspecified meal, or missing quantity for an ambiguous food, return clarify.',
    'Keep clarification messages short: one plain sentence under 80 characters.',
    'Set needsConfirmation to true for every log_ingredients action.',
    'Use null for unknown section, quantity, or unit. Do not use the string "null".',
    'log_ingredients shape: {"type":"log_ingredients","section":"breakfast|lunch|dinner|snacks|supplements|null","transcript":"cleaned request","ingredients":[{"name":"Banana","quantity":1,"unit":"banana"}],"needsConfirmation":true}',
    'clarify shape: {"type":"clarify","message":"How much peanut butter?"}',
    'cancel shape: {"type":"cancel"}',
    resolvedSection ? `Current section: ${resolvedSection}.` : null,
    foodContext ? `Canonical foods and aliases: ${foodContext}` : null
  ].filter(Boolean).join('\n');

  try {
    const upstream = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 600 },
        session: {
          type: 'realtime',
          model: REALTIME_MODEL,
          instructions,
          output_modalities: ['text'],
          audio: {
            output: { voice: REALTIME_VOICE }
          }
        }
      })
    });

    const text = await upstream.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}

    if (!upstream.ok) {
      return res.status(upstream.status).json(errorBody(
        `OpenAI Realtime error: ${upstream.status}`,
        'detail',
        data && data.error ? data.error.message || data.error : text
      ));
    }

    const clientSecret = data && (data.value || data.client_secret?.value);
    if (!clientSecret) {
      return res.status(502).json({ error: 'OpenAI Realtime did not return a client secret.' });
    }

    console.log('[Sous Realtime] session created');
    res.json({
      client_secret: {
        value: clientSecret,
        expires_at: data.client_secret?.expires_at || data.expires_at || null
      },
      session: {
        type: 'realtime',
        model: REALTIME_MODEL,
        voice: REALTIME_VOICE
      }
    });
  } catch (err) {
    console.error('[Sous Realtime] error', err.message);
    res.status(500).json(errorBody('Realtime session request failed.', 'detail', err.message));
  }
});

app.post('/api/photo-estimate', async (req, res) => {
  const receivedAt = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server.' });
  }

  const { image } = req.body || {};
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: 'A compressed image data URL is required.' });
  }

  const prompt = [
    'Estimate restaurant meal nutrition from the photo.',
    'Return JSON only. Be conservative. If unsure, use low confidence.',
    'Break the visible edible meal into editable item-level rows.',
    'For each item, estimate grams when visible enough; otherwise use null.',
    'Calories and macros are estimates for the visible edible meal only.',
    'Do not use meal history. Do not ask follow-up questions.'
  ].join('\n');

  try {
    const aiStartedAt = Date.now();
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: image }
          ]
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'photo_meal_estimate',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                mealName: { type: 'string' },
                confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string' },
                      estimatedGrams: { type: ['number', 'null'] },
                      calories: { type: 'number' },
                      protein: { type: 'number' },
                      carbs: { type: 'number' },
                      fat: { type: 'number' },
                      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                      notes: { type: 'string' }
                    },
                    required: ['name', 'estimatedGrams', 'calories', 'protein', 'carbs', 'fat', 'confidence', 'notes']
                  }
                },
                totals: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    calories: { type: 'number' },
                    protein: { type: 'number' },
                    carbs: { type: 'number' },
                    fat: { type: 'number' }
                  },
                  required: ['calories', 'protein', 'carbs', 'fat']
                },
                notes: { type: 'string' }
              },
              required: ['mealName', 'confidence', 'items', 'totals', 'notes']
            }
          }
        }
      })
    });
    const aiFinishedAt = Date.now();

    const text = await upstream.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}

    if (!upstream.ok) {
      return res.status(upstream.status).json(errorBody(
        `OpenAI error: ${upstream.status}`,
        'detail',
        data && data.error ? data.error.message || data.error : text
      ));
    }

    let rawText = '';
    if (typeof data.output_text === 'string') {
      rawText = data.output_text;
    } else if (Array.isArray(data.output)) {
      rawText = data.output
        .flatMap(item => Array.isArray(item.content) ? item.content : [])
        .map(part => part.text || part.output_text || '')
        .filter(Boolean)
        .join('\n');
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return res.status(502).json(errorBody('Invalid JSON returned by OpenAI.', 'raw', rawText));
    }

    res.json({
      ...normalisePhotoEstimate(parsed),
      _timings: {
        receivedAt,
        aiStartedAt,
        aiFinishedAt,
        aiMs: aiFinishedAt - aiStartedAt,
        totalMs: Date.now() - receivedAt,
        imageBytesApprox: Math.round((image.length * 3) / 4)
      }
    });
  } catch (err) {
    console.error('[Sous Photo Estimate] error', err.message);
    res.status(500).json(errorBody('Photo estimate request failed.', 'detail', err.message));
  }
});

app.post('/api/menu-scan/photo-update', async (req, res) => {
  const receivedAt = Date.now();
  const { image, existingRows, mealName = '', notes = '', section = null } = req.body || {};

  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: 'A compressed image data URL is required.' });
  }

  const rows = normaliseMenuScanPhotoRows(existingRows);
  const hasMenuScanRow = rows.some(row => row.source === 'menu_scan' || row.source === 'consumable_ai_estimate');
  if (!rows.length || !hasMenuScanRow) {
    return res.status(400).json({ error: 'Existing menu-scan rows are required for photo update.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server.' });
  }

  const prompt = [
    'Update a previously saved menu-scan meal estimate using the actual visible plate photo.',
    'Return JSON only. Estimates remain approximate and user-editable.',
    'Use the existing rows as the starting point. Adjust only the selected menu-scanned meal.',
    'Do not invent unrelated foods or add items that are not visible and not already in the existing rows.',
    'Preserve obvious reserved drinks or extras from existing rows if they are not visible, unless the photo clearly contradicts them.',
    'Keep reserved preset rows as source "consumable_preset". Keep menu dish rows as source "menu_scan".',
    'Break the updated estimate into editable item-level rows with conservative restaurant assumptions.',
    section ? `Meal section: ${String(section).slice(0, 40)}` : null,
    mealName ? `Original meal name: ${String(mealName).slice(0, 160)}` : null,
    notes ? `Original notes: ${String(notes).slice(0, 800)}` : null,
    `Existing rows: ${JSON.stringify(rows).slice(0, 7000)}`
  ].filter(Boolean).join('\n');

  try {
    const aiStartedAt = Date.now();
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: image }
          ]
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'menu_scan_photo_update',
            strict: true,
            schema: menuScanPhotoUpdateSchema()
          }
        }
      })
    });
    const aiFinishedAt = Date.now();

    const text = await upstream.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}

    if (!upstream.ok) {
      return res.status(upstream.status).json(errorBody(
        `OpenAI error: ${upstream.status}`,
        'detail',
        data && data.error ? data.error.message || data.error : text
      ));
    }

    let rawText = '';
    if (typeof data.output_text === 'string') {
      rawText = data.output_text;
    } else if (Array.isArray(data.output)) {
      rawText = data.output
        .flatMap(item => Array.isArray(item.content) ? item.content : [])
        .map(part => part.text || part.output_text || '')
        .filter(Boolean)
        .join('\n');
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return res.status(502).json(errorBody('Invalid JSON returned by OpenAI.', 'raw', rawText));
    }

    const estimate = normaliseMenuScanPhotoUpdate(parsed);
    if (!estimate.items.length) {
      return res.status(422).json({ error: 'No updated menu-scan rows were returned.', recoverable: true });
    }

    res.json({
      ...estimate,
      reviewTitle: 'Review updated menu estimate',
      saveLabel: 'Update meal',
      disableAdjust: true,
      reviewNote: 'Review and edit before replacing this saved menu-scan meal. Estimates are approximate.',
      _timings: {
        receivedAt,
        aiStartedAt,
        aiFinishedAt,
        aiMs: aiFinishedAt - aiStartedAt,
        totalMs: Date.now() - receivedAt,
        imageBytesApprox: Math.round((image.length * 3) / 4)
      }
    });
  } catch (err) {
    console.error('[Sous Menu Scan Photo Update] error', err.message);
    res.status(500).json(errorBody('Menu scan photo update failed.', 'detail', err.message));
  }
});

app.post('/api/menu-scan', async (req, res) => {
  const { image, requestText = '', selectedDate = null, currentMealSection = null } = req.body || {};

  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    return res.status(400).json(recoverableError('A compressed menu image data URL is required.'));
  }

  const profileTargets = normaliseMenuMacroSet(req.body && req.body.profileTargets, { requireTargets: true });
  if (!profileTargets) {
    return res.status(400).json(recoverableError('Macro targets are required before scanning a menu. Set up profile targets first.'));
  }

  const currentDayTotals = normaliseMenuMacroSet(req.body && req.body.currentDayTotals);
  if (!currentDayTotals) {
    return res.status(400).json(recoverableError('Current day totals must be valid macro numbers.'));
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server.' });
  }

  const cleanRequestText = cleanMenuText(requestText, 1000);
  const cleanSelectedDate = cleanMenuText(selectedDate, 40);
  const validSections = new Set(['breakfast', 'lunch', 'dinner', 'snacks', 'supplements']);
  const cleanMealSection = validSections.has(currentMealSection) ? currentMealSection : null;
  const remainingBefore = subtractMenuMacros(profileTargets, currentDayTotals);
  const reservedItems = resolveReservedConsumables(cleanRequestText);
  const requestTextForMenuRanking = removeReservedConsumablesFromRequestText(cleanRequestText, reservedItems);
  const remainingAfterKnownReserved = remainingAfterMenuRows(remainingBefore, reservedItems);
  const promptContext = {
    originalRequestText: cleanRequestText,
    requestTextForMenuRanking,
    selectedDate: cleanSelectedDate,
    currentMealSection: cleanMealSection,
    profileTargets,
    currentDayTotals,
    remainingBefore,
    knownReservedItems: reservedItems.map(item => ({
      presetId: item.presetId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      reservedQuantity: item.reservedQuantity,
      servingLabel: item.servingLabel,
      kcal: item.kcal,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      source: item.source
    })),
    remainingAfterKnownReserved
  };
  const prompt = [
    'You are Sous menu scanner. Recommend visible restaurant menu options against remaining daily macros.',
    'Return JSON only. No markdown, no prose outside JSON.',
    'Read only visible menu text from the image. Do not invent unseen dishes, prices, ingredients, or options.',
    'Menu mode is tolerant of imperfect OCR, foreign dish names, cuisine terms, and restaurant naming.',
    'Keep menuText as the most readable original visible menu phrase. Do not normalize it to a basic food database item.',
    'Only use suggestedName to lightly clean spacing/capitalization or expand an obvious abbreviation.',
    'Do not aggressively fuzzy-correct dish/entity names. Preserve names such as shakshuka, bibimbap, chilaquiles, arepa reina pepiada, huevos rancheros, croque madame, crème brûlée, and pho.',
    'If OCR confidence is uncertain, preserve the readable dish/entity phrase and mark confidence low rather than inventing a normalized food phrase.',
    'Estimate only the most relevant visible dishes, not the whole menu. Return top 3 to 5 suggestions.',
    'Known reserved items are already accounted for in remainingAfterKnownReserved. Do not estimate them again and do not include them in suggestion rows.',
    'Use requestTextForMenuRanking, not originalRequestText, when deciding dish fit. originalRequestText is only included for context.',
    'If the user requested a drink, side, sauce, or extra that is not in knownReservedItems, include it in customReservedItems with a low-confidence estimate and account for it when ranking.',
    'Rank dishes by staying within kcal after reserved items, helping meet protein, avoiding large fat/carb overshoots, confidence, and direct fit with requestTextForMenuRanking.',
    'Use conservative assumptions for fried foods, creamy sauces, oil-heavy dishes, hidden dressings, and large restaurant portions.',
    'Each suggestion row must be editable and approximate. rows.source must be "menu_scan".',
    `Context: ${JSON.stringify(promptContext).slice(0, 5000)}`
  ].join('\n');

  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: image }
          ]
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'menu_scan_recommendations',
            strict: true,
            schema: menuScanSchema()
          }
        }
      })
    });

    const text = await upstream.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}

    if (!upstream.ok) {
      return res.status(upstream.status).json(errorBody(
        `OpenAI error: ${upstream.status}`,
        'detail',
        data && data.error ? data.error.message || data.error : text
      ));
    }

    let rawText = '';
    if (typeof data.output_text === 'string') {
      rawText = data.output_text;
    } else if (Array.isArray(data.output)) {
      rawText = data.output
        .flatMap(item => Array.isArray(item.content) ? item.content : [])
        .map(part => part.text || part.output_text || '')
        .filter(Boolean)
        .join('\n');
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return res.status(502).json(errorBody('Invalid JSON returned by OpenAI.', 'raw', rawText));
    }

    const result = normaliseMenuScanResult(parsed, {
      requestText: cleanRequestText,
      remainingBefore,
      reservedItems
    });

    if (!result.suggestions.length) {
      return res.status(422).json({
        ...result,
        ...recoverableError('No usable visible menu suggestions were found. Try a clearer menu photo.')
      });
    }

    res.json(result);
  } catch (err) {
    console.error('[Sous Menu Scan] error', err.message);
    res.status(500).json(errorBody('Menu scan request failed.', 'detail', err.message));
  }
});

app.post('/api/photo-estimate-adjust', async (req, res) => {
  const receivedAt = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server.' });
  }

  const { previousEstimate, correction, section = null, date = null } = req.body || {};
  const correctionText = String(correction || '').trim().slice(0, 800);
  if (!correctionText) {
    return res.status(400).json({ error: 'Correction text is required.' });
  }
  const previousItems = Array.isArray(previousEstimate && previousEstimate.items)
    ? previousEstimate.items.slice(0, 20).map(item => ({
      name: String(item && item.name || '').slice(0, 120),
      grams: cleanNullableGrams(item && (item.estimatedGrams ?? item.grams)),
      kcal: cleanNumber(item && (item.calories ?? item.kcal)),
      protein: cleanNumber(item && item.protein),
      carbs: cleanNumber(item && item.carbs),
      fat: cleanNumber(item && item.fat),
      fibre: cleanNumber(item && (item.fibre ?? item.fiber)),
      confidence: clampConfidence(item && item.confidence),
      notes: String(item && (item.notes || item.reason) || '').slice(0, 240)
    }))
    : [];

  if (!previousItems.length) {
    return res.status(400).json({ error: 'Previous estimate items are required.' });
  }

  const prompt = [
    'Revise an unsaved photo meal estimate using the user correction.',
    'Use only the previous structured estimate and correction text. No saved history edits.',
    'Return JSON only. Keep rows editable and conservative.',
    'Apply remove/add/change/portion instructions directly to the item rows.',
    'If the user names a food replacement, update the row name and macros accordingly.',
    'Do not auto-save. Do not mention unavailable image details.',
    section ? `Section: ${String(section).slice(0, 40)}` : null,
    date ? `Date: ${String(date).slice(0, 40)}` : null,
    `Previous estimate: ${JSON.stringify({ items: previousItems }).slice(0, 6000)}`,
    `User correction: ${correctionText}`
  ].filter(Boolean).join('\n');

  try {
    const aiStartedAt = Date.now();
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{
          role: 'user',
          content: [{ type: 'input_text', text: prompt }]
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'photo_meal_estimate_adjustment',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string' },
                      quantity: { type: ['number', 'null'] },
                      unit: { type: 'string' },
                      grams: { type: ['number', 'null'] },
                      kcal: { type: 'number' },
                      protein: { type: 'number' },
                      carbs: { type: 'number' },
                      fat: { type: 'number' },
                      fibre: { type: 'number' },
                      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                      reason: { type: 'string' }
                    },
                    required: ['name', 'quantity', 'unit', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'fibre', 'confidence', 'reason']
                  }
                },
                summary: { type: 'string' },
                warnings: {
                  type: 'array',
                  items: { type: 'string' }
                }
              },
              required: ['items', 'summary', 'warnings']
            }
          }
        }
      })
    });
    const aiFinishedAt = Date.now();

    const text = await upstream.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}

    if (!upstream.ok) {
      return res.status(upstream.status).json(errorBody(
        `OpenAI error: ${upstream.status}`,
        'detail',
        data && data.error ? data.error.message || data.error : text
      ));
    }

    let rawText = '';
    if (typeof data.output_text === 'string') {
      rawText = data.output_text;
    } else if (Array.isArray(data.output)) {
      rawText = data.output
        .flatMap(item => Array.isArray(item.content) ? item.content : [])
        .map(part => part.text || part.output_text || '')
        .filter(Boolean)
        .join('\n');
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return res.status(502).json(errorBody('Invalid JSON returned by OpenAI.', 'raw', rawText));
    }

    res.json({
      ...normalisePhotoAdjustEstimate(parsed),
      _timings: {
        receivedAt,
        aiStartedAt,
        aiFinishedAt,
        aiMs: aiFinishedAt - aiStartedAt,
        totalMs: Date.now() - receivedAt
      }
    });
  } catch (err) {
    console.error('[Sous Photo Adjust] error', err.message);
    res.status(500).json(errorBody('Photo estimate adjustment failed.', 'detail', err.message));
  }
});

app.get('/api/barcode/:code', async (req, res) => {
  const code = cleanBarcode(req.params.code);
  if (!code) {
    return res.status(400).json({ error: 'A valid barcode is required.' });
  }

  const fields = [
    'code',
    'product_name',
    'abbreviated_product_name',
    'generic_name',
    'brands',
    'quantity',
    'serving_size',
    'serving_quantity',
    'serving_quantity_unit',
    'product_quantity',
    'product_quantity_unit',
    'nutriments',
    'image_front_small_url'
  ].join(',');
  const url = new URL(`https://world.openfoodfacts.org/api/v3/product/${code}`);
  url.searchParams.set('product_type', 'food');
  url.searchParams.set('fields', fields);

  try {
    const upstream = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Sous/1.0 (https://stuchainz.github.io)'
      }
    });
    const data = await upstream.json().catch(() => null);

    if (upstream.status === 404 || data?.result?.id === 'product_not_found') {
      return res.status(404).json({ error: 'Product not found.', barcode: code });
    }
    if (!upstream.ok) {
      return res.status(upstream.status).json(errorBody(
        `Open Food Facts error: ${upstream.status}`,
        'detail',
        data?.errors || data?.result || null
      ));
    }
    if (!data || !data.product) {
      return res.status(404).json({ error: 'Product not found.', barcode: code });
    }

    res.json(normaliseBarcodeProduct(code, data.product));
  } catch (err) {
    console.error('[Sous Barcode] error', err.message);
    res.status(500).json(errorBody('Barcode lookup failed.', 'detail', err.message));
  }
});

app.post('/api/interpret', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server.' });
  }

  const { transcript, section = null, countryCode = null } = req.body || {};
  if (!transcript || !String(transcript).trim()) {
    return res.status(400).json({ error: 'transcript is required.' });
  }

  const prompt = [
    'Return JSON only. No explanations. No text outside JSON.',
    'Shape: {"section":string|null,"ingredients":[{"name":string,"quantity":number,"unit":string}]}',
    'Interpret the cooking transcript into ingredient entries.',
    countryCode ? `Country code: ${countryCode}` : null,
    `Section: ${section || ''}`,
    `Transcript: ${String(transcript).trim()}`
  ].filter(Boolean).join('\n');

  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'meal_draft',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                section: { type: ['string', 'null'] },
                ingredients: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name:     { type: 'string' },
                      quantity: { type: 'number' },
                      unit:     { type: 'string' }
                    },
                    required: ['name', 'quantity', 'unit']
                  }
                }
              },
              required: ['section', 'ingredients']
            }
          }
        }
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json(errorBody(`OpenAI error: ${upstream.status}`, 'detail', text));
    }

    const data = await upstream.json();

    // Extract text from Responses API shape.
    let rawText = '';
    if (typeof data.output_text === 'string') {
      rawText = data.output_text;
    } else if (Array.isArray(data.output)) {
      rawText = data.output
        .flatMap(item => Array.isArray(item.content) ? item.content : [])
        .map(part => part.text || part.output_text || '')
        .filter(Boolean)
        .join('\n');
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return res.status(502).json(errorBody('Invalid JSON returned by OpenAI.', 'raw', rawText));
    }

    if (!Array.isArray(parsed.ingredients)) {
      return res.status(502).json(errorBody('Unexpected response shape from OpenAI.', 'raw', rawText));
    }

    res.json({
      section: parsed.section ?? section,
      ingredients: parsed.ingredients
    });

  } catch (err) {
    res.status(500).json(errorBody('Proxy request failed.', 'detail', err.message));
  }
});

app.post('/api/repair-transcript', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server.' });
  }

  const {
    transcript,
    alternatives = [],
    recentIngredients = [],
    foodHints = [],
    screenContext = 'normal_logging'
  } = req.body || {};
  const cleanTranscript = String(transcript || '').trim();
  if (!cleanTranscript) {
    return res.status(400).json({ error: 'transcript is required.' });
  }

  const cleanList = (items, max) => Array.isArray(items)
    ? items.map(item => {
      if (typeof item === 'string') return item;
      return item && (item.text || item.transcript || item.name) || '';
    }).map(item => String(item || '').trim()).filter(Boolean).slice(0, max)
    : [];
  const compactAlternatives = cleanList(alternatives, 8);
  const compactRecent = cleanList(recentIngredients, 16);
  const compactHints = cleanList(foodHints, 80);

  const prompt = [
    'You are Sous, repairing likely speech-to-text errors for food logging.',
    'Return JSON only. No prose, no markdown.',
    'You may ONLY suggest repaired transcript text candidates.',
    'Never return nutrition, calories, macros, ingredients, food objects, actions, commands, or saved-meal claims.',
    'Do not interpret the meal. Do not decide what should be logged. Only repair likely misheard words.',
    'Use food hints only as vocabulary hints. If unsure, return an empty candidates array.',
    'Keep quantities and word order unless a speech mishear is obvious.',
    'Do not add extra foods that were not plausibly spoken.',
    'Max 3 candidates.',
    `Screen context: ${String(screenContext || '').slice(0, 80)}`,
    `Transcript: ${cleanTranscript}`,
    `Alternatives JSON: ${JSON.stringify(compactAlternatives)}`,
    `Recent ingredients JSON: ${JSON.stringify(compactRecent)}`,
    `Food hints JSON: ${JSON.stringify(compactHints)}`
  ].join('\n');

  const repairSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      candidates: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            transcript: { type: 'string' },
            score: { type: 'number' },
            reason: { type: 'string' }
          },
          required: ['transcript', 'score', 'reason']
        }
      }
    },
    required: ['candidates']
  };

  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'transcript_repair_candidates',
            strict: true,
            schema: repairSchema
          }
        }
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json(errorBody(`OpenAI error: ${upstream.status}`, 'detail', text));
    }

    const data = await upstream.json();
    let rawText = '';
    if (typeof data.output_text === 'string') rawText = data.output_text;
    else if (Array.isArray(data.output)) {
      rawText = data.output
        .flatMap(item => Array.isArray(item.content) ? item.content : [])
        .map(part => part.text || part.output_text || '')
        .filter(Boolean)
        .join('\n');
    }

    let parsed;
    try { parsed = JSON.parse(rawText); }
    catch {
      return res.status(502).json(errorBody('Invalid JSON returned by OpenAI.', 'raw', rawText));
    }

    const seen = new Set();
    const candidates = (Array.isArray(parsed.candidates) ? parsed.candidates : [])
      .map(candidate => ({
        transcript: String(candidate && candidate.transcript || '').replace(/\s+/g, ' ').trim(),
        score: Number(candidate && candidate.score),
        reason: String(candidate && candidate.reason || '').slice(0, 160)
      }))
      .filter(candidate => {
        if (!candidate.transcript) return false;
        const key = candidate.transcript.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3)
      .map(candidate => ({
        transcript: candidate.transcript,
        score: Number.isFinite(candidate.score) ? Math.max(0, Math.min(1, candidate.score)) : 0,
        reason: candidate.reason
      }));

    res.json({ candidates });
  } catch (err) {
    res.status(500).json(errorBody('Transcript repair request failed.', 'detail', err.message));
  }
});

app.post('/api/interpret-action', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server.' });
  }

  const { transcript, section = null, context = {} } = req.body || {};
  const cleanTranscript = String(transcript || '').trim();
  if (!cleanTranscript) {
    return res.status(400).json({ error: 'transcript is required.' });
  }

  const compactContext = JSON.stringify(context || {}).slice(0, 18000);
  const prompt = [
    'You are Sous, interpreting food logging intent into safe app actions.',
    'Return JSON only. No prose, no markdown.',
    'You are not a nutrition source. Never return calories, macros, nutrients, or saved-meal claims.',
    'Use only action intent and references. The app will resolve foods and nutrition locally.',
    'Prefer refs from context when relevant. Use clarify when the source/target is ambiguous.',
    'Never invent a meal reference. If the requested source or target is missing from context, return clarify or none with low confidence.',
    'Do not use add_food to create nutrition facts. New food words are only intent; the app resolves nutrition locally.',
    'Allowed action types: add_food, replace_food, remove_food, change_quantity, repeat_meal, modify_meal_copy, add_usual_meal, clarify, none.',
    'Allowed change ops for modify_meal_copy: replace, remove, scale, set_quantity, add.',
    'For "that" or "last", target the current meal last item.',
    'For "same breakfast", repeat the latest breakfast from history unless another date is specified.',
    'For "yesterday\'s lunch", use source dateOffset -1 and section lunch.',
    'For "half the rice from yesterday\'s lunch", copy only the rice item with a scale change. Do not copy the whole meal.',
    'For usual meals, use add_usual_meal with a usualRef when possible.',
    `Current section: ${section || ''}`,
    `Transcript: ${cleanTranscript}`,
    `Context JSON: ${compactContext}`
  ].join('\n');

  const actionSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: {
        type: 'string',
        enum: ['add_food','replace_food','remove_food','change_quantity','repeat_meal','modify_meal_copy','add_usual_meal','clarify','none']
      },
      confidence: { type: 'string', enum: ['low','medium','high'] },
      message: { type: ['string','null'] },
      food: { type: ['string','null'] },
      targetFood: { type: ['string','null'] },
      replacementFood: { type: ['string','null'] },
      quantityText: { type: ['string','null'] },
      factor: { type: ['number','null'] },
      section: { type: ['string','null'] },
      source: {
        type: ['object','null'],
        additionalProperties: false,
        properties: {
          ref: { type: ['string','null'] },
          kind: { type: ['string','null'], enum: ['current_meal','history_meal','usual_meal',null] },
          section: { type: ['string','null'] },
          date: { type: ['string','null'] },
          dateOffset: { type: ['number','null'] },
          when: { type: ['string','null'], enum: ['latest','yesterday',null] },
          query: { type: ['string','null'] }
        },
        required: ['ref','kind','section','date','dateOffset','when','query']
      },
      target: {
        type: ['object','null'],
        additionalProperties: false,
        properties: {
          ref: { type: ['string','null'] },
          scope: { type: ['string','null'], enum: ['current_meal','source_meal','last_item',null] },
          food: { type: ['string','null'] }
        },
        required: ['ref','scope','food']
      },
      usualRef: { type: ['string','null'] },
      changes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            op: { type: 'string', enum: ['replace','remove','scale','set_quantity','add'] },
            targetRef: { type: ['string','null'] },
            from: { type: ['string','null'] },
            to: { type: ['string','null'] },
            food: { type: ['string','null'] },
            quantityText: { type: ['string','null'] },
            factor: { type: ['number','null'] }
          },
          required: ['op','targetRef','from','to','food','quantityText','factor']
        }
      }
    },
    required: ['type','confidence','message','food','targetFood','replacementFood','quantityText','factor','section','source','target','usualRef','changes']
  };

  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'meal_action_intent',
            strict: true,
            schema: actionSchema
          }
        }
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json(errorBody(`OpenAI error: ${upstream.status}`, 'detail', text));
    }

    const data = await upstream.json();
    let rawText = '';
    if (typeof data.output_text === 'string') rawText = data.output_text;
    else if (Array.isArray(data.output)) {
      rawText = data.output
        .flatMap(item => Array.isArray(item.content) ? item.content : [])
        .map(part => part.text || part.output_text || '')
        .filter(Boolean)
        .join('\n');
    }

    let parsed;
    try { parsed = JSON.parse(rawText); }
    catch {
      return res.status(502).json(errorBody('Invalid JSON returned by OpenAI.', 'raw', rawText));
    }

    res.json(parsed);
  } catch (err) {
    res.status(500).json(errorBody('Action interpretation request failed.', 'detail', err.message));
  }
});

const HOST = process.env.HOST || '0.0.0.0';

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Sous proxy server running at http://${HOST}:${PORT}`);
  });
}

module.exports = {
  app,
  _test: {
    resolveReservedConsumables,
    remainingAfterMenuRows,
    validateMenuOcrName,
    normaliseMenuScanResult
  }
};
