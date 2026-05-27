export async function createReadingGeneration({ script, bible, cast }) {
  if (!process.env.VOICE_PROVIDER_API_KEY || !process.env.VOICE_PROVIDER_ENDPOINT) {
    return mockReadingGeneration(script ?? "");
  }

  const response = await fetch(process.env.VOICE_PROVIDER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOICE_PROVIDER_API_KEY}`,
    },
    body: JSON.stringify({
      script,
      title: bible?.title,
      cast,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Voice provider request failed: ${response.status} ${detail}`);
  }

  const json = await response.json();
  return {
    taskId: json.taskId ?? json.id ?? `reading-${Date.now()}`,
    status: json.status ?? "queued",
    durationSeconds: json.durationSeconds ?? 60,
    demoAudioUrl: json.demoAudioUrl ?? json.audioUrl ?? null,
    provider: process.env.VOICE_PROVIDER_NAME ?? "custom-voice-provider",
  };
}

function mockReadingGeneration(script) {
  return {
    taskId: `reading-mock-${Date.now()}`,
    status: "ready",
    durationSeconds: Math.min(60, Math.max(18, Math.ceil(script.length / 55))),
    demoAudioUrl: null,
    provider: "mock-voice-provider",
  };
}
