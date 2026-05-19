import fs from "fs";
import path from "path";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const OUT_DIR = path.resolve("assets/voice-cache/audio");

const responses = [
  ["logged", "Logged."],
  ["added", "Added."],
  ["done", "Done."],
  ["deleted", "Deleted."],
  ["undone", "Undone."],
  ["got_it", "Got it."],
  ["saved_to_breakfast", "Saved to breakfast."],
  ["saved_to_lunch", "Saved to lunch."],
  ["saved_to_dinner", "Saved to dinner."],
  ["saved_to_snacks", "Saved to snacks."],
  ["saved_to_supplements", "Saved to supplements."],
  ["clarification_needed", "I need one detail."],
  ["realtime_ready", "Ready."],
  ["realtime_stopped", "Stopped."],
  ["realtime_error", "Voice unavailable."],
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [key, text] of responses) {
  const filePath = path.join(OUT_DIR, `${key}.mp3`);

  if (fs.existsSync(filePath)) {
    console.log(`Skipping existing: ${filePath}`);
    continue;
  }

  console.log(`Generating: ${key} -> "${text}"`);

  const audio = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    input: text,
    response_format: "mp3",
    instructions:
      "Speak in a short, neutral, natural assistant tone. Keep it quick and clean with no extra words.",
  });

  const buffer = Buffer.from(await audio.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
}

console.log("Done. Audio files saved to assets/voice-cache/audio/");

const foods = [
  "banana",
  "egg",
  "chicken breast",
  "rice",
  "oats",
  "milk",
  "bread",
  "butter",
  "cheese",
  "yogurt"
];

for (const food of foods) {
  const key = `food_${food.replace(/\s+/g, "_")}`;
  const filePath = path.join(OUT_DIR, `${key}.mp3`);

  if (fs.existsSync(filePath)) {
    console.log(`Skipping existing: ${filePath}`);
    continue;
  }

  console.log(`Generating food audio: ${food}`);

  const audio = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    input: food,
    response_format: "mp3",
    instructions:
      "Speak this single word naturally, as if mid-sentence. Keep it short and neutral.",
  });

  const buffer = Buffer.from(await audio.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
}