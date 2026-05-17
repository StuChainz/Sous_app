// Local AI proxy server.
// Keeps the OpenAI API key server-side and avoids CORS issues from the browser.
// The frontend calls /api/interpret instead of OpenAI directly.

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '6mb' }));
app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));

// Serve the frontend from the project root.
app.use(express.static(__dirname));

const REALTIME_MODEL = 'gpt-realtime-mini';
const REALTIME_VOICE = 'marin';

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
    'You are Sous voice input. Keep replies short.',
    'Return JSON only. Do not use markdown.',
    'Never invent nutrition. Never save meals.',
    'Return one action: log_ingredients, clarify, or cancel.',
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
      return res.status(upstream.status).json({
        error: `OpenAI Realtime error: ${upstream.status}`,
        detail: data && data.error ? data.error.message || data.error : text
      });
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
    res.status(500).json({ error: 'Realtime session request failed.', detail: err.message });
  }
});

app.post('/api/photo-estimate', async (req, res) => {
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
    'Calories and macros are estimates for the visible edible meal only.'
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
            name: 'photo_meal_estimate',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                mealName: { type: 'string' },
                confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                estimatedCalories: { type: 'number' },
                protein: { type: 'number' },
                carbs: { type: 'number' },
                fat: { type: 'number' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string' },
                      estimatedGrams: { type: ['number', 'null'] },
                      calories: { type: ['number', 'null'] },
                      protein: { type: ['number', 'null'] },
                      carbs: { type: ['number', 'null'] },
                      fat: { type: ['number', 'null'] }
                    },
                    required: ['name', 'estimatedGrams', 'calories', 'protein', 'carbs', 'fat']
                  }
                },
                notes: { type: 'string' }
              },
              required: ['mealName', 'confidence', 'estimatedCalories', 'protein', 'carbs', 'fat', 'items', 'notes']
            }
          }
        }
      })
    });

    const text = await upstream.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `OpenAI error: ${upstream.status}`,
        detail: data && data.error ? data.error.message || data.error : text
      });
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
      return res.status(502).json({ error: 'Invalid JSON returned by OpenAI.', raw: rawText });
    }

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: 'Photo estimate request failed.', detail: err.message });
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
      return res.status(upstream.status).json({ error: `OpenAI error: ${upstream.status}`, detail: text });
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
      return res.status(502).json({ error: 'Invalid JSON returned by OpenAI.', raw: rawText });
    }

    if (!Array.isArray(parsed.ingredients)) {
      return res.status(502).json({ error: 'Unexpected response shape from OpenAI.', raw: rawText });
    }

    res.json({
      section: parsed.section ?? section,
      ingredients: parsed.ingredients
    });

  } catch (err) {
    res.status(500).json({ error: 'Proxy request failed.', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Sous proxy server running at http://localhost:${PORT}`);
});
