export async function createMusicGeneration({ rewrittenPrompt, lyrics, style, duration }) {
  if (!process.env.MUSIC_PROVIDER_API_KEY || !process.env.MUSIC_PROVIDER_ENDPOINT) {
    return mockMusicGeneration();
  }

  const response = await fetch(process.env.MUSIC_PROVIDER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MUSIC_PROVIDER_API_KEY}`,
    },
    body: JSON.stringify({
      prompt: rewrittenPrompt,
      lyrics,
      style,
      duration,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Music provider request failed: ${response.status} ${detail}`);
  }

  const json = await response.json();
  return {
    taskId: json.taskId ?? json.id ?? `music-${Date.now()}`,
    status: json.status ?? "queued",
    demoAudioUrl: json.demoAudioUrl ?? json.audioUrl ?? null,
    provider: process.env.MUSIC_PROVIDER_NAME ?? "custom-music-provider",
  };
}

function mockMusicGeneration() {
  return {
    taskId: `music-mock-${Date.now()}`,
    status: "ready",
    demoAudioUrl: null,
    provider: "mock-music-provider",
  };
}
