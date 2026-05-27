import "dotenv/config";
import cors from "cors";
import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rewriteMusicPromptWithOpenAI } from "./openaiClient.js";
import { mockBible, mockCues, mockDraftScript } from "./mockData.js";
import { createMusicGeneration } from "./providers/musicProvider.js";
import { createReadingGeneration } from "./providers/voiceProvider.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(rootDir, "dist");
const isProduction = process.env.NODE_ENV === "production";

app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    openai: Boolean(process.env.OPENAI_API_KEY),
    musicProvider: process.env.MUSIC_PROVIDER_NAME ?? "mock",
    voiceProvider: process.env.VOICE_PROVIDER_NAME ?? "mock",
  });
});

app.post("/api/generate-draft", (request, response) => {
  const settings = request.body?.settings ?? {};
  response.json({
    script: mockDraftScript,
    bible: {
      ...mockBible,
      title: settings.title ?? mockBible.title,
    },
    provider: "mock-draft-writer",
  });
});

app.post("/api/suggest-cues", (_request, response) => {
  response.json({
    cues: mockCues,
    provider: "mock-dramaturg",
  });
});

app.post("/api/rewrite-music-prompt", async (request, response) => {
  try {
    const result = await rewriteMusicPromptWithOpenAI(request.body ?? {});
    response.json(result);
  } catch (error) {
    response.status(500).json({
      error: "rewrite_music_prompt_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/generate-music", async (request, response) => {
  try {
    const result = await createMusicGeneration(request.body ?? {});
    response.json(result);
  } catch (error) {
    response.status(500).json({
      error: "generate_music_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/generate-reading", async (request, response) => {
  try {
    const result = await createReadingGeneration(request.body ?? {});
    response.json(result);
  } catch (error) {
    response.status(500).json({
      error: "generate_reading_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/workspace/sync", (request, response) => {
  response.json({
    syncedAt: new Date().toISOString(),
    storageMode: request.body?.account?.storageMode ?? "local-first",
    provider: "mock-workspace-store",
  });
});

app.post("/api/checkout/create-session", (request, response) => {
  const planId = request.body?.planId ?? "writer";
  response.json({
    sessionId: `checkout-mock-${Date.now()}`,
    planId,
    url: `${process.env.APP_PUBLIC_URL ?? "https://sequenzen.github.io/ai-musical-workstation"}/billing/success?plan=${planId}`,
    status: process.env.STRIPE_SECRET_KEY ? "created" : "mock",
  });
});

app.post("/api/webhooks/stripe", (request, response) => {
  response.json({
    received: true,
    eventType: request.body?.type ?? "checkout.session.completed",
    processedAt: new Date().toISOString(),
    provider: process.env.STRIPE_WEBHOOK_SECRET ? "stripe-webhook" : "mock-stripe-webhook",
  });
});

app.post("/api/provider-jobs/status", (request, response) => {
  const job = request.body?.job ?? {};
  const nextStatus = job.status === "queued" ? "processing" : "ready";
  response.json({
    ...job,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  });
});

app.post("/api/provider-jobs/retry", (request, response) => {
  const job = request.body?.job ?? {};
  response.json({
    ...job,
    status: "queued",
    retryCount: Number(job.retryCount ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  });
});

app.post("/api/rights/acknowledge", (request, response) => {
  response.json({
    acknowledgedAt: new Date().toISOString(),
    rightsId: `rights-${Date.now()}`,
    projectTitle: request.body?.projectTitle,
    provider: "mock-rights-ledger",
  });
});

app.post("/api/team/invite", (request, response) => {
  const email = request.body?.email ?? "collaborator@example.com";
  response.json({
    inviteId: `invite-${Date.now()}`,
    shareLink: `${process.env.APP_PUBLIC_URL ?? "https://sequenzen.github.io/ai-musical-workstation"}/?invite=${encodeURIComponent(email)}`,
    provider: "mock-team-directory",
  });
});

app.post("/api/usage/preview", (request, response) => {
  const policy = request.body?.policy ?? {};
  const currentSpend = Number(request.body?.currentSpend ?? 0);
  const requestedCost = Number(request.body?.requestedCost ?? 0);
  const cap = Number(policy.monthlyCreditCap ?? 0);
  const hardStop = Boolean(policy.hardStopEnabled);
  response.json({
    allowed: !hardStop || currentSpend + requestedCost <= cap,
    remainingAfter: Math.max(0, cap - currentSpend - requestedCost),
    provider: "mock-usage-guard",
  });
});

if (isProduction) {
  app.use(express.static(distDir));
  app.get(/.*/, (_request, response) => {
    response.sendFile(join(distDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`StageWrite ${isProduction ? "app" : "API"} listening on http://localhost:${port}`);
});
