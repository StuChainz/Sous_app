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
    voice: "marin",
    input: text,
    response_format: "mp3",
    instructions:
  "Speak in a calm, natural British English accent. Warm but understated. Short, quick confirmations. No exaggerated emotion. Sound like a modern UK fitness assistant."  });

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
    voice: "marin",
    input: food,
    response_format: "mp3",
    instructions:
  "Speak in a calm, natural British English accent. Warm but understated. Short, quick confirmations. No exaggerated emotion. Sound like a modern UK fitness assistant.",
});

const buffer = Buffer.from(await audio.arrayBuffer());
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

  ["done_01", "Done."],
  ["done_02", "Finished."],

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
  ["session_picked_up", "Picked up where you left off."],

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

  // Confirm / correction / session
  ["confirm_check", "Check this."],
  ["confirm_yes_no", "Confirm?"],
  ["correction_not_found", "Couldn't find it."],
  ["session_ready", "Ready."],
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
  "Speak in a calm, natural British English accent. Warm but understated. Short, quick confirmations. No exaggerated emotion. Sound like a modern UK fitness assistant."  });

  const buffer = Buffer.from(await audio.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
}

// ===============================
// Human-feeling logging variants
// ===============================

const humanLoggingResponses = [
  // Core confirmations: short, no food names, safe for continuous listening.
  ["added_06", "Added."],
  ["added_07", "Logged."],
  ["added_08", "Got that."],
  ["added_09", "That's in."],

  ["logged_01", "Logged."],
  ["logged_02", "Added."],
  ["logged_03", "Got that."],
  ["logged_04", "That's in."],
  ["logged_05", "All set."],

  // Occasional flow prompts, used after a few successful foods.
  ["flow_what_next", "What next?"],
  ["flow_next_one", "Next one?"],
  ["flow_ready_for_the_next_one", "Ready for the next one."],
  ["flow_go_on", "Go on."],
  ["flow_still_with_you", "Still with you."]
];

for (const [key, text] of humanLoggingResponses) {
  const filePath = path.join(OUT_DIR, `${key}.mp3`);

  if (fs.existsSync(filePath)) {
    console.log(`Skipping existing: ${filePath}`);
    continue;
  }

  console.log(`Generating human logging audio: ${key} -> "${text}"`);

  const audio = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "marin",
    input: text,
    response_format: "mp3",
    instructions:
      "Speak in a calm, natural British English accent. Warm but understated. Short, quick confirmations. No exaggerated emotion. Sound like a modern UK fitness assistant."
  });

  const buffer = Buffer.from(await audio.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
}
