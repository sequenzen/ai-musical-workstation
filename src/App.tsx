import {
  AlertCircle,
  AudioLines,
  BookOpenText,
  Bot,
  Check,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Database,
  Download,
  FileText,
  Gauge,
  Library,
  Lock,
  MessageSquareText,
  Mic2,
  Music2,
  PanelLeft,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Settings2,
  Sparkles,
  Timer,
  Wand2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  generateDraft,
  generateMusicAsset,
  generateReadingAsset,
  rewriteMusicPrompt,
  suggestMusicCues,
} from "./api";
import {
  estimateReadingCost,
  initialProject,
  makeUsageEvent,
  musicGenerationCost,
  plans,
  type MusicCue,
  type PlanId,
  type ProjectState,
  type UsageEvent,
} from "./domain";
import { exportProject, type ExportFormat } from "./exporters";

const projectStorageKey = "stagewrite.project.v2";
const usageStorageKey = "stagewrite.usage.v1";
const planStorageKey = "stagewrite.plan.v1";

const promptSteps = [
  "초기 아이디어",
  "장르/레퍼런스",
  "러닝타임",
  "스토리 바이블",
  "대본 초안",
  "음악 큐",
];

const cuePitch = [
  { label: "극적 기능", value: "오프닝, I Want, 11시 넘버" },
  { label: "생성 방식", value: "하우스 프롬프트 + 작가 요청 + OpenAI 재작성" },
  { label: "권리 주의", value: "상업 사용/다운로드는 제공자 플랜 기준 확인" },
];

function loadJson<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function playTone() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const notes = [261.63, 329.63, 392, 523.25, 440, 587.33];

  notes.forEach((note, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index % 2 === 0 ? "sine" : "triangle";
    oscillator.frequency.value = note;
    oscillator.connect(gain);
    gain.connect(context.destination);
    const start = context.currentTime + index * 0.17;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.14, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    oscillator.start(start);
    oscillator.stop(start + 0.18);
  });
}

function StatusPill({ status }: { status: MusicCue["status"] }) {
  const label = {
    suggested: "추천됨",
    generating: "생성 중",
    ready: "재생 가능",
    failed: "실패",
  }[status];

  return <span className={`status-pill ${status}`}>{label}</span>;
}

function ToolbarButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={`icon-button ${active ? "active" : ""}`} aria-label={label} title={label} onClick={onClick}>
      {icon}
    </button>
  );
}

export function App() {
  const [project, setProject] = useState<ProjectState>(() => loadJson(projectStorageKey, initialProject));
  const [activeCue, setActiveCue] = useState(project.cues[0]?.id ?? 1);
  const [planId, setPlanId] = useState<PlanId>(() => loadJson(planStorageKey, "composer" as PlanId));
  const [usageLedger, setUsageLedger] = useState<UsageEvent[]>(() => loadJson(usageStorageKey, []));
  const [exportFormat, setExportFormat] = useState<ExportFormat>("markdown");
  const [notice, setNotice] = useState("Mock API 모드입니다. 키를 넣으면 OpenAI/음악/음성 provider로 연결됩니다.");
  const [isPlaying, setIsPlaying] = useState(false);
  const [readingStatus, setReadingStatus] = useState<"idle" | "generating" | "ready">("idle");

  const activeCueData = useMemo(
    () => project.cues.find((cue) => cue.id === activeCue) ?? project.cues[0],
    [activeCue, project.cues],
  );
  const plan = plans[planId];
  const generatedPages = Math.max(1, Math.round(project.settings.lengthMinutes));
  const estimatedTokens = generatedPages * 1100;
  const musicSpent = usageLedger.filter((event) => event.type === "music").reduce((sum, event) => sum + event.amount, 0);
  const readingSpent = usageLedger
    .filter((event) => event.type === "reading")
    .reduce((sum, event) => sum + event.amount, 0);
  const musicRemaining = Math.max(0, plan.musicCredits - musicSpent);
  const readingRemaining = Math.max(0, plan.readingCredits - readingSpent);
  const readingCost = estimateReadingCost(project.script);
  const isStudio = planId === "studio";

  useEffect(() => {
    localStorage.setItem(projectStorageKey, JSON.stringify(project));
  }, [project]);

  useEffect(() => {
    localStorage.setItem(usageStorageKey, JSON.stringify(usageLedger));
  }, [usageLedger]);

  useEffect(() => {
    localStorage.setItem(planStorageKey, JSON.stringify(planId));
  }, [planId]);

  function addUsage(event: UsageEvent) {
    setUsageLedger((current) => [event, ...current].slice(0, 30));
  }

  function updateProject(next: Partial<ProjectState>) {
    setProject((current) => ({ ...current, ...next }));
  }

  function updateSettings(next: Partial<ProjectState["settings"]>) {
    setProject((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...next,
      },
    }));
  }

  async function handleGenerateDraft() {
    setNotice("대본 초안을 생성하는 중입니다.");
    const result = await generateDraft(project.settings, project.prompt);
    updateProject({ script: result.script, bible: result.bible });
    addUsage(makeUsageEvent("draft", 0, "대본 초안 생성"));
    setNotice(`${result.provider}가 대본 초안을 채웠습니다.`);
  }

  async function handleSuggestCues() {
    setNotice("뮤지컬 구조에 맞춰 음악 위치를 찾는 중입니다.");
    const result = await suggestMusicCues(project.script, project.bible, project.settings);
    updateProject({ cues: result.cues });
    setActiveCue(result.cues[0]?.id ?? 1);
    setNotice(`${result.provider}가 ${result.cues.length}개의 음악 큐를 추천했습니다.`);
  }

  async function handleGenerateMusic(cue: MusicCue) {
    if (musicRemaining < musicGenerationCost) {
      setNotice(`음악 크레딧이 부족합니다. ${plan.name} 잔여 ${musicRemaining} / 필요 ${musicGenerationCost}`);
      return;
    }

    setNotice("OpenAI 프롬프트 재작성 후 음악 provider로 전달하는 중입니다.");
    setProject((current) => ({
      ...current,
      cues: current.cues.map((item) => (item.id === cue.id ? { ...item, status: "generating" } : item)),
    }));

    try {
      const rewrite = await rewriteMusicPrompt(project.bible, cue, project.prompt);
      const music = await generateMusicAsset({
        rewrittenPrompt: rewrite.rewrittenPrompt,
        lyrics: rewrite.lyricsPrompt,
        style: rewrite.stylePrompt,
        duration: cue.duration,
      });

      setProject((current) => ({
        ...current,
        cues: current.cues.map((item) =>
          item.id === cue.id
            ? {
                ...item,
                status: "ready",
                rewrittenPrompt: rewrite.rewrittenPrompt,
                lyricsPrompt: rewrite.lyricsPrompt,
                taskId: music.taskId,
                demoAudioUrl: music.demoAudioUrl,
              }
            : item,
        ),
      }));
      addUsage(makeUsageEvent("music", musicGenerationCost, cue.title));
      setNotice(`${rewrite.provider} -> ${music.provider} mock 파이프라인 완료. ${musicGenerationCost} credits 차감.`);
    } catch {
      setProject((current) => ({
        ...current,
        cues: current.cues.map((item) => (item.id === cue.id ? { ...item, status: "failed" } : item)),
      }));
      setNotice("음악 생성 중 문제가 생겼습니다. provider 설정을 확인하세요.");
    }
  }

  async function handleGenerateReading() {
    if (!isStudio) {
      setNotice("전체 리딩은 Studio 플랜에서만 열립니다. 오른쪽 플랜을 Studio로 바꾸면 mock 생성이 가능합니다.");
      return;
    }

    if (readingRemaining < readingCost) {
      setNotice(`리딩 크레딧이 부족합니다. 잔여 ${readingRemaining} / 필요 ${readingCost}`);
      return;
    }

    setReadingStatus("generating");
    setNotice("캐릭터별 음성 캐스팅으로 전체 리딩을 생성하는 중입니다.");
    const result = await generateReadingAsset({
      script: project.script,
      bible: project.bible,
      cast: project.bible.characters.map((character) => ({
        character: character.name,
        voiceId: character.voiceId,
      })),
    });
    addUsage(makeUsageEvent("reading", readingCost, `전체 리딩 ${result.durationSeconds}s`));
    setReadingStatus("ready");
    setNotice(`${result.provider}가 ${result.durationSeconds}초 샘플 리딩을 준비했습니다. ${readingCost} credits 차감.`);
  }

  function handlePlayCue() {
    setIsPlaying(true);
    playTone();
    window.setTimeout(() => setIsPlaying(false), 1200);
  }

  function handleExport() {
    exportProject(exportFormat, {
      title: project.title,
      prompt: project.prompt,
      settings: project.settings,
      bible: project.bible,
      script: project.script,
      cues: project.cues,
      usageLedger,
    });
    addUsage(makeUsageEvent("export", 0, `${exportFormat} export`));
    setNotice(`${exportFormat.toUpperCase()} 내보내기를 실행했습니다.`);
  }

  function handleSave() {
    localStorage.setItem(projectStorageKey, JSON.stringify(project));
    setNotice("현재 프로젝트를 브라우저 localStorage에 저장했습니다.");
  }

  function handleReset() {
    setProject(initialProject);
    setUsageLedger([]);
    setActiveCue(1);
    setReadingStatus("idle");
    setNotice("새 프로젝트 샘플로 초기화했습니다.");
  }

  return (
    <main className="app-shell">
      <aside className="project-sidebar" aria-label="프로젝트">
        <div className="brand-row">
          <div className="brand-mark">
            <Music2 size={18} />
          </div>
          <div>
            <strong>StageWrite AI</strong>
            <span>Musical Writer Studio</span>
          </div>
        </div>

        <button className="new-project-button" onClick={handleReset}>
          <Plus size={16} />
          새 뮤지컬
        </button>

        <section className="side-section">
          <h2>프로젝트</h2>
          <button className="project-item active">
            <FileText size={16} />
            <span>{project.title}</span>
          </button>
          <button className="project-item">
            <Library size={16} />
            <span>2막 구조 실험</span>
          </button>
          <button className="project-item">
            <BookOpenText size={16} />
            <span>넘버 가사 보관함</span>
          </button>
        </section>

        <section className="side-section">
          <h2>스토리 바이블</h2>
          <div className="bible-list">
            {project.bible.characters.map((character) => (
              <article className="character-row" key={character.name}>
                <strong>{character.name}</strong>
                <span>{character.role}</span>
              </article>
            ))}
          </div>
        </section>

        <div className="usage-box">
          <div>
            <Gauge size={18} />
            이번 초안 예상량
          </div>
          <strong>{estimatedTokens.toLocaleString()} tokens</strong>
          <span>
            {generatedPages}쪽 / 약 {project.settings.lengthMinutes}분 공연
          </span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Draft Workspace</p>
            <h1>{project.title}</h1>
          </div>
          <div className="top-actions">
            <ToolbarButton icon={<PanelLeft size={17} />} label="패널 전환" />
            <ToolbarButton icon={<RefreshCcw size={17} />} label="초기화" onClick={handleReset} />
            <ToolbarButton icon={<Save size={17} />} label="저장" active onClick={handleSave} />
            <div className="export-cluster">
              <select
                value={exportFormat}
                onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
                aria-label="내보내기 형식"
              >
                <option value="markdown">Markdown</option>
                <option value="fountain">Fountain</option>
                <option value="manifest">Manifest</option>
                <option value="pdf">PDF</option>
              </select>
              <button className="export-button" onClick={handleExport}>
                <Download size={16} />
                내보내기
              </button>
            </div>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="composer-panel">
            <div className="prompt-card">
              <div className="prompt-head">
                <div>
                  <p className="eyebrow">AI Co-writer</p>
                  <h2>작가 요청</h2>
                </div>
                <span className="connected">
                  <Check size={14} />
                  API mock 연결
                </span>
              </div>
              <textarea
                value={project.prompt}
                onChange={(event) => updateProject({ prompt: event.target.value })}
                aria-label="작가 요청"
              />
              <div className="prompt-actions">
                <button className="primary-button" onClick={handleGenerateDraft}>
                  <Wand2 size={16} />
                  대본 초안 생성
                </button>
                <button className="secondary-button" onClick={handleSuggestCues}>
                  <Music2 size={16} />
                  음악 위치 추천
                </button>
              </div>
            </div>

            <div className="script-toolbar" aria-label="대본 도구">
              <ToolbarButton icon={<Bot size={17} />} label="AI 제안" active />
              <ToolbarButton icon={<MessageSquareText size={17} />} label="코멘트" />
              <ToolbarButton icon={<Timer size={17} />} label="러닝타임 계산" />
              <ToolbarButton icon={<Mic2 size={17} />} label="리딩 모드" />
            </div>

            <div className="script-page">
              <div className="page-meta">
                <span>초안 v0.2</span>
                <span>A4 {generatedPages}쪽 기준</span>
              </div>
              <textarea
                className="script-editor"
                value={project.script}
                onChange={(event) => updateProject({ script: event.target.value })}
                aria-label="대본 편집기"
              />
            </div>
          </section>

          <aside className="control-panel">
            <section className="settings-panel">
              <div className="panel-title">
                <Settings2 size={18} />
                <h2>생성 설정</h2>
              </div>

              <label>
                장르
                <div className="select-shell">
                  <select value={project.settings.genre} onChange={(event) => updateSettings({ genre: event.target.value })}>
                    <option>컨템포러리 뮤지컬</option>
                    <option>주크박스 뮤지컬</option>
                    <option>소극장 창작 뮤지컬</option>
                    <option>판타지 가족 뮤지컬</option>
                  </select>
                  <ChevronDown size={16} />
                </div>
              </label>

              <label>
                비슷한 작품
                <input
                  value={project.settings.reference}
                  onChange={(event) => updateSettings({ reference: event.target.value })}
                />
              </label>

              <label>
                무대 규모
                <div className="select-shell">
                  <select
                    value={project.settings.stageScale}
                    onChange={(event) => updateSettings({ stageScale: event.target.value })}
                  >
                    <option>소극장 3~5인극</option>
                    <option>중극장 8~12인 앙상블</option>
                    <option>대극장 상업 뮤지컬</option>
                    <option>학교/동아리 제작</option>
                  </select>
                  <ChevronDown size={16} />
                </div>
              </label>

              <label>
                음악 밀도
                <div className="select-shell">
                  <select
                    value={project.settings.musicDensity}
                    onChange={(event) => updateSettings({ musicDensity: event.target.value })}
                  >
                    <option>낮음: 3~5곡</option>
                    <option>중간: 6~8곡</option>
                    <option>높음: 10곡 이상</option>
                  </select>
                  <ChevronDown size={16} />
                </div>
              </label>

              <label>
                톤
                <input value={project.settings.tone} onChange={(event) => updateSettings({ tone: event.target.value })} />
              </label>

              <label>
                목표 시간
                <div className="range-row">
                  <input
                    type="range"
                    min="10"
                    max="120"
                    value={project.settings.lengthMinutes}
                    onChange={(event) => updateSettings({ lengthMinutes: Number(event.target.value) })}
                  />
                  <strong>{project.settings.lengthMinutes}분</strong>
                </div>
              </label>

              <label>
                등장인물 수
                <div className="range-row">
                  <input
                    type="range"
                    min="2"
                    max="18"
                    value={project.settings.characterCount}
                    onChange={(event) => updateSettings({ characterCount: Number(event.target.value) })}
                  />
                  <strong>{project.settings.characterCount}명</strong>
                </div>
              </label>

              <div className="segmented-control" aria-label="목표 관객">
                {(["상업", "공모전", "워크숍"] as const).map((audience) => (
                  <button
                    className={project.settings.audience === audience ? "active" : ""}
                    key={audience}
                    onClick={() => updateSettings({ audience })}
                  >
                    {audience}
                  </button>
                ))}
              </div>

              <div className="step-list">
                {promptSteps.map((step, index) => (
                  <div className="step-row" key={step}>
                    <span>{index + 1}</span>
                    {step}
                  </div>
                ))}
              </div>
            </section>

            <section className="music-panel">
              <div className="panel-title">
                <AudioLines size={18} />
                <h2>음악 큐</h2>
              </div>

              {activeCueData && (
                <>
                  <div className="cue-spotlight">
                    <div className="cue-number">#{activeCueData.id}</div>
                    <div>
                      <p>{activeCueData.act}</p>
                      <h3>{activeCueData.title}</h3>
                      <StatusPill status={activeCueData.status} />
                    </div>
                  </div>

                  <div className="cue-list">
                    {project.cues.map((cue) => (
                      <article
                        className={`cue-card ${activeCue === cue.id ? "active" : ""}`}
                        key={cue.id}
                        onClick={() => setActiveCue(cue.id)}
                      >
                        <div>
                          <strong>{cue.title}</strong>
                          <span>{cue.placement}</span>
                        </div>
                        <StatusPill status={cue.status} />
                      </article>
                    ))}
                  </div>

                  <div className="cue-detail">
                    <p>{activeCueData.intent}</p>
                    <div className="style-line">
                      <Music2 size={16} />
                      {activeCueData.style}
                    </div>
                    {activeCueData.rewrittenPrompt && <small>{activeCueData.rewrittenPrompt}</small>}
                  </div>

                  <div className="waveform" aria-label="음악 미리듣기 파형">
                    {Array.from({ length: 34 }).map((_, index) => (
                      <span key={index} style={{ height: `${18 + ((index * 13) % 44)}px` }} />
                    ))}
                  </div>

                  <div className="music-actions">
                    <button
                      className="primary-button"
                      onClick={() => handleGenerateMusic(activeCueData)}
                      disabled={activeCueData.status === "generating"}
                    >
                      <Sparkles size={16} />
                      음악 생성 -{musicGenerationCost}
                    </button>
                    <button
                      className="play-button"
                      onClick={handlePlayCue}
                      disabled={activeCueData.status !== "ready"}
                      aria-label={isPlaying ? "일시정지" : "재생"}
                      title={isPlaying ? "일시정지" : "재생"}
                    >
                      {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="voice-panel">
              <div className="panel-title">
                <Mic2 size={18} />
                <h2>전체 리딩</h2>
              </div>
              <div className="cast-grid">
                {project.bible.characters.map((character) => (
                  <div className="cast-chip" key={character.name}>
                    <strong>{character.name}</strong>
                    <span>{character.voice}</span>
                  </div>
                ))}
              </div>
              <button
                className="locked-button"
                onClick={handleGenerateReading}
                disabled={readingStatus === "generating"}
              >
                {!isStudio ? <Lock size={16} /> : <CircleDollarSign size={16} />}
                {!isStudio
                  ? "Studio 플랜에서 리딩 생성"
                  : readingStatus === "ready"
                    ? "샘플 리딩 준비됨"
                    : `전체 리딩 생성 -${readingCost}`}
              </button>
            </section>

            <section className="billing-panel">
              <div className="panel-title">
                <CreditCard size={18} />
                <h2>플랜/크레딧</h2>
              </div>
              <div className="plan-grid">
                {(Object.keys(plans) as PlanId[]).map((id) => (
                  <button className={planId === id ? "active" : ""} key={id} onClick={() => setPlanId(id)}>
                    <strong>{plans[id].name}</strong>
                    <span>{plans[id].price}</span>
                  </button>
                ))}
              </div>
              <div className="credit-row">
                <span>음악</span>
                <strong>
                  {musicRemaining} / {plan.musicCredits}
                </strong>
              </div>
              <div className="credit-row">
                <span>리딩</span>
                <strong>
                  {readingRemaining} / {plan.readingCredits}
                </strong>
              </div>
              <div className="stripe-note">
                <Database size={15} />
                Stripe lookup key: {plan.stripePriceLookupKey}
              </div>
              <div className="usage-ledger">
                {usageLedger.slice(0, 3).map((event) => (
                  <div key={event.id}>
                    <span>{event.label}</span>
                    <strong>{event.amount} cr</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="prompt-pipeline">
              {cuePitch.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </section>

            <section className="notice-panel">
              <AlertCircle size={16} />
              <span>{notice}</span>
            </section>
          </aside>
        </div>
      </section>

      <div className="mobile-composer">
        <input
          value={project.prompt}
          onChange={(event) => updateProject({ prompt: event.target.value })}
          aria-label="모바일 요청"
        />
        <button aria-label="전송" title="전송" onClick={handleGenerateDraft}>
          <Send size={18} />
        </button>
      </div>
    </main>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
