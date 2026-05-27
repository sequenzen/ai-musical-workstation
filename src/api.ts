import {
  draftScript,
  initialBible,
  initialCues,
  type MusicCue,
  type ProjectBible,
  type ProjectSettings,
} from "./domain";

type JsonRecord = Record<string, unknown>;

async function postJson<T>(path: string, body: JsonRecord, fallback: T): Promise<T> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export function generateDraft(settings: ProjectSettings, prompt: string) {
  return postJson(
    "/api/generate-draft",
    { settings, prompt },
    {
      script: draftScript,
      bible: initialBible,
      provider: "client-mock",
    },
  );
}

export function suggestMusicCues(script: string, bible: ProjectBible, settings: ProjectSettings) {
  return postJson(
    "/api/suggest-cues",
    { script, bible, settings },
    {
      cues: initialCues.map((cue, index) => ({
        ...cue,
        status: index === 0 ? "ready" : "suggested",
      })) as MusicCue[],
      provider: "client-mock",
    },
  );
}

export type RewriteMusicPromptResponse = {
  rewrittenPrompt: string;
  lyricsPrompt: string;
  stylePrompt: string;
  negativePrompt: string;
  rightsNote: string;
  provider: string;
};

export function rewriteMusicPrompt(projectBible: ProjectBible, cue: MusicCue, userPrompt: string) {
  return postJson<RewriteMusicPromptResponse>(
    "/api/rewrite-music-prompt",
    { projectBible, cue, userPrompt },
    {
      rewrittenPrompt: `${cue.title}. ${cue.intent} ${cue.style}. Korean contemporary musical theatre demo, emotionally specific, stage-ready, no direct imitation of referenced works.`,
      lyricsPrompt: cue.lyricsPrompt ?? cue.intent,
      stylePrompt: cue.style,
      negativePrompt: "No copyrighted melody imitation, no named-artist clone, no direct quotation from existing musicals.",
      rightsNote: "Mock output. Confirm provider plan and commercial rights before release.",
      provider: "client-mock",
    },
  );
}

export type GenerateMusicResponse = {
  taskId: string;
  status: "ready" | "queued";
  demoAudioUrl: string | null;
  provider: string;
};

export function generateMusicAsset(payload: {
  rewrittenPrompt: string;
  lyrics: string;
  style: string;
  duration: string;
}) {
  return postJson<GenerateMusicResponse>("/api/generate-music", payload, {
    taskId: `mock-${Date.now()}`,
    status: "ready",
    demoAudioUrl: null,
    provider: "client-mock",
  });
}

export type GenerateReadingResponse = {
  taskId: string;
  status: "ready" | "queued";
  durationSeconds: number;
  demoAudioUrl: string | null;
  provider: string;
};

export function generateReadingAsset(payload: {
  script: string;
  bible: ProjectBible;
  cast: Array<{ character: string; voiceId?: string }>;
}) {
  return postJson<GenerateReadingResponse>("/api/generate-reading", payload, {
    taskId: `reading-mock-${Date.now()}`,
    status: "ready",
    durationSeconds: 60,
    demoAudioUrl: null,
    provider: "client-mock",
  });
}
