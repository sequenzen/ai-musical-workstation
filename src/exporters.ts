import type { MusicCue, ProjectBible, ProjectSettings, UsageEvent } from "./domain";

export type ExportFormat = "markdown" | "fountain" | "manifest" | "pdf";

type ExportPayload = {
  title: string;
  prompt: string;
  settings: ProjectSettings;
  bible: ProjectBible;
  script: string;
  cues: MusicCue[];
  usageLedger: UsageEvent[];
};

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function cueMarkdown(cues: MusicCue[]) {
  return cues
    .map(
      (cue) => `### ${cue.title}

- 위치: ${cue.placement}
- 기능: ${cue.intent}
- 스타일: ${cue.style}
- 길이: ${cue.duration}
- 생성 프롬프트: ${cue.rewrittenPrompt ?? cue.lyricsPrompt ?? "아직 생성 전"}`,
    )
    .join("\n\n");
}

export function exportProject(format: ExportFormat, payload: ExportPayload) {
  if (format === "pdf") {
    window.print();
    return;
  }

  const safeTitle = payload.title.replace(/[^\w가-힣-]+/g, "-");

  if (format === "manifest") {
    downloadFile(
      `${safeTitle}-manifest.json`,
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          app: "StageWrite AI",
          ...payload,
        },
        null,
        2,
      ),
      "application/json;charset=utf-8",
    );
    return;
  }

  if (format === "fountain") {
    const fountain = `Title: ${payload.title}
Credit: Written with StageWrite AI

${payload.script}

/* MUSIC CUES
${payload.cues.map((cue) => `${cue.title} - ${cue.placement}`).join("\n")}
*/`;
    downloadFile(`${safeTitle}.fountain`, fountain, "text/plain;charset=utf-8");
    return;
  }

  const markdown = `# ${payload.title}

## 요청

${payload.prompt}

## 설정

- 장르: ${payload.settings.genre}
- 레퍼런스: ${payload.settings.reference}
- 목표 시간: ${payload.settings.lengthMinutes}분
- 무대 규모: ${payload.settings.stageScale}
- 인물 수: ${payload.settings.characterCount}명
- 음악 밀도: ${payload.settings.musicDensity}
- 톤: ${payload.settings.tone}

## 스토리 바이블

${payload.bible.synopsis}

### 인물

${payload.bible.characters.map((character) => `- ${character.name}: ${character.role} (${character.voice})`).join("\n")}

## 대본

${payload.script}

## 음악 큐

${cueMarkdown(payload.cues)}
`;

  downloadFile(`${safeTitle}.md`, markdown, "text/markdown;charset=utf-8");
}
