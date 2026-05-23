// Local AI proxy server.
// Keeps the OpenAI API key server-side and avoids CORS issues from the browser.
// The frontend calls /api/interpret instead of OpenAI directly.

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

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

app.listen(PORT, HOST, () => {
  console.log(`Sous proxy server running at http://${HOST}:${PORT}`);
});
