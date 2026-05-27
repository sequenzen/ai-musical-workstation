import {
  initialCues,
  type PlanId,
  type MusicCue,
  type ProjectBible,
  type ProjectSettings,
} from "./domain";
import type { CheckoutSession, CostPolicy, ProviderJob, RightsState, TeamMember, WorkspaceAccount } from "./commercial";
import { generateLocalCues, generateLocalDraft } from "./generators";

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

export async function generateDraft(settings: ProjectSettings, prompt: string, title = "새 뮤지컬") {
  const localDraft = generateLocalDraft(settings, prompt, title);
  const result = await postJson(
    "/api/generate-draft",
    { settings, prompt },
    localDraft,
  );

  if (result.provider?.includes("mock")) {
    return localDraft;
  }

  return {
    ...localDraft,
    ...result,
    bible: {
      ...localDraft.bible,
      ...result.bible,
      characters: result.bible?.characters?.length ? result.bible.characters : localDraft.bible.characters,
      sceneCards: result.bible?.sceneCards?.length ? result.bible.sceneCards : localDraft.bible.sceneCards,
      songMap: result.bible?.songMap?.length ? result.bible.songMap : localDraft.bible.songMap,
      structure: result.bible?.structure?.length ? result.bible.structure : localDraft.bible.structure,
      themes: result.bible?.themes?.length ? result.bible.themes : localDraft.bible.themes,
    },
  };
}

export async function suggestMusicCues(script: string, bible: ProjectBible, settings: ProjectSettings, title = bible.title) {
  const localCues = generateLocalCues({
    id: "local",
    title,
    prompt: "",
    settings,
    bible,
    script,
    cues: initialCues,
    comments: [],
    aiSuggestions: [],
    runtimeReport: "",
  });
  const result = await postJson(
    "/api/suggest-cues",
    { script, bible, settings },
    {
      cues: localCues,
      provider: "client-mock",
    },
  );

  if (result.provider?.includes("mock")) {
    return {
      cues: localCues,
      provider: "client-condition-dramaturg",
    };
  }

  return result;
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
      rewrittenPrompt: `${cue.title}. ${cue.intent} ${cue.style}. ${cue.motif ? `Motif: ${cue.motif}.` : ""} Korean contemporary musical theatre demo, emotionally specific, stage-ready, no direct imitation of referenced works.`,
      lyricsPrompt: cue.lyricsPrompt ?? cue.intent,
      stylePrompt: cue.style,
      negativePrompt: cue.negativePrompt ?? "No copyrighted melody imitation, no named-artist clone, no direct quotation from existing musicals.",
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

export function syncWorkspace(payload: {
  account: WorkspaceAccount;
  projectCount: number;
  versionCount: number;
}) {
  return postJson("/api/workspace/sync", payload, {
    syncedAt: new Date().toISOString(),
    storageMode: payload.account.storageMode,
    provider: "client-mock-storage",
  });
}

export function createCheckoutSession(planId: PlanId) {
  return postJson<CheckoutSession>(
    "/api/checkout/create-session",
    { planId },
    {
      sessionId: `checkout-mock-${Date.now()}`,
      planId,
      url: `https://billing.stagewrite.local/checkout/${planId}`,
      status: "mock",
    },
  );
}

export function acknowledgeRights(payload: { rights: RightsState; projectTitle: string }) {
  return postJson("/api/rights/acknowledge", payload, {
    acknowledgedAt: new Date().toISOString(),
    rightsId: `rights-mock-${Date.now()}`,
    provider: "client-mock-rights",
  });
}

export function createTeamInvite(member: TeamMember) {
  return postJson("/api/team/invite", member, {
    inviteId: `invite-mock-${Date.now()}`,
    shareLink: `https://sequenzen.github.io/ai-musical-workstation/?invite=${encodeURIComponent(member.email)}`,
    provider: "client-mock-team",
  });
}

export function previewUsageLimit(payload: {
  policy: CostPolicy;
  currentSpend: number;
  requestedCost: number;
}) {
  return postJson("/api/usage/preview", payload, {
    allowed: !payload.policy.hardStopEnabled || payload.currentSpend + payload.requestedCost <= payload.policy.monthlyCreditCap,
    remainingAfter: Math.max(0, payload.policy.monthlyCreditCap - payload.currentSpend - payload.requestedCost),
    provider: "client-mock-usage",
  });
}

export function getProviderJobStatus(job: ProviderJob) {
  const nextStatus = job.retryCount > 0 || job.status === "processing" ? "ready" : "processing";
  return postJson<ProviderJob>(
    "/api/provider-jobs/status",
    { job },
    {
      ...job,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    },
  );
}
