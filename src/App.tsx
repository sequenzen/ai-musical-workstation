import {
  AlertCircle,
  AudioLines,
  BookOpenText,
  Bot,
  Check,
  ChevronDown,
  CircleDollarSign,
  Copy,
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
  projectPresets,
  type MusicCue,
  type PlanId,
  type ProjectSettings,
  type ProjectState,
  type UsageEvent,
} from "./domain";
import { buildAiSuggestions, buildProjectBible, buildRuntimeReport, generateLocalCues } from "./generators";
import { exportProject, type ExportFormat } from "./exporters";

const projectsStorageKey = "stagewrite.projects.v3";
const activeProjectStorageKey = "stagewrite.activeProject.v3";
const usageStorageKey = "stagewrite.usage.v2";
const planStorageKey = "stagewrite.plan.v2";

const settingSteps = ["기본", "세계", "인물", "구조", "음악", "제작"];

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
  const notes = [261.63, 329.63, 392, 523.25, 440, 587.33, 659.25];

  notes.forEach((note, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index % 2 === 0 ? "sine" : "triangle";
    oscillator.frequency.value = note;
    oscillator.connect(gain);
    gain.connect(context.destination);
    const start = context.currentTime + index * 0.15;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.14, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    oscillator.start(start);
    oscillator.stop(start + 0.16);
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

function makeFreshProject(): ProjectState {
  return {
    ...initialProject,
    id: `project-${Date.now()}`,
    title: "새 뮤지컬",
    prompt: "글을 써줘. 주인공, 장소, 갈등, 원하는 분위기를 여기에 적으면 조건과 함께 대본으로 확장됩니다.",
    bible: {
      ...initialProject.bible,
      title: "새 뮤지컬",
    },
    comments: [],
    aiSuggestions: [],
    runtimeReport: "아직 분석 전입니다. 러닝타임 버튼을 누르면 계산됩니다.",
  };
}

export function App() {
  const [projects, setProjects] = useState<ProjectState[]>(() => loadJson(projectsStorageKey, projectPresets));
  const [activeProjectId, setActiveProjectId] = useState(() =>
    loadJson(activeProjectStorageKey, projectPresets[0].id),
  );
  const [planId, setPlanId] = useState<PlanId>(() => loadJson(planStorageKey, "studio" as PlanId));
  const [usageLedger, setUsageLedger] = useState<UsageEvent[]>(() => loadJson(usageStorageKey, []));
  const [exportFormat, setExportFormat] = useState<ExportFormat>("markdown");
  const [activeCue, setActiveCue] = useState(1);
  const [notice, setNotice] = useState("조건을 채운 뒤 대본 초안 생성을 누르면 설정이 결과물에 반영됩니다.");
  const [isPlaying, setIsPlaying] = useState(false);
  const [readingStatus, setReadingStatus] = useState<"idle" | "generating" | "ready">("idle");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeInspector, setActiveInspector] = useState<"settings" | "music" | "voice" | "billing">("settings");
  const [readingMode, setReadingMode] = useState(false);

  const project = useMemo(
    () => projects.find((item) => item.id === activeProjectId) ?? projects[0] ?? initialProject,
    [activeProjectId, projects],
  );
  const activeCueData = useMemo(
    () => project.cues.find((cue) => cue.id === activeCue) ?? project.cues[0],
    [activeCue, project.cues],
  );

  const plan = plans[planId];
  const generatedPages = Math.max(1, Math.round(project.settings.pageTarget));
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
    localStorage.setItem(projectsStorageKey, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem(activeProjectStorageKey, JSON.stringify(activeProjectId));
  }, [activeProjectId]);

  useEffect(() => {
    localStorage.setItem(usageStorageKey, JSON.stringify(usageLedger));
  }, [usageLedger]);

  useEffect(() => {
    localStorage.setItem(planStorageKey, JSON.stringify(planId));
  }, [planId]);

  function addUsage(event: UsageEvent) {
    setUsageLedger((current) => [event, ...current].slice(0, 40));
  }

  function updateCurrentProject(updater: (current: ProjectState) => ProjectState) {
    setProjects((current) => current.map((item) => (item.id === project.id ? updater(item) : item)));
  }

  function updateProject(next: Partial<ProjectState>) {
    updateCurrentProject((current) => ({ ...current, ...next }));
  }

  function updateSettings(next: Partial<ProjectSettings>) {
    updateCurrentProject((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...next,
      },
    }));
  }

  function handleCreateProject() {
    const fresh = makeFreshProject();
    setProjects((current) => [fresh, ...current]);
    setActiveProjectId(fresh.id);
    setActiveCue(1);
    setNotice("새 프로젝트를 만들었습니다. 오른쪽 조건을 채워 대본을 생성하세요.");
  }

  function handleDuplicateProject() {
    const copy = {
      ...project,
      id: `project-copy-${Date.now()}`,
      title: `${project.title} 복사본`,
      comments: project.comments.map((comment) => ({ ...comment, id: `comment-${Date.now()}-${comment.id}` })),
    };
    setProjects((current) => [copy, ...current]);
    setActiveProjectId(copy.id);
    setNotice("현재 프로젝트를 복사했습니다.");
  }

  function handleResetProject() {
    updateCurrentProject(() => projectPresets.find((preset) => preset.id === project.id) ?? initialProject);
    setActiveCue(1);
    setReadingStatus("idle");
    setNotice("현재 프로젝트를 기본 샘플 상태로 되돌렸습니다.");
  }

  function handleSave() {
    localStorage.setItem(projectsStorageKey, JSON.stringify(projects));
    setNotice("프로젝트, 조건, 대본, 음악 큐를 브라우저 저장소에 저장했습니다.");
  }

  async function handleGenerateDraft() {
    const bible = buildProjectBible(project.settings, project.prompt, project.title);
    updateProject({ bible });
    setNotice("입력 조건을 바탕으로 스토리 바이블과 대본 초안을 생성하는 중입니다.");
    const result = await generateDraft(project.settings, project.prompt, project.title);
    const cues = generateLocalCues({ ...project, bible: result.bible, script: result.script });
    const runtimeReport = buildRuntimeReport({ ...project, bible: result.bible, script: result.script, cues });
    updateProject({
      script: result.script,
      bible: result.bible,
      cues,
      runtimeReport,
      aiSuggestions: buildAiSuggestions({ ...project, bible: result.bible, script: result.script, cues }),
    });
    setActiveCue(cues[0]?.id ?? 1);
    addUsage(makeUsageEvent("draft", 0, "조건 기반 대본 초안 생성"));
    setNotice(`${result.provider}가 ${project.settings.outputMode} 초안을 생성했습니다. 조건이 스토리 카드와 대본에 반영되었습니다.`);
  }

  async function handleSuggestCues() {
    setActiveInspector("music");
    setNotice("장면 기능 기준으로 음악이 들어갈 위치를 크게 표시합니다.");
    const result = await suggestMusicCues(project.script, project.bible, project.settings, project.title);
    updateProject({ cues: result.cues });
    setActiveCue(result.cues[0]?.id ?? 1);
    addUsage(makeUsageEvent("analysis", 0, "음악 큐 위치 추천"));
    setNotice(`${result.provider}가 ${result.cues.length}개의 음악 위치를 추천했습니다.`);
  }

  async function handleGenerateMusic(cue: MusicCue) {
    if (musicRemaining < musicGenerationCost) {
      setNotice(`음악 크레딧이 부족합니다. ${plan.name} 잔여 ${musicRemaining} / 필요 ${musicGenerationCost}`);
      return;
    }

    setActiveInspector("music");
    setNotice("작가 조건과 하우스 프롬프트를 재작성한 뒤 음악 provider로 전달하는 중입니다.");
    updateCurrentProject((current) => ({
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

      updateCurrentProject((current) => ({
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
      setNotice(`${rewrite.provider} -> ${music.provider} 완료. ${musicGenerationCost} credits 차감.`);
    } catch {
      updateCurrentProject((current) => ({
        ...current,
        cues: current.cues.map((item) => (item.id === cue.id ? { ...item, status: "failed" } : item)),
      }));
      setNotice("음악 생성 중 문제가 생겼습니다. provider 설정을 확인하세요.");
    }
  }

  async function handleGenerateReading() {
    setActiveInspector("voice");
    if (!isStudio) {
      setNotice("전체 리딩은 Studio 플랜에서만 열립니다. 플랜을 Studio로 바꾸면 mock 생성이 가능합니다.");
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
    window.setTimeout(() => setIsPlaying(false), 1300);
  }

  function handleRunAiSuggestion() {
    const aiSuggestions = buildAiSuggestions(project);
    updateProject({ aiSuggestions });
    setNotice("AI 제안 패널을 갱신했습니다. 오른쪽 아래 알림과 대본 위 제안 목록을 확인하세요.");
  }

  function handleAddComment() {
    const comment = {
      id: `comment-${Date.now()}`,
      target: `씬 ${Math.max(1, project.comments.length + 1)}`,
      body: `${project.settings.protagonist}의 목표가 더 빨리 드러나는지 확인하세요.`,
      resolved: false,
    };
    updateProject({ comments: [comment, ...project.comments] });
    setNotice("새 코멘트를 추가했습니다. 클릭하면 해결 상태가 바뀝니다.");
  }

  function handleRuntime() {
    const runtimeReport = buildRuntimeReport(project);
    updateProject({ runtimeReport });
    addUsage(makeUsageEvent("analysis", 0, "러닝타임 계산"));
    setNotice("러닝타임을 다시 계산했습니다.");
  }

  function handleToggleReadingMode() {
    setReadingMode((current) => !current);
    setActiveInspector("voice");
    setNotice(readingMode ? "편집 모드로 돌아왔습니다." : "리딩 모드가 켜졌습니다. 캐릭터별 음성을 확인하세요.");
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

  function toggleComment(commentId: string) {
    updateProject({
      comments: project.comments.map((comment) =>
        comment.id === commentId ? { ...comment, resolved: !comment.resolved } : comment,
      ),
    });
  }

  return (
    <main className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
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

        <button className="new-project-button" onClick={handleCreateProject}>
          <Plus size={16} />
          새 뮤지컬
        </button>

        <section className="side-section">
          <h2>프로젝트</h2>
          {projects.map((item) => (
            <button
              className={`project-item ${item.id === project.id ? "active" : ""}`}
              key={item.id}
              onClick={() => {
                setActiveProjectId(item.id);
                setActiveCue(item.cues[0]?.id ?? 1);
                setNotice(`${item.title} 프로젝트로 전환했습니다.`);
              }}
            >
              <FileText size={16} />
              <span>{item.title}</span>
            </button>
          ))}
        </section>

        <section className="side-section">
          <h2>스토리 바이블</h2>
          <div className="bible-list">
            {project.bible.characters.slice(0, 5).map((character) => (
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
            <p className="eyebrow">Writer Workstation</p>
            <input
              className="title-input"
              value={project.title}
              onChange={(event) => updateProject({ title: event.target.value })}
              aria-label="프로젝트 제목"
            />
          </div>
          <div className="top-actions">
            <ToolbarButton
              icon={<PanelLeft size={17} />}
              label="사이드바 접기"
              active={isSidebarCollapsed}
              onClick={() => setIsSidebarCollapsed((current) => !current)}
            />
            <ToolbarButton icon={<Copy size={17} />} label="프로젝트 복사" onClick={handleDuplicateProject} />
            <ToolbarButton icon={<RefreshCcw size={17} />} label="초기화" onClick={handleResetProject} />
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
                  조건 기반 생성
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
                  음악 위치 크게 보기
                </button>
              </div>
            </div>

            <div className="script-toolbar" aria-label="대본 도구">
              <ToolbarButton icon={<Bot size={17} />} label="AI 제안" active={project.aiSuggestions.length > 0} onClick={handleRunAiSuggestion} />
              <ToolbarButton icon={<MessageSquareText size={17} />} label="코멘트" active={project.comments.length > 0} onClick={handleAddComment} />
              <ToolbarButton icon={<Timer size={17} />} label="러닝타임 계산" onClick={handleRuntime} />
              <ToolbarButton icon={<Mic2 size={17} />} label="리딩 모드" active={readingMode} onClick={handleToggleReadingMode} />
            </div>

            <div className="analysis-strip">
              <div>
                <strong>러닝타임</strong>
                <span>{project.runtimeReport}</span>
              </div>
              <div>
                <strong>AI 제안</strong>
                <span>{project.aiSuggestions[0] ?? "AI 제안 버튼을 누르면 dramaturg 체크리스트가 생성됩니다."}</span>
              </div>
            </div>

            {project.cues.length > 0 && (
              <div className="music-map-inline">
                <div className="map-head">
                  <div>
                    <p className="eyebrow">Music Placement Map</p>
                    <h2>음악이 들어갈 위치</h2>
                  </div>
                  <button className="secondary-button compact" onClick={handleSuggestCues}>
                    <Sparkles size={15} />
                    다시 추천
                  </button>
                </div>
                <div className="music-map-grid">
                  {project.cues.slice(0, 6).map((cue) => (
                    <button
                      className={cue.id === activeCue ? "active" : ""}
                      key={cue.id}
                      onClick={() => {
                        setActiveCue(cue.id);
                        setActiveInspector("music");
                      }}
                    >
                      <strong>{cue.title}</strong>
                      <span>{cue.placement}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="script-page">
              <div className="page-meta">
                <span>{readingMode ? "리딩 모드" : "편집 모드"} / A4 {generatedPages}쪽 목표</span>
                <span>{project.settings.outputMode}</span>
              </div>
              <textarea
                className={`script-editor ${readingMode ? "reading" : ""}`}
                value={project.script}
                onChange={(event) => updateProject({ script: event.target.value })}
                aria-label="대본 편집기"
                readOnly={readingMode}
              />
            </div>
          </section>

          <aside className="control-panel">
            <div className="inspector-tabs">
              <button className={activeInspector === "settings" ? "active" : ""} onClick={() => setActiveInspector("settings")}>
                <Settings2 size={15} />
                설정
              </button>
              <button className={activeInspector === "music" ? "active" : ""} onClick={() => setActiveInspector("music")}>
                <AudioLines size={15} />
                음악
              </button>
              <button className={activeInspector === "voice" ? "active" : ""} onClick={() => setActiveInspector("voice")}>
                <Mic2 size={15} />
                리딩
              </button>
              <button className={activeInspector === "billing" ? "active" : ""} onClick={() => setActiveInspector("billing")}>
                <CreditCard size={15} />
                결제
              </button>
            </div>

            {activeInspector === "settings" && (
              <section className="settings-panel">
                <div className="panel-title">
                  <Settings2 size={18} />
                  <h2>대본 생성 조건</h2>
                </div>

                <div className="step-list horizontal">
                  {settingSteps.map((step, index) => (
                    <div className="step-row" key={step}>
                      <span>{index + 1}</span>
                      {step}
                    </div>
                  ))}
                </div>

                <label>
                  장르
                  <div className="select-shell">
                    <select value={project.settings.genre} onChange={(event) => updateSettings({ genre: event.target.value })}>
                      <option>컨템포러리 뮤지컬</option>
                      <option>소극장 창작 뮤지컬</option>
                      <option>판타지 가족 뮤지컬</option>
                      <option>블랙코미디 뮤지컬</option>
                      <option>주크박스 뮤지컬</option>
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </label>

                <label>
                  비슷한 작품
                  <input value={project.settings.reference} onChange={(event) => updateSettings({ reference: event.target.value })} />
                </label>

                <label>
                  시대
                  <input value={project.settings.era} onChange={(event) => updateSettings({ era: event.target.value })} />
                </label>

                <label>
                  주요 공간
                  <input value={project.settings.location} onChange={(event) => updateSettings({ location: event.target.value })} />
                </label>

                <label>
                  주인공
                  <input value={project.settings.protagonist} onChange={(event) => updateSettings({ protagonist: event.target.value })} />
                </label>

                <label>
                  주인공 목표
                  <input
                    value={project.settings.protagonistGoal}
                    onChange={(event) => updateSettings({ protagonistGoal: event.target.value })}
                  />
                </label>

                <label>
                  반대 힘
                  <input
                    value={project.settings.antagonistForce}
                    onChange={(event) => updateSettings({ antagonistForce: event.target.value })}
                  />
                </label>

                <label>
                  중심 갈등
                  <input
                    value={project.settings.centralConflict}
                    onChange={(event) => updateSettings({ centralConflict: event.target.value })}
                  />
                </label>

                <label>
                  결말 방향
                  <div className="select-shell">
                    <select value={project.settings.endingType} onChange={(event) => updateSettings({ endingType: event.target.value })}>
                      <option>씁쓸하지만 희망적인 열린 결말</option>
                      <option>명확한 해피엔딩</option>
                      <option>비극적이지만 카타르시스 있는 결말</option>
                      <option>아이러니한 반전 결말</option>
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </label>

                <div className="settings-two-col">
                  <label>
                    출력
                    <div className="select-shell">
                      <select
                        value={project.settings.outputMode}
                        onChange={(event) => updateSettings({ outputMode: event.target.value as ProjectSettings["outputMode"] })}
                      >
                        <option>스토리+대본</option>
                        <option>대본 중심</option>
                        <option>가사 중심</option>
                      </select>
                      <ChevronDown size={16} />
                    </div>
                  </label>
                  <label>
                    막 구조
                    <div className="select-shell">
                      <select
                        value={project.settings.actStructure}
                        onChange={(event) => updateSettings({ actStructure: event.target.value as ProjectSettings["actStructure"] })}
                      >
                        <option>단막</option>
                        <option>2막</option>
                        <option>3막</option>
                      </select>
                      <ChevronDown size={16} />
                    </div>
                  </label>
                </div>

                <label>
                  목표 시간
                  <div className="range-row">
                    <input
                      type="range"
                      min="10"
                      max="140"
                      value={project.settings.lengthMinutes}
                      onChange={(event) => updateSettings({ lengthMinutes: Number(event.target.value), pageTarget: Number(event.target.value) })}
                    />
                    <strong>{project.settings.lengthMinutes}분</strong>
                  </div>
                </label>

                <div className="settings-two-col">
                  <label>
                    장면 수
                    <div className="range-row">
                      <input
                        type="range"
                        min="3"
                        max="24"
                        value={project.settings.sceneCount}
                        onChange={(event) => updateSettings({ sceneCount: Number(event.target.value) })}
                      />
                      <strong>{project.settings.sceneCount}</strong>
                    </div>
                  </label>
                  <label>
                    넘버 수
                    <div className="range-row">
                      <input
                        type="range"
                        min="2"
                        max="18"
                        value={project.settings.songCount}
                        onChange={(event) => updateSettings({ songCount: Number(event.target.value) })}
                      />
                      <strong>{project.settings.songCount}</strong>
                    </div>
                  </label>
                </div>

                <div className="settings-two-col">
                  <label>
                    등장인물
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
                </div>

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
                  대사 스타일
                  <input
                    value={project.settings.dialogueStyle}
                    onChange={(event) => updateSettings({ dialogueStyle: event.target.value })}
                  />
                </label>

                <label>
                  가사 스타일
                  <input value={project.settings.lyricStyle} onChange={(event) => updateSettings({ lyricStyle: event.target.value })} />
                </label>

                <div className="settings-two-col">
                  <label>
                    춤/동선
                    <div className="select-shell">
                      <select value={project.settings.danceLevel} onChange={(event) => updateSettings({ danceLevel: event.target.value })}>
                        <option>낮음: 동선 중심</option>
                        <option>중간: 안무 포인트 2~3개</option>
                        <option>높음: 앙상블 안무 중심</option>
                      </select>
                      <ChevronDown size={16} />
                    </div>
                  </label>
                  <label>
                    예산
                    <div className="select-shell">
                      <select value={project.settings.budgetRange} onChange={(event) => updateSettings({ budgetRange: event.target.value })}>
                        <option>소극장 저예산</option>
                        <option>중극장 워크숍</option>
                        <option>상업 프로덕션</option>
                      </select>
                      <ChevronDown size={16} />
                    </div>
                  </label>
                </div>

                <label>
                  권리/레퍼런스 기준
                  <input value={project.settings.rightsMode} onChange={(event) => updateSettings({ rightsMode: event.target.value })} />
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
              </section>
            )}

            {activeInspector === "music" && activeCueData && (
              <section className="music-panel">
                <div className="panel-title">
                  <AudioLines size={18} />
                  <h2>음악 큐</h2>
                </div>

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
              </section>
            )}

            {activeInspector === "voice" && (
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
                <button className="locked-button" onClick={handleGenerateReading} disabled={readingStatus === "generating"}>
                  {!isStudio ? <Lock size={16} /> : <CircleDollarSign size={16} />}
                  {!isStudio
                    ? "Studio 플랜에서 리딩 생성"
                    : readingStatus === "ready"
                      ? "샘플 리딩 준비됨"
                      : `전체 리딩 생성 -${readingCost}`}
                </button>
              </section>
            )}

            {activeInspector === "billing" && (
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
                  {usageLedger.slice(0, 6).map((event) => (
                    <div key={event.id}>
                      <span>{event.label}</span>
                      <strong>{event.amount} cr</strong>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="bible-panel">
              <div className="panel-title">
                <BookOpenText size={18} />
                <h2>스토리 바이블</h2>
              </div>
              <p>{project.bible.logline}</p>
              <div className="mini-list">
                {(project.bible.sceneCards ?? []).slice(0, 4).map((card) => (
                  <span key={card}>{card}</span>
                ))}
              </div>
            </section>

            {project.comments.length > 0 && (
              <section className="comments-panel">
                <div className="panel-title">
                  <MessageSquareText size={18} />
                  <h2>코멘트</h2>
                </div>
                {project.comments.map((comment) => (
                  <button className={comment.resolved ? "resolved" : ""} key={comment.id} onClick={() => toggleComment(comment.id)}>
                    <strong>{comment.target}</strong>
                    <span>{comment.body}</span>
                  </button>
                ))}
              </section>
            )}

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
