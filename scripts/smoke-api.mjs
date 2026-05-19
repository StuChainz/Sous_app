const baseUrl = process.env.SOUS_BASE_URL || 'http://127.0.0.1:3001';
const shouldCallOpenAI = process.argv.includes('--openai');

async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function checkHealth() {
  const res = await fetch(`${baseUrl}/api/health`);
  const body = await readJson(res);
  if (!res.ok || !body?.ok) {
    throw new Error(`Health check failed: ${res.status} ${JSON.stringify(body)}`);
  }

  console.log(`Health OK at ${baseUrl}`);
  console.log(`OpenAI key configured: ${body.openaiKeyConfigured ? 'yes' : 'no'}`);
  return body;
}

async function checkInterpret() {
  const res = await fetch(`${baseUrl}/api/interpret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript: 'I added two eggs and 100 grams of rice',
      section: 'breakfast',
      countryCode: 'US'
    })
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(`OpenAI interpret check failed: ${res.status} ${JSON.stringify(body)}`);
  }

  console.log(`OpenAI interpret OK: ${JSON.stringify(body)}`);
}

await checkHealth();

if (shouldCallOpenAI) {
  await checkInterpret();
} else {
  console.log('Skipped OpenAI call. Add --openai to test /api/interpret.');
}
