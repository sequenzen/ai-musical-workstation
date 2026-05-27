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

if (isProduction) {
  app.use(express.static(distDir));
  app.get(/.*/, (_request, response) => {
    response.sendFile(join(distDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`StageWrite ${isProduction ? "app" : "API"} listening on http://localhost:${port}`);
});
