// Local AI proxy server.
// Keeps the OpenAI API key server-side and avoids CORS issues from the browser.
// The frontend calls /api/interpret instead of OpenAI directly.

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));

// Serve the frontend from the project root.
app.use(express.static(__dirname));

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
