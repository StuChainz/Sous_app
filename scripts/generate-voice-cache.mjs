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

// ===============================
// Expanded Sous voice cache pack
// ===============================

const extraResponses = [
  // Confirmation variants
  ["added_01", "Added."],
  ["added_02", "Logged."],
  ["added_03", "Got it."],
  ["added_04", "Done."],
  ["added_05", "Sorted."],

  ["updated_01", "Updated."],
  ["updated_02", "Changed."],
  ["updated_03", "Fixed."],

  ["removed_01", "Removed."],
  ["removed_02", "Deleted."],

  ["undone_01", "Undone."],
  ["undone_02", "Reverted."],

  ["cleared_01", "Cleared."],
  ["cleared_02", "Started again."],

  // Continuous flow
  ["flow_go_ahead", "Go ahead."],
  ["flow_keep_going", "Keep going."],
  ["flow_anything_else", "Anything else?"],
  ["flow_next", "Next."],
  ["flow_continue", "Continue."],
  ["flow_still_listening", "Still listening."],
  ["flow_ready_when_you_are", "Ready when you are."],

  // Recovery
  ["recovery_try_again", "Try again."],
  ["recovery_say_again", "Say that again."],
  ["recovery_one_more_time", "One more time."],
  ["recovery_go_again", "Go again."],
  ["recovery_didnt_catch", "Didn't catch that."],

  // Session
  ["session_listening", "Listening."],
  ["session_paused", "Paused."],
  ["session_resumed", "Session resumed."],
  ["session_back_again", "Back again."],
  ["session_continuing", "Continuing where we left off."],

  // Meal-aware
  ["meal_updated", "Meal updated."],
  ["breakfast_updated", "Breakfast updated."],
  ["lunch_updated", "Lunch updated."],
  ["dinner_updated", "Dinner updated."],
  ["snack_logged", "Snack logged."],
  ["drink_logged", "Drink logged."],
  ["protein_added", "Protein added."],
  ["carbs_added", "Carbs added."],
  ["veg_added", "Veg added."],
  ["fruit_added", "Fruit added."],

  // Clarification
  ["clarify_which_one", "Which one?"],
  ["clarify_amount", "How much?"],
  ["clarify_type", "What type?"],
  ["clarify_type_quantity", "What type and how much?"],
  ["clarify_confirm_food", "Did you mean that?"],
  ["clarify_milk", "What type of milk?"],
  ["clarify_cheese", "What type of cheese?"],
  ["clarify_rice", "Cooked or dry?"],
];

for (const [key, text] of extraResponses) {
  const filePath = path.join(OUT_DIR, `${key}.mp3`);

  if (fs.existsSync(filePath)) {
    console.log(`Skipping existing: ${filePath}`);
    continue;
  }

  console.log(`Generating extra audio: ${key}`);

  const audio = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "nova",
    input: text,
    response_format: "mp3",
    instructions:
      "Speak in a short, warm, natural assistant tone. Keep it quick, understated, and clean with no extra words.",
  });

  const buffer = Buffer.from(await audio.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
}
