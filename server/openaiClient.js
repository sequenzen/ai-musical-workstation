const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export async function rewriteMusicPromptWithOpenAI({ projectBible, cue, userPrompt }) {
  if (!process.env.OPENAI_API_KEY) {
    return mockRewrite(cue);
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.2",
      instructions:
        "You are a senior musical theatre dramaturg and music prompt designer. Rewrite the user's cue request into an original, production-safe music-generation prompt. Do not imitate living artists, named composers, exact copyrighted melodies, or existing musicals. Return only structured JSON.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({ projectBible, cue, userPrompt }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "music_prompt_rewrite",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["rewrittenPrompt", "lyricsPrompt", "stylePrompt", "negativePrompt", "rightsNote"],
            properties: {
              rewrittenPrompt: { type: "string" },
              lyricsPrompt: { type: "string" },
              stylePrompt: { type: "string" },
              negativePrompt: { type: "string" },
              rightsNote: { type: "string" },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${detail}`);
  }

  const json = await response.json();
  const outputText = json.output_text ?? json.output?.[0]?.content?.[0]?.text;
  return {
    ...JSON.parse(outputText),
    provider: "openai-responses",
  };
}

function mockRewrite(cue = {}) {
  return {
    rewrittenPrompt: `${cue.title ?? "Musical cue"}. ${cue.intent ?? ""} ${cue.style ?? ""}. Original Korean contemporary musical theatre demo with clear dramatic build, singable melody, theatrical ensemble awareness, no direct imitation of referenced works.`,
    lyricsPrompt: cue.lyricsPrompt ?? cue.intent ?? "Write a focused musical theatre lyric prompt for this scene.",
    stylePrompt: cue.style ?? "Korean contemporary musical theatre",
    negativePrompt: "No copyrighted melody imitation, no named-artist clone, no direct quotation from existing musicals.",
    rightsNote: "Mock output. Confirm provider subscription, commercial rights, and production clearance before release.",
    provider: "mock-openai",
  };
}
