import {
  AlertCircle,
  AudioLines,
  Ban,
  BookOpenText,
  Bot,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Copy,
  CreditCard,
  Database,
  Download,
  FileText,
  Gauge,
  Globe2,
  History,
  Link2,
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
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Timer,
  UserPlus,
  Users,
  Wand2,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  generateDraft,
  generateMusicAsset,
  generateReadingAsset,
  acknowledgeRights,
  createCheckoutSession,
  createTeamInvite,
  getProviderJobStatus,
  previewUsageLimit,
  rewriteMusicPrompt,
  suggestMusicCues,
  syncWorkspace,
} from "./api";
import {
  commercialReadiness,
  createProviderJob,
  createActionResult,
  createWorkspaceVersion,
  defaultCostPolicy,
  defaultOnboardingState,
  defaultRightsState,
  defaultTeamMembers,
  defaultWorkspaceAccount,
  onboardingSteps,
  rightsProgress,
  type ActionResult,
  type ActionResultKind,
  type CostPolicy,
  type ProviderJob,
  type RightsChecklistKey,
  type RightsState,
  type TeamMember,
  type WorkspaceAccount,
  type WorkspaceVersion,
} from "./commercial";
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
const workspaceStorageKey = "stagewrite.workspace.v1";
const teamStorageKey = "stagewrite.team.v1";
const versionsStorageKey = "stagewrite.versions.v1";
const jobsStorageKey = "stagewrite.providerJobs.v1";
const rightsStorageKey = "stagewrite.rights.v1";
const costPolicyStorageKey = "stagewrite.costPolicy.v1";
const onboardingStorageKey = "stagewrite.onboarding.v1";
const resultsStorageKey = "stagewrite.results.v1";

const settingSteps = ["기본", "세계", "인물", "구조", "음악", "제작"];
const dramaticFunctionFallbacks = ["Opening", "I Want Song", "Charm Song", "Conflict Duet", "Reprise", "11시 넘버", "Finale", "Tag"];

function getCueDramaticFunction(cue: MusicCue, index: number) {
  const haystack = `${cue.title} ${cue.intent} ${cue.placement}`.toLowerCase();
  if (haystack.includes("opening") || haystack.includes("오프닝")) return "Opening";
  if (haystack.includes("i want") || haystack.includes("욕망")) return "I Want Song";
  if (haystack.includes("reprise") || haystack.includes("리프라이즈")) return "Reprise";
  if (haystack.includes("11시") || haystack.includes("eleven")) return "11시 넘버";
  if (haystack.includes("finale") || haystack.includes("피날레")) return "Finale";
  if (haystack.includes("duet") || haystack.includes("충돌")) return "Conflict Duet";
  if (haystack.includes("charm") || haystack.includes("정서")) return "Charm Song";
  return dramaticFunctionFallbacks[index % dramaticFunctionFallbacks.length];
}

function getCueTimelinePercent(index: number, total: number) {
  if (total <= 1) return 50;
  return Math.round((index / (total - 1)) * 100);
}

function getCueTimelineBeat(index: number, total: number) {
  if (index === 0) return "세계 규칙";
  if (index === total - 1) return "결말 정리";
  const ratio = index / Math.max(1, total - 1);
  if (ratio < 0.3) return "욕망 제시";
  if (ratio < 0.55) return "관계 압박";
  if (ratio < 0.78) return "전환/Reprise";
  return "최종 선택";
}

type MainPage = "workspace" | "bible" | "songs" | "readingShare";
type AppPage =
  | MainPage
  | "export"
  | "billing"
  | "ops"
  | "launch"
  | "mobile"
  | "results";
type AdminTab = "account" | "billing" | "team" | "rights" | "provider" | "cost";
type ActionTarget = AppPage | `admin:${AdminTab}`;

const exportFormats: ExportFormat[] = ["markdown", "fountain", "kstage", "reading-packet", "manifest", "pdf"];

const exportFormatLabels: Record<ExportFormat, string> = {
  markdown: "Markdown",
  fountain: "Fountain",
  kstage: "K-Stage",
  "reading-packet": "Reading Packet",
  manifest: "Manifest",
  pdf: "PDF",
};

const exportFormatCopy: Record<ExportFormat, string> = {
  markdown: "작가/팀 공유용 문서",
  fountain: "스크립트 툴 호환 포맷",
  kstage: "한국 공연 개발용 패킷",
  "reading-packet": "배우/연출 리딩용 패킷",
  manifest: "개발/백업용 JSON 패키지",
  pdf: "인쇄/리딩용 페이지",
};

const rightsLabels: Record<RightsChecklistKey, string> = {
  referenceOnly: "레퍼런스는 구조 분석용으로만 사용",
  providerTerms: "음악/음성 provider 상업 사용 조건 확인",
  commercialPlan: "상업 배포 가능한 유료 플랜 사용",
  noVoiceClone: "실존 배우/가수 음성 무단 복제 금지",
  humanReview: "공개 전 사람이 최종 검수",
};

const resultLabels: Record<ActionResultKind, string> = {
  generation: "생성",
  music: "음악",
  reading: "리딩",
  export: "내보내기",
  billing: "결제",
  ops: "운영",
  collaboration: "협업",
  analysis: "분석",
  system: "시스템",
};

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

function EmptyState({
  icon,
  eyebrow,
  message,
  children,
}: {
  icon: ReactNode;
  eyebrow: string;
  message: string;
  children: ReactNode;
}) {
  return (
    <section className="empty-state" aria-live="polite">
      <div className="empty-state-icon">{icon}</div>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{message}</h2>
      </div>
      <div className="empty-state-actions">{children}</div>
    </section>
  );
}

function makeEmptyBible(title = "새 뮤지컬"): ProjectState["bible"] {
  return {
    title,
    logline: "",
    premise: "",
    synopsis: "",
    characters: [],
    themes: [],
    structure: [],
    sceneCards: [],
    songMap: [],
  };
}

function makeFreshProject(): ProjectState {
  return {
    ...initialProject,
    id: `project-${Date.now()}`,
    title: "새 뮤지컬",
    prompt: "",
    bible: makeEmptyBible("새 뮤지컬"),
    script: "",
    cues: [],
    comments: [],
    aiSuggestions: [],
    runtimeReport: "아직 대본이 없습니다. 한 문장으로 시작하면 러닝타임을 계산할 수 있습니다.",
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
  const [activeInspector, setActiveInspector] = useState<"settings" | "music" | "voice">("settings");
  const [activeSettingStep, setActiveSettingStep] = useState(0);
  const [activePage, setActivePage] = useState<AppPage>("workspace");
  const [isResultDrawerOpen, setIsResultDrawerOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>("account");
  const [readingMode, setReadingMode] = useState(false);
  const [editingCharacterName, setEditingCharacterName] = useState<string | null>(null);
  const [editingSceneIndex, setEditingSceneIndex] = useState<number | null>(null);
  const [workspaceAccount, setWorkspaceAccount] = useState<WorkspaceAccount>(() =>
    loadJson(workspaceStorageKey, defaultWorkspaceAccount),
  );
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => loadJson(teamStorageKey, defaultTeamMembers));
  const [versions, setVersions] = useState<WorkspaceVersion[]>(() => loadJson(versionsStorageKey, []));
  const [providerJobs, setProviderJobs] = useState<ProviderJob[]>(() => loadJson(jobsStorageKey, []));
  const [rightsState, setRightsState] = useState<RightsState>(() => loadJson(rightsStorageKey, defaultRightsState));
  const [costPolicy, setCostPolicy] = useState<CostPolicy>(() => loadJson(costPolicyStorageKey, defaultCostPolicy));
  const [onboardingState, setOnboardingState] = useState(() => loadJson(onboardingStorageKey, defaultOnboardingState));
  const [actionResults, setActionResults] = useState<ActionResult[]>(() => loadJson(resultsStorageKey, []));
  const [inviteEmail, setInviteEmail] = useState("director@example.com");
  const [shareLink, setShareLink] = useState("https://sequenzen.github.io/ai-musical-workstation/");
  const [mobileReviewLink, setMobileReviewLink] = useState("https://sequenzen.github.io/ai-musical-workstation/?view=mobile-review");
  const [checkoutStatus, setCheckoutStatus] = useState("아직 checkout 세션을 만들지 않았습니다.");

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
  const totalCreditSpent = usageLedger.reduce((sum, event) => sum + event.amount, 0);
  const monthlyCreditRemaining = Math.max(0, costPolicy.monthlyCreditCap - totalCreditSpent);
  const rightsCompletion = rightsProgress(rightsState);
  const hasCheckoutSession = checkoutStatus.includes("checkout-mock") || checkoutStatus.includes("Stripe");
  const readiness = commercialReadiness(
    rightsState,
    workspaceAccount.storageMode === "server-sync" || versions.length > 0,
    hasCheckoutSession,
  );
  const activeJobs = providerJobs.filter((job) => job.status === "queued" || job.status === "processing");
  const lastSaveResult = actionResults.find((result) => result.sourceButton === "저장");
  const saveStatusLabel = lastSaveResult
    ? `저장됨 ${lastSaveResult.createdAt.slice(11, 16)}`
    : "로컬 보관 중";
  const activePageLabel: Record<MainPage, string> = {
    workspace: "작업실",
    bible: "바이블",
    songs: "넘버",
    readingShare: "리딩/공유",
  };
  const currentMainPage = (["workspace", "bible", "songs", "readingShare"].includes(activePage) ? activePage : "workspace") as MainPage;
  const bibleCharacterSuggestions = project.bible.characters.slice(0, 4).map((character) => ({
    title: `${character.name}의 선택`,
    body: `${character.desire}가 ${project.settings.centralConflict}와 더 직접 부딪히는 장면을 하나 배치하세요.`,
  }));
  const bibleSceneSuggestions = project.bible.sceneCards.slice(0, 5).map((card, index) => ({
    title: `씬 ${index + 1}`,
    body: `${card} 안에서 감정 전환점과 넘버 진입 가능성을 함께 확인하세요.`,
  }));
  const numberTimeline = project.cues.map((cue, index) => ({
    cue,
    dramaticFunction: getCueDramaticFunction(cue, index),
    progress: getCueTimelinePercent(index, project.cues.length),
    beat: getCueTimelineBeat(index, project.cues.length),
    sceneAnchor: project.bible.sceneCards[index % Math.max(1, project.bible.sceneCards.length)] ?? cue.placement,
  }));
  const hasScriptDraft = project.script.trim().length > 0;
  const hasBibleContent = Boolean(
    project.bible.logline.trim() ||
      project.bible.synopsis.trim() ||
      project.bible.characters.length ||
      project.bible.sceneCards.length ||
      project.bible.structure.length,
  );
  const hasMusicCues = project.cues.length > 0;
  const hasReadingInputs = hasScriptDraft && project.bible.characters.length > 0;

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

  useEffect(() => {
    localStorage.setItem(workspaceStorageKey, JSON.stringify(workspaceAccount));
  }, [workspaceAccount]);

  useEffect(() => {
    localStorage.setItem(teamStorageKey, JSON.stringify(teamMembers));
  }, [teamMembers]);

  useEffect(() => {
    localStorage.setItem(versionsStorageKey, JSON.stringify(versions));
  }, [versions]);

  useEffect(() => {
    localStorage.setItem(jobsStorageKey, JSON.stringify(providerJobs));
  }, [providerJobs]);

  useEffect(() => {
    localStorage.setItem(rightsStorageKey, JSON.stringify(rightsState));
  }, [rightsState]);

  useEffect(() => {
    localStorage.setItem(costPolicyStorageKey, JSON.stringify(costPolicy));
  }, [costPolicy]);

  useEffect(() => {
    localStorage.setItem(onboardingStorageKey, JSON.stringify(onboardingState));
  }, [onboardingState]);

  useEffect(() => {
    localStorage.setItem(resultsStorageKey, JSON.stringify(actionResults));
  }, [actionResults]);

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

  function updateCue(cueId: number, next: Partial<MusicCue>) {
    updateCurrentProject((current) => ({
      ...current,
      cues: current.cues.map((cue) => (cue.id === cueId ? { ...cue, ...next } : cue)),
    }));
  }

  function updateBibleCharacter(
    characterName: string,
    next: Partial<ProjectState["bible"]["characters"][number]>,
  ) {
    updateCurrentProject((current) => ({
      ...current,
      bible: {
        ...current.bible,
        characters: current.bible.characters.map((character) =>
          character.name === characterName ? { ...character, ...next } : character,
        ),
      },
    }));
  }

  function updateSceneCard(index: number, value: string) {
    updateCurrentProject((current) => ({
      ...current,
      bible: {
        ...current.bible,
        sceneCards: current.bible.sceneCards.map((card, cardIndex) => (cardIndex === index ? value : card)),
      },
    }));
  }

  function recordActionResult(input: {
    kind: ActionResultKind;
    status?: ActionResult["status"];
    title: string;
    sourceButton: string;
    summary: string;
    detail: string;
    targetPage?: ActionTarget;
    retryJobId?: string;
    openResults?: boolean;
  }) {
    const result = createActionResult({
      kind: input.kind,
      status: input.status ?? "success",
      title: input.title,
      sourceButton: input.sourceButton,
      summary: input.summary,
      detail: input.detail,
      projectId: project.id,
      projectTitle: project.title,
      targetPage: input.targetPage,
      retryJobId: input.retryJobId,
    });
    setActionResults((current) => [result, ...current].slice(0, 80));
    if (input.openResults) setIsResultDrawerOpen(true);
    return result;
  }

  function getActionResultStatus(result: ActionResult): NonNullable<ActionResult["status"]> {
    if (result.status) return result.status;
    const text = `${result.title} ${result.summary} ${result.detail}`.toLowerCase();
    if (text.includes("failed") || text.includes("실패") || text.includes("문제")) return "failed";
    if (
      text.includes("queued") ||
      text.includes("processing") ||
      text.includes("작업 큐") ||
      text.includes("큐 등록") ||
      text.includes("생성 중")
    ) {
      return "pending";
    }
    return "success";
  }

  function getRetryableJob(result: ActionResult) {
    if (result.retryJobId) return providerJobs.find((job) => job.id === result.retryJobId);
    const taskId = result.detail.match(/taskId:\s*([^\s\n.]+)/)?.[1];
    if (taskId) return providerJobs.find((job) => job.providerTaskId === taskId);
    return providerJobs.find((job) => result.detail.includes(job.providerTaskId) || result.summary.includes(job.title));
  }

  function canRetryResult(result: ActionResult) {
    const status = getActionResultStatus(result);
    if (status !== "pending" && status !== "failed") return false;
    if (getRetryableJob(result)) return true;
    return result.sourceButton === "음악 생성" || result.sourceButton === "전체 리딩 생성";
  }

  function handleRetryActionResult(result: ActionResult) {
    const job = getRetryableJob(result);
    if (job) {
      handleRetryJob(job.id);
      return;
    }

    if (result.sourceButton === "전체 리딩 생성" || result.kind === "reading") {
      void handleGenerateReading();
      return;
    }

    if (result.sourceButton === "음악 생성" || result.kind === "music") {
      const cue = project.cues.find((item) => result.summary.includes(item.title) || result.detail.includes(item.title)) ?? activeCueData;
      if (cue) {
        void handleGenerateMusic(cue);
        return;
      }
    }

    setNotice("재시도할 provider 작업을 찾지 못했습니다. 관련 화면에서 다시 실행해주세요.");
  }

  async function checkUsageAllowance(requestedCost: number) {
    const preview = await previewUsageLimit({
      policy: costPolicy,
      currentSpend: totalCreditSpent,
      requestedCost,
    });
    if (!preview.allowed) {
      setNotice(`월 크레딧 한도를 초과합니다. 남은 한도 ${monthlyCreditRemaining} / 요청 ${requestedCost}`);
      return false;
    }
    return true;
  }

  async function handleSyncWorkspace() {
    const result = await syncWorkspace({
      account: workspaceAccount,
      projectCount: projects.length,
      versionCount: versions.length,
    });
    const version = createWorkspaceVersion(project, workspaceAccount.ownerName, "서버 동기화 스냅샷");
    setVersions((current) => [version, ...current].slice(0, 12));
    setWorkspaceAccount((current) => ({ ...current, storageMode: "server-sync" }));
    recordActionResult({
      kind: "ops",
      title: "서버 동기화 결과",
      sourceButton: "서버 동기화 mock",
      summary: `${projects.length}개 프로젝트, ${versions.length + 1}개 버전 동기화`,
      detail: `${result.provider}가 ${result.syncedAt}에 workspace sync를 완료했습니다.`,
      targetPage: "admin:account",
      openResults: true,
    });
    setNotice(`${result.provider}에 ${projects.length}개 프로젝트를 동기화했습니다.`);
  }

  function handleCreateVersion(label = "작업 스냅샷") {
    const version = createWorkspaceVersion(project, workspaceAccount.ownerName, label);
    setVersions((current) => [version, ...current].slice(0, 12));
    recordActionResult({
      kind: "ops",
      title: "버전 저장 결과",
      sourceButton: "버전 저장",
      summary: `${version.label} 저장 완료`,
      detail: `${version.projectTitle}의 ${version.summary} 상태를 ${version.createdAt}에 저장했습니다.`,
      targetPage: "admin:account",
      openResults: true,
    });
    setNotice(`${version.label}을 저장했습니다. 버전 히스토리에서 복원할 수 있습니다.`);
  }

  function handleRestoreVersion(versionId: string) {
    const version = versions.find((item) => item.id === versionId);
    if (!version) return;
    setProjects((current) => {
      const exists = current.some((item) => item.id === version.snapshot.id);
      return exists
        ? current.map((item) => (item.id === version.snapshot.id ? version.snapshot : item))
        : [version.snapshot, ...current];
    });
    setActiveProjectId(version.snapshot.id);
    setActivePage("workspace");
    recordActionResult({
      kind: "ops",
      title: "버전 복원 결과",
      sourceButton: version.label,
      summary: `${version.projectTitle} 복원 완료`,
      detail: `${version.createdAt.slice(0, 10)}에 저장된 스냅샷을 작업실로 복원했습니다.`,
      targetPage: "workspace",
    });
    setNotice(`${version.label} 버전을 복원했습니다.`);
  }

  async function handleCheckout(planToBuy: PlanId) {
    const session = await createCheckoutSession(planToBuy);
    setPlanId(planToBuy);
    setCheckoutStatus(`${session.status === "mock" ? "mock checkout" : "Stripe checkout"}: ${session.sessionId}`);
    recordActionResult({
      kind: "billing",
      title: "Checkout 세션 결과",
      sourceButton: `${plans[planToBuy].name} checkout`,
      summary: `${plans[planToBuy].name} 플랜 checkout 세션 생성`,
      detail: `세션 ID: ${session.sessionId}. 실제 결제 키가 연결되면 ${session.url}로 redirect합니다.`,
      targetPage: "admin:billing",
      openResults: true,
    });
    setNotice(`${plans[planToBuy].name} checkout 세션을 만들었습니다. 실제 결제 키가 있으면 ${session.url}로 연결됩니다.`);
  }

  function toggleRightsChecklist(key: RightsChecklistKey) {
    setRightsState((current) => ({
      ...current,
      accepted: false,
      checklist: {
        ...current.checklist,
        [key]: !current.checklist[key],
      },
    }));
  }

  async function handleAcknowledgeRights() {
    const complete = rightsProgress(rightsState) === 100;
    if (!complete) {
      recordActionResult({
        kind: "ops",
        status: "failed",
        title: "권리 확인 차단 결과",
        sourceButton: "권리 확인 기록",
        summary: `권리 체크리스트 ${rightsProgress(rightsState)}% 완료`,
        detail: "상업 사용 기록을 저장하려면 권리 체크리스트를 모두 확인해야 합니다.",
        targetPage: "admin:rights",
        openResults: true,
      });
      setNotice("상업 사용 전에 권리 체크리스트를 모두 확인해야 합니다.");
      return;
    }
    const result = await acknowledgeRights({ rights: rightsState, projectTitle: project.title });
    setRightsState((current) => ({
      ...current,
      accepted: true,
      acceptedAt: result.acknowledgedAt,
    }));
    recordActionResult({
      kind: "ops",
      title: "권리 확인 결과",
      sourceButton: "권리 확인 기록",
      summary: `${project.title} 권리 체크 기록 완료`,
      detail: `권리 기록 ID: ${result.rightsId}. 체크리스트 ${rightsProgress(rightsState)}% 상태에서 저장했습니다.`,
      targetPage: "admin:rights",
      openResults: true,
    });
    setNotice(`권리 확인 기록을 저장했습니다. ID: ${result.rightsId}`);
  }

  async function handleInviteMember() {
    const member: TeamMember = {
      id: `member-${Date.now()}`,
      name: inviteEmail.split("@")[0] || "협업자",
      email: inviteEmail,
      role: "viewer",
      status: "invited",
    };
    const result = await createTeamInvite(member);
    setTeamMembers((current) => [member, ...current]);
    setShareLink(result.shareLink);
    recordActionResult({
      kind: "collaboration",
      title: "팀 초대 결과",
      sourceButton: "초대",
      summary: `${member.email} 초대 링크 생성`,
      detail: `초대 링크: ${result.shareLink}`,
      targetPage: "admin:team",
      openResults: true,
    });
    setNotice(`${member.email} 초대 링크를 만들었습니다.`);
  }

  function handleCompleteOnboarding(step: string, index: number) {
    setOnboardingState((current) => ({
      completedSteps: current.completedSteps.includes(step)
        ? current.completedSteps
        : [...current.completedSteps, step],
      currentStep: Math.min(onboardingSteps.length - 1, index + 1),
    }));
    recordActionResult({
      kind: "ops",
      title: "온보딩 단계 결과",
      sourceButton: step,
      summary: `${index + 1}단계 완료`,
      detail: `${step} 단계를 완료 처리했습니다. 다음 단계는 ${onboardingSteps[index + 1] ?? "없음"}입니다.`,
      targetPage: "admin:account",
    });
    setNotice(`${step} 단계를 완료 처리했습니다.`);
  }

  async function handlePollJob(jobId: string) {
    const job = providerJobs.find((item) => item.id === jobId);
    if (!job) return;
    const next = await getProviderJobStatus(job);
    setProviderJobs((current) => current.map((item) => (item.id === jobId ? next : item)));
    if (next.status === "ready" && next.type === "music" && next.cueId) {
      updateCue(next.cueId, { status: "ready" });
    }
    if (next.status === "ready" && next.type === "reading") {
      setReadingStatus("ready");
    }
    recordActionResult({
      kind: next.type === "music" ? "music" : "reading",
      status: next.status === "ready" ? "success" : next.status === "failed" ? "failed" : "pending",
      title: "Provider 작업 상태 결과",
      sourceButton: "polling",
      summary: `${next.title}: ${next.status}`,
      detail: `${next.provider} 작업 ${next.providerTaskId} 상태를 ${next.updatedAt}에 갱신했습니다.`,
      targetPage: "admin:provider",
      retryJobId: next.status === "ready" ? undefined : next.id,
      openResults: true,
    });
    setNotice(`${next.title} 작업 상태: ${next.status}`);
  }

  function handleRetryJob(jobId: string) {
    setProviderJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? {
              ...job,
              status: "queued",
              retryCount: job.retryCount + 1,
              updatedAt: new Date().toISOString(),
            }
          : job,
      ),
    );
    recordActionResult({
      kind: "ops",
      status: "pending",
      title: "Provider 재시도 결과",
      sourceButton: "retry",
      summary: "작업을 queued 상태로 되돌렸습니다.",
      detail: `작업 ID ${jobId}를 재시도 대기열로 보냈습니다.`,
      targetPage: "admin:provider",
      retryJobId: jobId,
      openResults: true,
    });
    setNotice("provider 작업을 재시도 대기열로 보냈습니다.");
  }

  function handleCreateMobileShare() {
    const projectLink = `${window.location.origin}${window.location.pathname}?project=${project.id}`;
    const mobileLink = `${projectLink}&view=mobile-review`;
    setShareLink(projectLink);
    setMobileReviewLink(mobileLink);
    recordActionResult({
      kind: "collaboration",
      title: "모바일 공유 링크 결과",
      sourceButton: "모바일 공유 링크 생성",
      summary: `${project.title} 모바일 리뷰 링크 생성`,
      detail: mobileLink,
      targetPage: "readingShare",
      openResults: true,
    });
    setNotice("모바일 리뷰용 공유 링크를 만들었습니다.");
  }

  function handleCreateProject() {
    const fresh = makeFreshProject();
    setProjects((current) => [fresh, ...current]);
    setActiveProjectId(fresh.id);
    setActiveCue(1);
    setActivePage("workspace");
    setActiveInspector("settings");
    setNotice("새 프로젝트를 만들었습니다. 한 문장만 적어도 오른쪽 조건과 함께 초안을 만들 수 있습니다.");
  }

  function handleStartWithSample() {
    const sample: ProjectState = {
      ...initialProject,
      id: project.id,
    };
    updateCurrentProject(() => sample);
    setActiveCue(sample.cues[0]?.id ?? 1);
    setActivePage("workspace");
    setActiveInspector("settings");
    setReadingStatus("idle");
    recordActionResult({
      kind: "system",
      title: "샘플 시작 결과",
      sourceButton: "샘플로 시작",
      summary: `${sample.title} 샘플 작업물 불러오기`,
      detail: "샘플 대본, 바이블, 음악 큐를 현재 프로젝트에 채웠습니다.",
      targetPage: "workspace",
    });
    setNotice("샘플 작업물을 불러왔습니다. 대본 편집기와 넘버 맵을 바로 확인할 수 있습니다.");
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
    setActivePage("workspace");
    recordActionResult({
      kind: "system",
      title: "프로젝트 복사 결과",
      sourceButton: "프로젝트 복사",
      summary: `${copy.title} 생성`,
      detail: "현재 프로젝트의 대본, 바이블, 음악 큐, 코멘트를 새 프로젝트로 복사했습니다.",
      targetPage: "workspace",
      openResults: true,
    });
    setNotice("현재 프로젝트를 복사했습니다.");
  }

  function handleResetProject() {
    updateCurrentProject((current) => {
      const preset = projectPresets.find((item) => item.id === current.id);
      if (preset) return preset;

      return {
        ...initialProject,
        id: current.id,
        title: current.title,
        bible: {
          ...initialProject.bible,
          title: current.title,
        },
      };
    });
    setActiveCue(1);
    setReadingStatus("idle");
    setActivePage("workspace");
    setActiveInspector("settings");
    recordActionResult({
      kind: "system",
      title: "샘플 초기화 결과",
      sourceButton: "샘플 상태로 초기화",
      summary: `${project.title} 샘플 상태 적용`,
      detail: "현재 프로젝트의 대본, 바이블, 음악 큐를 기본 샘플 상태로 되돌렸습니다.",
      targetPage: "workspace",
      openResults: true,
    });
    setNotice("현재 프로젝트를 기본 샘플 상태로 되돌렸습니다.");
  }

  function handleSave() {
    localStorage.setItem(projectsStorageKey, JSON.stringify(projects));
    recordActionResult({
      kind: "system",
      title: "저장 결과",
      sourceButton: "저장",
      summary: `${project.title} 브라우저 저장 완료`,
      detail: "프로젝트, 생성 조건, 대본, 음악 큐, 코멘트가 localStorage에 저장되었습니다.",
      targetPage: "workspace",
      openResults: true,
    });
    setNotice("프로젝트, 조건, 대본, 음악 큐를 브라우저 저장소에 저장했습니다.");
  }

  function handleRefreshBible(sourceButton = "조건으로 바이블 갱신") {
    const promptForGeneration = project.prompt.trim() || "한 문장으로 시작하는 창작 뮤지컬.";
    const bible = buildProjectBible(project.settings, promptForGeneration, project.title);
    const cues = generateLocalCues({ ...project, bible });
    updateProject({
      bible,
      cues,
      runtimeReport: buildRuntimeReport({ ...project, bible, cues }),
      aiSuggestions: buildAiSuggestions({ ...project, bible, cues }),
    });
    setActiveCue(cues[0]?.id ?? 1);
    recordActionResult({
      kind: "generation",
      title: sourceButton.includes("생성") ? "스토리 바이블 생성 결과" : "스토리 바이블 갱신 결과",
      sourceButton,
      summary: `${bible.characters.length}명 캐릭터, ${bible.sceneCards.length}개 씬 카드 갱신`,
      detail: bible.synopsis,
      targetPage: "bible",
    });
    setNotice("현재 조건으로 스토리 바이블, 씬 카드, 넘버 맵을 다시 구성했습니다.");
  }

  async function handleGenerateDraft() {
    const promptForGeneration = project.prompt.trim() || "한 문장으로 시작하는 창작 뮤지컬.";
    const bible = buildProjectBible(project.settings, promptForGeneration, project.title);
    updateProject({ bible });
    setNotice("입력 조건을 바탕으로 스토리 바이블과 대본 초안을 생성하는 중입니다.");
    const result = await generateDraft(project.settings, promptForGeneration, project.title);
    const cues = generateLocalCues({ ...project, bible: result.bible, script: result.script });
    const runtimeReport = buildRuntimeReport({ ...project, bible: result.bible, script: result.script, cues });
    updateProject({
      prompt: promptForGeneration,
      script: result.script,
      bible: result.bible,
      cues,
      runtimeReport,
      aiSuggestions: buildAiSuggestions({ ...project, bible: result.bible, script: result.script, cues }),
    });
    setActiveCue(cues[0]?.id ?? 1);
    addUsage(makeUsageEvent("draft", 0, "조건 기반 대본 초안 생성"));
    recordActionResult({
      kind: "generation",
      title: "대본 초안 생성 결과",
      sourceButton: "대본 초안 생성",
      summary: `${result.provider}가 ${project.settings.outputMode} 초안을 생성`,
      detail: `${result.bible.logline} / 대본 길이 ${result.script.length.toLocaleString()}자`,
      targetPage: "workspace",
    });
    setNotice(`${result.provider}가 ${project.settings.outputMode} 초안을 생성했습니다. 조건이 스토리 카드와 대본에 반영되었습니다.`);
  }

  async function handleSuggestCues(sourceButton = "음악 위치 크게 보기") {
    setActiveInspector("music");
    setNotice("장면 기능 기준으로 음악이 들어갈 위치를 크게 표시합니다.");
    const promptForGeneration = project.prompt.trim() || "한 문장으로 시작하는 창작 뮤지컬.";
    const bible =
      hasBibleContent && project.bible.characters.length > 0
        ? project.bible
        : buildProjectBible(project.settings, promptForGeneration, project.title);
    const result = await suggestMusicCues(project.script, bible, project.settings, project.title);
    updateProject({ bible, cues: result.cues });
    setActiveCue(result.cues[0]?.id ?? 1);
    addUsage(makeUsageEvent("analysis", 0, "음악 큐 위치 추천"));
    recordActionResult({
      kind: "music",
      title: "음악 위치 추천 결과",
      sourceButton,
      summary: `${result.cues.length}개 음악 큐 추천`,
      detail: result.cues.map((cue) => `${cue.title}: ${cue.placement}`).join("\n"),
      targetPage: "songs",
    });
    setNotice(`${result.provider}가 ${result.cues.length}개의 음악 위치를 추천했습니다.`);
  }

  async function handleGenerateMusic(cue: MusicCue) {
    if (musicGenerationCost > costPolicy.perRequestMusicCap) {
      recordActionResult({
        kind: "music",
        status: "failed",
        title: "음악 생성 차단 결과",
        sourceButton: "음악 생성",
        summary: `1회 음악 한도 ${costPolicy.perRequestMusicCap} cr 초과`,
        detail: `요청 비용 ${musicGenerationCost} cr이 현재 비용 한도를 초과했습니다.`,
        targetPage: "admin:cost",
        openResults: true,
      });
      setNotice(`요청 비용이 1회 음악 한도 ${costPolicy.perRequestMusicCap} credits를 초과합니다.`);
      return;
    }

    if (!(await checkUsageAllowance(musicGenerationCost))) {
      recordActionResult({
        kind: "music",
        status: "failed",
        title: "음악 생성 차단 결과",
        sourceButton: "음악 생성",
        summary: "월 크레딧 한도 초과",
        detail: `남은 월 한도 ${monthlyCreditRemaining} cr / 요청 ${musicGenerationCost} cr`,
        targetPage: "admin:cost",
        openResults: true,
      });
      return;
    }

    if (musicRemaining < musicGenerationCost) {
      recordActionResult({
        kind: "music",
        status: "failed",
        title: "음악 생성 차단 결과",
        sourceButton: "음악 생성",
        summary: `${plan.name} 플랜 음악 크레딧 부족`,
        detail: `잔여 ${musicRemaining} cr / 필요 ${musicGenerationCost} cr. 결제/크레딧 설정에서 플랜을 바꾸거나 크레딧을 확인하세요.`,
        targetPage: "admin:billing",
        openResults: true,
      });
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
      const finalStatus = music.status === "ready" ? "ready" : "generating";
      const job = createProviderJob({
        type: "music",
        title: cue.title,
        projectId: project.id,
        cueId: cue.id,
        providerTaskId: music.taskId,
        provider: music.provider,
        status: music.status === "ready" ? "ready" : "queued",
        cost: musicGenerationCost,
      });

      updateCurrentProject((current) => ({
        ...current,
        cues: current.cues.map((item) =>
          item.id === cue.id
            ? {
                ...item,
                status: finalStatus,
                rewrittenPrompt: rewrite.rewrittenPrompt,
                lyricsPrompt: rewrite.lyricsPrompt,
                negativePrompt: rewrite.negativePrompt,
                taskId: music.taskId,
                demoAudioUrl: music.demoAudioUrl,
              }
            : item,
        ),
      }));
      setProviderJobs((current) => [job, ...current].slice(0, 30));
      addUsage(makeUsageEvent("music", musicGenerationCost, cue.title));
      recordActionResult({
        kind: "music",
        status: music.status === "ready" ? "success" : "pending",
        title: "음악 생성 결과",
        sourceButton: "음악 생성",
        summary: `${cue.title} ${music.status === "ready" ? "재생 가능" : "작업 큐 등록"}`,
        detail: `taskId: ${music.taskId}\nprovider: ${music.provider}\nnegative: ${rewrite.negativePrompt}`,
        targetPage: music.status === "ready" ? "songs" : "admin:provider",
        retryJobId: music.status === "ready" ? undefined : job.id,
        openResults: true,
      });
      setNotice(
        music.status === "ready"
          ? `${rewrite.provider} -> ${music.provider} 완료. ${musicGenerationCost} credits 차감.`
          : `${music.provider} 작업을 큐에 등록했습니다. 작업 콘솔에서 polling할 수 있습니다.`,
      );
    } catch {
      updateCurrentProject((current) => ({
        ...current,
        cues: current.cues.map((item) => (item.id === cue.id ? { ...item, status: "failed" } : item)),
      }));
      recordActionResult({
        kind: "music",
        status: "failed",
        title: "음악 생성 실패",
        sourceButton: "음악 생성",
        summary: `${cue.title} 생성 실패`,
        detail: "provider 설정 또는 네트워크 문제로 음악 생성이 완료되지 않았습니다.",
        targetPage: "songs",
        openResults: true,
      });
      setNotice("음악 생성 중 문제가 생겼습니다. provider 설정을 확인하세요.");
    }
  }

  async function handleGenerateReading() {
    setActiveInspector("voice");
    if (!isStudio) {
      recordActionResult({
        kind: "reading",
        status: "failed",
        title: "전체 리딩 생성 차단 결과",
        sourceButton: "전체 리딩 생성",
        summary: "Studio 플랜 필요",
        detail: `현재 플랜은 ${plan.name}입니다. 전체 리딩 생성은 Studio 플랜에서 열립니다.`,
        targetPage: "admin:billing",
        openResults: true,
      });
      setNotice("전체 리딩은 Studio 플랜에서만 열립니다. 플랜을 Studio로 바꾸면 mock 생성이 가능합니다.");
      return;
    }

    if (readingCost > costPolicy.perRequestReadingCap) {
      recordActionResult({
        kind: "reading",
        status: "failed",
        title: "전체 리딩 생성 차단 결과",
        sourceButton: "전체 리딩 생성",
        summary: `1회 리딩 한도 ${costPolicy.perRequestReadingCap} cr 초과`,
        detail: `예상 비용 ${readingCost} cr이 현재 비용 한도를 초과했습니다.`,
        targetPage: "admin:cost",
        openResults: true,
      });
      setNotice(`요청 비용이 1회 리딩 한도 ${costPolicy.perRequestReadingCap} credits를 초과합니다.`);
      return;
    }

    if (!(await checkUsageAllowance(readingCost))) {
      recordActionResult({
        kind: "reading",
        status: "failed",
        title: "전체 리딩 생성 차단 결과",
        sourceButton: "전체 리딩 생성",
        summary: "월 크레딧 한도 초과",
        detail: `남은 월 한도 ${monthlyCreditRemaining} cr / 요청 ${readingCost} cr`,
        targetPage: "admin:cost",
        openResults: true,
      });
      return;
    }

    if (readingRemaining < readingCost) {
      recordActionResult({
        kind: "reading",
        status: "failed",
        title: "전체 리딩 생성 차단 결과",
        sourceButton: "전체 리딩 생성",
        summary: "리딩 크레딧 부족",
        detail: `잔여 ${readingRemaining} cr / 필요 ${readingCost} cr. 결제/크레딧 설정에서 플랜과 잔여 크레딧을 확인하세요.`,
        targetPage: "admin:billing",
        openResults: true,
      });
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
    const job = createProviderJob({
      type: "reading",
      title: `${project.title} 전체 리딩`,
      projectId: project.id,
      providerTaskId: result.taskId,
      provider: result.provider,
      status: result.status === "ready" ? "ready" : "queued",
      cost: readingCost,
    });
    setProviderJobs((current) => [job, ...current].slice(0, 30));
    addUsage(makeUsageEvent("reading", readingCost, `전체 리딩 ${result.durationSeconds}s`));
    setReadingStatus(result.status === "ready" ? "ready" : "generating");
    recordActionResult({
      kind: "reading",
      status: result.status === "ready" ? "success" : "pending",
      title: "전체 리딩 생성 결과",
      sourceButton: "전체 리딩 생성",
      summary: `${result.provider} ${result.status}, ${result.durationSeconds}초`,
      detail: `taskId: ${result.taskId}. 캐릭터 ${project.bible.characters.length}명의 voiceId를 provider adapter로 전달했습니다.`,
      targetPage: result.status === "ready" ? "readingShare" : "admin:provider",
      retryJobId: result.status === "ready" ? undefined : job.id,
      openResults: true,
    });
    setNotice(
      result.status === "ready"
        ? `${result.provider}가 ${result.durationSeconds}초 샘플 리딩을 준비했습니다. ${readingCost} credits 차감.`
        : `${result.provider} 리딩 작업을 큐에 등록했습니다. 작업 콘솔에서 polling할 수 있습니다.`,
    );
  }

  function handlePlayCue() {
    setIsPlaying(true);
    playTone();
    window.setTimeout(() => setIsPlaying(false), 1300);
    recordActionResult({
      kind: "music",
      title: "데모 재생 결과",
      sourceButton: "재생",
      summary: `${activeCueData?.title ?? "선택된 큐"} mock 오디오 재생`,
      detail: "Web Audio API 기반 짧은 데모 톤을 재생했습니다.",
      targetPage: "songs",
    });
  }

  function handleOpenCue(cue: MusicCue) {
    setActiveCue(cue.id);
    setActiveInspector("music");
    setNotice(`${cue.title} 큐 인스펙터를 열었습니다.`);
  }

  function handleViewCueInScript(cue: MusicCue) {
    setActiveCue(cue.id);
    setActiveInspector("music");
    setActivePage("workspace");
    setNotice(`${cue.title}의 대본 위치를 작업실에서 확인합니다. 위치: ${cue.placement}`);
  }

  function handleRunAiSuggestion() {
    const aiSuggestions = buildAiSuggestions(project);
    updateProject({ aiSuggestions });
    recordActionResult({
      kind: "analysis",
      title: "AI 제안 결과",
      sourceButton: "AI 제안",
      summary: `${aiSuggestions.length}개 dramaturg 제안 생성`,
      detail: aiSuggestions.join("\n"),
      targetPage: "workspace",
    });
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
    recordActionResult({
      kind: "collaboration",
      title: "코멘트 추가 결과",
      sourceButton: "코멘트",
      summary: `${comment.target} 코멘트 추가`,
      detail: comment.body,
      targetPage: "workspace",
    });
    setNotice("새 코멘트를 추가했습니다. 클릭하면 해결 상태가 바뀝니다.");
  }

  function handleRuntime() {
    const runtimeReport = buildRuntimeReport(project);
    updateProject({ runtimeReport });
    addUsage(makeUsageEvent("analysis", 0, "러닝타임 계산"));
    recordActionResult({
      kind: "analysis",
      title: "러닝타임 계산 결과",
      sourceButton: "러닝타임 계산",
      summary: `목표 ${project.settings.lengthMinutes}분 기준 계산 완료`,
      detail: runtimeReport,
      targetPage: "workspace",
    });
    setNotice("러닝타임을 다시 계산했습니다.");
  }

  function handleToggleReadingMode() {
    setReadingMode((current) => !current);
    setActiveInspector("voice");
    setNotice(readingMode ? "편집 모드로 돌아왔습니다." : "리딩 모드가 켜졌습니다. 캐릭터별 음성을 확인하세요.");
  }

  function handleConfirmCharacters() {
    if (!hasBibleContent || project.bible.characters.length === 0) {
      handleRefreshBible("조건으로 바이블 생성");
    }
    setActivePage("bible");
    setActiveInspector("settings");
    setActiveSettingStep(2);
    setNotice("바이블에서 캐릭터와 음성 톤을 확인하세요. 비어 있으면 현재 조건으로 자동 생성합니다.");
  }

  function handleExport() {
    handleExportAs(exportFormat);
  }

  function handleExportAs(format: ExportFormat) {
    exportProject(format, {
      title: project.title,
      prompt: project.prompt,
      settings: project.settings,
      bible: project.bible,
      script: project.script,
      cues: project.cues,
      usageLedger,
    });
    setExportFormat(format);
    addUsage(makeUsageEvent("export", 0, `${format} export`));
    recordActionResult({
      kind: "export",
      title: "내보내기 결과",
      sourceButton: `${format.toUpperCase()} 생성`,
      summary: `${format.toUpperCase()} 산출물 생성 실행`,
      detail: format === "pdf" ? "브라우저 인쇄 대화상자를 호출했습니다." : "다운로드 파일 생성을 실행했습니다.",
      targetPage: "readingShare",
      openResults: true,
    });
    setNotice(`${format.toUpperCase()} 내보내기를 실행했습니다.`);
  }

  function toggleComment(commentId: string) {
    updateProject({
      comments: project.comments.map((comment) =>
        comment.id === commentId ? { ...comment, resolved: !comment.resolved } : comment,
      ),
    });
  }

  function openPage(page: AppPage) {
    const redirects: Partial<Record<AppPage, MainPage>> = {
      export: "readingShare",
      mobile: "readingShare",
      results: "workspace",
      billing: "workspace",
      ops: "workspace",
      launch: "workspace",
    };
    const nextPage = (redirects[page] ?? page) as MainPage;
    setActivePage(nextPage);
    if (nextPage === "songs") setActiveInspector("music");
    if (nextPage === "bible") setActiveInspector("settings");
    if (nextPage === "readingShare") setActiveInspector("voice");
    if (page === "billing" || page === "ops") {
      setAdminTab(page === "billing" ? "billing" : "account");
      setIsAdminPanelOpen(true);
    }
    if (page === "results") setIsResultDrawerOpen(true);
    setNotice(
      {
        workspace: "작업실로 돌아왔습니다.",
        bible: "바이블에서 기획 요약, 인물, 구조, 씬 카드를 함께 확인합니다.",
        songs: "넘버에서 음악 큐와 가사 프롬프트를 관리합니다.",
        readingShare: "리딩/공유에서 전체 리딩, 공유 링크, 내보내기를 관리합니다.",
      }[nextPage],
    );
  }

  function openActionTarget(target?: string) {
    if (!target) return;
    setIsResultDrawerOpen(false);
    if (target === "overview") {
      openPage("bible");
      return;
    }
    if (target.startsWith("admin:")) {
      const tab = target.replace("admin:", "") as AdminTab;
      setAdminTab(tab);
      setIsAdminPanelOpen(true);
      return;
    }
    openPage(target as AppPage);
  }

  function renderLandingPage() {
    if (activePage === "bible") {
      if (!hasBibleContent) {
        return (
          <section className="page-landing bible-page">
            <EmptyState
              icon={<BookOpenText size={24} />}
              eyebrow="Story Bible"
              message="아직 작품 바이블이 없습니다. 작업실에서 초안을 만들면 자동으로 생성됩니다."
            >
              <button className="secondary-button" onClick={() => openPage("workspace")}>
                <FileText size={16} />
                작업실로 이동
              </button>
              <button className="primary-button" onClick={() => handleRefreshBible("조건으로 바이블 생성")}>
                <RefreshCcw size={16} />
                조건으로 바이블 생성
              </button>
            </EmptyState>
          </section>
        );
      }

      return (
        <section className="page-landing bible-page">
          <div className="page-hero bible-hero">
            <div>
              <p className="eyebrow">Story Bible</p>
              <h2>{project.title}</h2>
              <p>{project.bible.logline}</p>
            </div>
            <div className="page-actions">
              <button className="primary-button" onClick={() => handleRefreshBible()}>
                <RefreshCcw size={16} />
                조건으로 바이블 갱신
              </button>
              <button className="secondary-button" onClick={() => openPage("workspace")}>
                <FileText size={16} />
                작업실로 보내기
              </button>
            </div>
          </div>

          <div className="bible-summary-grid">
            <article>
              <strong>제목</strong>
              <span>{project.title}</span>
            </article>
            <article>
              <strong>로그라인</strong>
              <span>{project.bible.logline}</span>
            </article>
            <article>
              <strong>핵심 갈등</strong>
              <span>{project.settings.centralConflict}</span>
            </article>
            <article>
              <strong>목표 러닝타임</strong>
              <span>{project.settings.lengthMinutes}분 / A4 {generatedPages}쪽</span>
            </article>
            <article>
              <strong>무대 규모</strong>
              <span>{project.settings.stageScale}</span>
            </article>
            <article>
              <strong>넘버 수</strong>
              <span>{project.settings.songCount}곡 / {project.settings.musicDensity}</span>
            </article>
          </div>

          <section className="bible-section">
            <div className="section-head">
              <div>
                <p className="eyebrow">Synopsis</p>
                <h3>시놉시스</h3>
              </div>
            </div>
            <p>{project.bible.synopsis}</p>
          </section>

          <section className="bible-section">
            <div className="section-head">
              <div>
                <p className="eyebrow">Characters</p>
                <h3>등장인물</h3>
              </div>
              <button
                className="secondary-button compact"
                onClick={() => {
                  const firstCharacter = project.bible.characters[0];
                  if (firstCharacter) setEditingCharacterName(firstCharacter.name);
                  setNotice(firstCharacter ? `${firstCharacter.name} 캐릭터 편집기를 열었습니다.` : "캐릭터를 먼저 생성해주세요.");
                }}
                aria-label="첫 캐릭터 편집 시작"
              >
                <Users size={15} />
                캐릭터 편집 시작
              </button>
            </div>
            <div className="character-grid">
              {project.bible.characters.map((character) => (
                <article key={character.name}>
                  <div className="card-head">
                    <div>
                      <strong>{character.name}</strong>
                      <span>{character.role}</span>
                    </div>
                    <button
                      className="secondary-button compact"
                      aria-label={`${character.name} 캐릭터 ${editingCharacterName === character.name ? "편집 닫기" : "편집"}`}
                      onClick={() => setEditingCharacterName((current) => (current === character.name ? null : character.name))}
                    >
                      {editingCharacterName === character.name ? "닫기" : "편집"}
                    </button>
                  </div>
                  {editingCharacterName === character.name ? (
                    <div className="inline-editor">
                      <label>
                        역할
                        <input value={character.role} onChange={(event) => updateBibleCharacter(character.name, { role: event.target.value })} />
                      </label>
                      <label>
                        욕망
                        <input value={character.desire} onChange={(event) => updateBibleCharacter(character.name, { desire: event.target.value })} />
                      </label>
                      <label>
                        비밀
                        <input value={character.secret} onChange={(event) => updateBibleCharacter(character.name, { secret: event.target.value })} />
                      </label>
                      <label>
                        음성/톤
                        <input value={character.voice} onChange={(event) => updateBibleCharacter(character.name, { voice: event.target.value })} />
                      </label>
                    </div>
                  ) : (
                    <>
                      <p>욕망: {character.desire}</p>
                      <p>비밀: {character.secret}</p>
                      <small>{character.voice}</small>
                    </>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="bible-section">
            <div className="section-head">
              <div>
                <p className="eyebrow">Structure</p>
                <h3>구조</h3>
              </div>
              <button
                className="secondary-button compact"
                onClick={() => {
                  handleRefreshBible("구조 조건으로 바이블 갱신");
                }}
                aria-label="구조 조건으로 바이블 다시 만들기"
              >
                <RefreshCcw size={15} />
                구조 다시 만들기
              </button>
            </div>
            <div className="page-grid">
              {project.bible.structure.map((item) => (
                <article key={item}>
                  <strong>Structure</strong>
                  <span>{item}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="bible-section">
            <div className="section-head">
              <div>
                <p className="eyebrow">Scene Cards</p>
                <h3>씬 카드</h3>
              </div>
              <button
                className="secondary-button compact"
                onClick={() => {
                  if (project.bible.sceneCards.length > 0) {
                    setEditingSceneIndex(0);
                    setNotice("첫 번째 씬 카드 편집기를 열었습니다.");
                  } else {
                    handleRefreshBible("씬 카드 생성");
                  }
                }}
                aria-label="첫 씬 카드 편집 시작"
              >
                <FileText size={15} />
                첫 씬 편집
              </button>
            </div>
            <div className="page-grid">
              {project.bible.sceneCards.map((card, index) => (
                <article key={`${card}-${index}`}>
                  <div className="card-head">
                    <strong>Scene {index + 1}</strong>
                    <button
                      className="secondary-button compact"
                      aria-label={`Scene ${index + 1} ${editingSceneIndex === index ? "편집 닫기" : "편집"}`}
                      onClick={() => setEditingSceneIndex((current) => (current === index ? null : index))}
                    >
                      {editingSceneIndex === index ? "닫기" : "편집"}
                    </button>
                  </div>
                  {editingSceneIndex === index ? (
                    <div className="inline-editor">
                      <label>
                        씬 카드
                        <textarea value={card} onChange={(event) => updateSceneCard(index, event.target.value)} />
                      </label>
                    </div>
                  ) : (
                    <span>{card}</span>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="bible-section">
            <div className="section-head">
              <div>
                <p className="eyebrow">Themes</p>
                <h3>테마</h3>
              </div>
            </div>
            <div className="page-grid three">
              {project.bible.themes.map((theme) => (
                <article key={theme}>
                  <strong>Theme</strong>
                  <span>{theme}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="bible-section">
            <div className="section-head">
              <div>
                <p className="eyebrow">Reference + Rights</p>
                <h3>레퍼런스/권리 기준</h3>
              </div>
            </div>
            <div className="page-grid">
              <article>
                <strong>비슷한 작품</strong>
                <span>{project.settings.reference}</span>
              </article>
              <article>
                <strong>권리 기준</strong>
                <span>{project.settings.rightsMode}</span>
              </article>
              <article>
                <strong>상업 사용 체크</strong>
                <span>{rightsCompletion}% 완료 / {rightsState.accepted ? "권리 확인 기록 완료" : "공유 전 확인 필요"}</span>
              </article>
              <article>
                <strong>제작 조건</strong>
                <span>{project.settings.budgetRange} / {project.settings.rating} / {project.settings.audience}</span>
              </article>
            </div>
          </section>
        </section>
      );
    }

    if (activePage === "songs") {
      if (!hasMusicCues) {
        return (
          <section className="page-landing number-page">
            <div className="number-summary-strip">
              <article>
                <span>목표 넘버 수</span>
                <strong>{project.settings.songCount}곡</strong>
              </article>
              <article>
                <span>현재 넘버 수</span>
                <strong>0곡</strong>
              </article>
              <article>
                <span>음악 밀도</span>
                <strong>{project.settings.musicDensity}</strong>
              </article>
              <article>
                <span>남은 음악 크레딧</span>
                <strong>{musicRemaining} cr</strong>
              </article>
            </div>
            <EmptyState
              icon={<Music2 size={24} />}
              eyebrow="Musical Number Architecture"
              message="대본의 감정 전환점이 보이면 넘버 위치를 추천할 수 있습니다."
            >
              <button className="primary-button" onClick={() => void handleSuggestCues("음악 위치 추천")}>
                <Sparkles size={16} />
                음악 위치 추천
              </button>
            </EmptyState>
          </section>
        );
      }

      return (
        <section className="page-landing number-page">
          <div className="page-hero number-hero">
            <div>
              <p className="eyebrow">Musical Number Architecture</p>
              <h2>넘버 구조 타임라인</h2>
              <p>대본의 감정 전환점마다 어떤 극적 기능의 노래가 들어가는지 설계하고, 오른쪽 큐 인스펙터에서 바로 생성합니다.</p>
            </div>
            <div className="page-actions">
              <button className="primary-button" onClick={() => void handleSuggestCues("넘버 맵 다시 만들기")}>
                <Sparkles size={16} />
                넘버 맵 다시 만들기
              </button>
              <button
                className="secondary-button"
                onClick={() => (activeCueData ? handleViewCueInScript(activeCueData) : openPage("workspace"))}
                aria-label={`선택된 넘버 대본 위치 보기${activeCueData ? `: ${activeCueData.title}` : ""}`}
              >
                <FileText size={16} />
                대본 위치 보기
              </button>
            </div>
          </div>

          <div className="number-summary-strip">
            <article>
              <span>목표 넘버 수</span>
              <strong>{project.settings.songCount}곡</strong>
            </article>
            <article>
              <span>현재 넘버 수</span>
              <strong>{project.cues.length}곡</strong>
            </article>
            <article>
              <span>음악 밀도</span>
              <strong>{project.settings.musicDensity}</strong>
            </article>
            <article>
              <span>남은 음악 크레딧</span>
              <strong>{musicRemaining} cr</strong>
            </article>
          </div>

          <div className="number-timeline" aria-label="대본 흐름 기준 넘버 타임라인">
            <div className="timeline-rail" aria-hidden="true" />
            {numberTimeline.map(({ cue, dramaticFunction, progress, beat, sceneAnchor }, index) => (
              <article className={`number-timeline-card ${cue.id === activeCue ? "active" : ""}`} key={cue.id}>
                <div className="timeline-marker">
                  <span>{index + 1}</span>
                </div>
                <div className="number-card-main">
                  <div className="number-card-topline">
                    <div>
                      <p>
                        {cue.act} / {progress}% / {beat}
                      </p>
                      <h3>{cue.title}</h3>
                    </div>
                    <StatusPill status={cue.status} />
                  </div>
                  <div className="function-row">
                    <span className="function-tag">{dramaticFunction}</span>
                    <span>{cue.duration}</span>
                    <span>{cue.style.split(",")[0]}</span>
                  </div>
                  <p className="cue-placement">{cue.placement}</p>
                  <div className="script-anchor">
                    <FileText size={15} />
                    <span>{sceneAnchor}</span>
                  </div>
                  <div className="number-card-actions">
                    <button
                      className="secondary-button compact"
                      onClick={() => handleOpenCue(cue)}
                      aria-label={`큐 인스펙터 열기: ${cue.title}`}
                    >
                      <AudioLines size={15} />
                      큐 열기
                    </button>
                    <button
                      className="secondary-button compact"
                      onClick={() => handleViewCueInScript(cue)}
                      aria-label={`대본 위치 보기: ${cue.title}`}
                    >
                      <FileText size={15} />
                      대본 위치 보기
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      );
    }

    if (activePage === "readingShare") {
      const unresolvedComments = project.comments.filter((comment) => !comment.resolved);
      const latestComments = project.comments.slice(0, 3);
      const readingStatusLabel = readingStatus === "idle" ? "대기" : readingStatus === "generating" ? "생성 중" : "준비됨";
      const rightsReadyLabel = rightsState.accepted ? "권리 확인 기록 완료" : "공유 전 확인 필요";

      if (!hasReadingInputs) {
        return (
          <section className="page-landing reading-share-page">
            <EmptyState
              icon={<Mic2 size={24} />}
              eyebrow="Reading + Review Delivery"
              message="대본과 캐릭터가 준비되면 리딩 패킷과 공유 링크를 만들 수 있습니다."
            >
              <button className="secondary-button" onClick={handleConfirmCharacters}>
                <Users size={16} />
                캐릭터 확인
              </button>
              <button className="primary-button" onClick={() => handleExportAs("reading-packet")}>
                <Download size={16} />
                Reading Packet 생성
              </button>
            </EmptyState>
          </section>
        );
      }

      return (
        <section className="page-landing reading-share-page">
          <div className="page-hero reading-hero">
            <div>
              <p className="eyebrow">Reading + Review Delivery</p>
              <h2>리딩/공유</h2>
              <p>배우 리딩, 모바일 감상 링크, 코멘트, 권리 확인, Export를 한 화면에서 묶어 제작진에게 넘깁니다.</p>
            </div>
          </div>

          <div className="reading-status-strip">
            <article>
              <div className="panel-heading">
                <Mic2 size={17} />
                <strong>리딩 상태</strong>
              </div>
              <b>{readingStatusLabel}</b>
              <span>{readingStatus === "ready" ? "샘플 리딩을 공유할 수 있습니다." : "캐스팅 확인 후 전체 리딩을 생성하세요."}</span>
            </article>
            <article>
              <div className="panel-heading">
                <CircleDollarSign size={17} />
                <strong>리딩 크레딧</strong>
              </div>
              <b>{readingRemaining} cr</b>
              <span>예상 비용 {readingCost} cr / {plan.name} 플랜</span>
            </article>
            <article>
              <div className="panel-heading">
                <ShieldCheck size={17} />
                <strong>권리 체크 상태</strong>
              </div>
              <b>{rightsCompletion}%</b>
              <span>{rightsReadyLabel}</span>
            </article>
          </div>

          <div className="reading-workflow-grid">
            <article className="share-card reading-cast-card">
              <div className="panel-heading">
                <Users size={17} />
                <strong>캐릭터별 음성 캐스팅</strong>
              </div>
              <span>전체 리딩 생성 전 캐릭터별 목소리 톤과 provider voiceId를 확인합니다.</span>
              <div className="cast-grid compact">
                {project.bible.characters.map((character) => (
                  <div className="cast-chip" key={character.name}>
                    <strong>{character.name}</strong>
                    <span>{character.voice}</span>
                    <small>{character.voiceId ?? "voiceId 미지정"}</small>
                  </div>
                ))}
              </div>
              <button className="primary-button" onClick={handleGenerateReading} disabled={readingStatus === "generating"}>
                <Mic2 size={16} />
                {readingStatus === "ready" ? "전체 리딩 다시 생성" : `전체 리딩 생성 -${readingCost}`}
              </button>
            </article>

            <article className="share-card mobile-review-card">
              <div className="panel-heading">
                <Smartphone size={17} />
                <strong>공유 링크 / 모바일 리뷰 링크</strong>
              </div>
              <div className="link-stack">
                <div>
                  <span>공유 링크</span>
                  <p>{shareLink}</p>
                </div>
                <div>
                  <span>모바일 리뷰 링크</span>
                  <p>{mobileReviewLink}</p>
                </div>
              </div>
              <div className="mobile-review-preview">
                <div className="mini-phone">
                  <span>{project.title}</span>
                  <strong>읽기 / 듣기 / 코멘트</strong>
                  <small>모바일은 집필이 아니라 리뷰와 감상 보조에 집중합니다.</small>
                </div>
                <p>휴대폰에서는 대본 수정 UI를 숨기고, 리딩 재생, 넘버 데모 감상, 씬별 코멘트 확인만 제공하는 방향입니다.</p>
              </div>
              <button className="secondary-button" onClick={handleCreateMobileShare}>
                <Link2 size={16} />
                모바일 공유 링크 생성
              </button>
            </article>
          </div>

          <div className="reading-review-grid">
            <article className="share-card">
              <div className="panel-heading">
                <MessageSquareText size={17} />
                <strong>코멘트 요약</strong>
              </div>
              <div className="comment-summary">
                <b>전체 {project.comments.length}개 / 미해결 {unresolvedComments.length}개</b>
                {latestComments.length === 0 ? (
                  <span>아직 공유 코멘트가 없습니다.</span>
                ) : (
                  latestComments.map((comment) => (
                    <button
                      className={comment.resolved ? "resolved" : ""}
                      key={comment.id}
                      onClick={() => toggleComment(comment.id)}
                    >
                      <strong>{comment.target}</strong>
                      <span>{comment.body}</span>
                    </button>
                  ))
                )}
              </div>
              <button className="secondary-button compact" onClick={handleAddComment}>
                <MessageSquareText size={15} />
                리뷰 코멘트 추가
              </button>
            </article>

            <article className="share-card rights-share-card">
              <div className="panel-heading">
                <ShieldAlert size={17} />
                <strong>권리 체크 상태</strong>
              </div>
              <span>
                {rightsCompletion}% 완료 / {rightsState.accepted ? "확인 기록 완료" : "상업 사용 전 확인 필요"}
              </span>
              <div className="rights-checklist compact">
                {(Object.keys(rightsState.checklist) as RightsChecklistKey[]).map((key) => (
                  <button
                    className={rightsState.checklist[key] ? "checked" : ""}
                    key={key}
                    onClick={() => toggleRightsChecklist(key)}
                    aria-label={`리딩/공유 권리 체크: ${rightsLabels[key]}`}
                  >
                    {rightsState.checklist[key] ? <CheckCircle2 size={15} /> : <Ban size={15} />}
                    {rightsLabels[key]}
                  </button>
                ))}
              </div>
              <p>{rightsState.note}</p>
              <button className="secondary-button" onClick={handleAcknowledgeRights}>
                <ShieldCheck size={16} />
                권리 확인 기록
              </button>
            </article>
          </div>

          <section className="export-section">
            <div className="section-head">
              <div>
                <p className="eyebrow">Export</p>
                <h3>내보내기 카드</h3>
              </div>
            </div>
            <div className="export-options reading-export-grid">
              {exportFormats.map((format) => (
                <article key={format}>
                  <strong>{exportFormatLabels[format]}</strong>
                  <span>{exportFormatCopy[format]}</span>
                  <button className="primary-button" onClick={() => handleExportAs(format)}>
                    <Download size={16} />
                    {exportFormatLabels[format]} 생성
                  </button>
                </article>
              ))}
            </div>
          </section>
        </section>
      );
    }

    if (activePage === "export") {
      return (
        <section className="page-landing">
          <div className="page-hero">
            <p className="eyebrow">Export Center</p>
            <h2>내보내기 센터</h2>
            <p>대본, 스토리 바이블, 음악 큐, 사용량 기록을 목적에 맞는 포맷으로 내보냅니다.</p>
          </div>
          <div className="export-options">
            {(["markdown", "fountain", "manifest", "pdf", "kstage", "reading-packet"] as ExportFormat[]).map((format) => (
              <article key={format}>
                <strong>{format === "reading-packet" ? "READING PACKET" : format.toUpperCase()}</strong>
                <span>
                  {
                    {
                      markdown: "작가 공유용 문서",
                      fountain: "스크립트 툴 호환 포맷",
                      manifest: "개발/백업용 JSON 패키지",
                      pdf: "인쇄/리딩용 페이지",
                      kstage: "한국 공연 개발용 패킷",
                      "reading-packet": "배우/연출 리딩용 패킷",
                    }[format]
                  }
                </span>
                <button className="primary-button" onClick={() => handleExportAs(format)}>
                  <Download size={16} />
                  {format === "reading-packet" ? "READING PACKET" : format.toUpperCase()} 생성
                </button>
              </article>
            ))}
          </div>
        </section>
      );
    }

    if (activePage === "billing") {
      return (
        <section className="page-landing">
          <div className="page-hero">
            <p className="eyebrow">Billing</p>
            <h2>결제/크레딧</h2>
            <p>비용이 큰 음악 생성과 전체 리딩은 크레딧 차감 전에 잔액을 확인합니다.</p>
          </div>
          <div className="pricing-grid">
            {(Object.keys(plans) as PlanId[]).map((id) => (
              <article className={planId === id ? "active" : ""} key={id}>
                <strong>{plans[id].name}</strong>
                <b>{plans[id].price}</b>
                <span>음악 {plans[id].musicCredits} cr / 리딩 {plans[id].readingCredits} cr</span>
                <small>{plans[id].features.join(", ")}</small>
                <button className="secondary-button" onClick={() => handleCheckout(id)} aria-label={`${plans[id].name} checkout 세션 생성`}>
                  <CreditCard size={16} />
                  {plans[id].name} checkout
                </button>
              </article>
            ))}
          </div>
          <div className="page-grid three">
            <article>
              <strong>음악 잔액</strong>
              <span>{musicRemaining} credits</span>
            </article>
            <article>
              <strong>리딩 잔액</strong>
              <span>{readingRemaining} credits</span>
            </article>
            <article>
              <strong>Stripe key</strong>
              <span>{plan.stripePriceLookupKey}</span>
            </article>
          </div>
        </section>
      );
    }

    if (activePage === "ops") {
      const rightsLabels: Record<RightsChecklistKey, string> = {
        referenceOnly: "레퍼런스는 구조 분석용으로만 사용",
        providerTerms: "음악/음성 provider 상업 사용 조건 확인",
        commercialPlan: "상업 배포 가능한 유료 플랜 사용",
        noVoiceClone: "실존 배우/가수 음성 무단 복제 금지",
        humanReview: "공개 전 사람이 최종 검수",
      };

      return (
        <section className="page-landing ops-page">
          <div className="page-hero">
            <p className="eyebrow">Commercial Console</p>
            <h2>상용화 콘솔</h2>
            <p>계정, 서버 저장, 결제, 권리, 비용 한도, 팀 협업, provider 작업 상태를 한 곳에서 관리합니다.</p>
            <div className="page-actions">
              <button className="primary-button" onClick={handleSyncWorkspace}>
                <Database size={16} />
                서버 동기화 mock
              </button>
              <button className="secondary-button" onClick={() => handleCreateVersion("상용화 점검 스냅샷")}>
                <History size={16} />
                버전 저장
              </button>
              <button className="secondary-button" onClick={handleAcknowledgeRights}>
                <ShieldCheck size={16} />
                권리 확인 기록
              </button>
            </div>
          </div>

          <div className="ops-summary">
            <article>
              <strong>상용 준비도</strong>
              <b>{readiness.score}%</b>
              <span>{readiness.missing.length ? `남은 항목: ${readiness.missing.join(", ")}` : "상용화 기본 체크 완료"}</span>
            </article>
            <article>
              <strong>월 한도</strong>
              <b>{monthlyCreditRemaining} cr</b>
              <span>
                사용 {totalCreditSpent} / 한도 {costPolicy.monthlyCreditCap}
              </span>
            </article>
            <article>
              <strong>작업 큐</strong>
              <b>{activeJobs.length}</b>
              <span>queued/processing 상태</span>
            </article>
            <article>
              <strong>권리 체크</strong>
              <b>{rightsCompletion}%</b>
              <span>{rightsState.accepted ? `확인 완료 ${rightsState.acceptedAt?.slice(0, 10)}` : "확인 전"}</span>
            </article>
          </div>

          <div className="ops-grid">
            <article className="ops-panel">
              <div className="panel-heading">
                <BriefcaseBusiness size={17} />
                <strong>계정/워크스페이스</strong>
              </div>
              <label>
                워크스페이스
                <input
                  value={workspaceAccount.workspaceName}
                  onChange={(event) => setWorkspaceAccount((current) => ({ ...current, workspaceName: event.target.value }))}
                />
              </label>
              <label>
                오너 이메일
                <input
                  value={workspaceAccount.ownerEmail}
                  onChange={(event) => setWorkspaceAccount((current) => ({ ...current, ownerEmail: event.target.value }))}
                />
              </label>
              <div className="segmented-control compact">
                {(["local-first", "server-sync"] as const).map((mode) => (
                  <button
                    className={workspaceAccount.storageMode === mode ? "active" : ""}
                    key={mode}
                    onClick={() => setWorkspaceAccount((current) => ({ ...current, storageMode: mode }))}
                    aria-label={`운영 화면 저장 방식 선택: ${mode === "local-first" ? "로컬 우선" : "서버 동기화"}`}
                  >
                    {mode === "local-first" ? "로컬 우선" : "서버 동기화"}
                  </button>
                ))}
              </div>
            </article>

            <article className="ops-panel">
              <div className="panel-heading">
                <Users size={17} />
                <strong>팀 협업/권한</strong>
              </div>
              <div className="invite-row">
                <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} aria-label="초대 이메일" />
                <button className="secondary-button compact" onClick={handleInviteMember}>
                  <UserPlus size={15} />
                  초대
                </button>
              </div>
              <div className="team-list">
                {teamMembers.slice(0, 5).map((member) => (
                  <div key={member.id}>
                    <span>{member.email}</span>
                    <strong>
                      {member.role} / {member.status}
                    </strong>
                  </div>
                ))}
              </div>
              <small>{shareLink}</small>
            </article>

            <article className="ops-panel">
              <div className="panel-heading">
                <History size={17} />
                <strong>버전 히스토리</strong>
              </div>
              <div className="version-list">
                {versions.length === 0 && <span>아직 저장된 버전이 없습니다.</span>}
                {versions.slice(0, 4).map((version) => (
                  <button key={version.id} onClick={() => handleRestoreVersion(version.id)}>
                    <strong>{version.label}</strong>
                    <span>
                      {version.projectTitle} / {version.createdAt.slice(0, 10)}
                    </span>
                  </button>
                ))}
              </div>
            </article>

            <article className="ops-panel">
              <div className="panel-heading">
                <ShieldAlert size={17} />
                <strong>권리/상업 사용</strong>
              </div>
              <div className="rights-checklist">
                {(Object.keys(rightsState.checklist) as RightsChecklistKey[]).map((key) => (
                  <button
                    className={rightsState.checklist[key] ? "checked" : ""}
                    key={key}
                    onClick={() => toggleRightsChecklist(key)}
                    aria-label={`운영 화면 권리 체크: ${rightsLabels[key]}`}
                  >
                    {rightsState.checklist[key] ? <CheckCircle2 size={15} /> : <Ban size={15} />}
                    {rightsLabels[key]}
                  </button>
                ))}
              </div>
              <textarea
                value={rightsState.note}
                onChange={(event) => setRightsState((current) => ({ ...current, note: event.target.value }))}
                aria-label="권리 메모"
              />
            </article>

            <article className="ops-panel">
              <div className="panel-heading">
                <Gauge size={17} />
                <strong>비용 한도/남용 방지</strong>
              </div>
              <label>
                월 크레딧 한도
                <input
                  type="number"
                  value={costPolicy.monthlyCreditCap}
                  onChange={(event) => setCostPolicy((current) => ({ ...current, monthlyCreditCap: Number(event.target.value) }))}
                />
              </label>
              <label>
                시간당 요청 제한
                <input
                  type="number"
                  value={costPolicy.rateLimitPerHour}
                  onChange={(event) => setCostPolicy((current) => ({ ...current, rateLimitPerHour: Number(event.target.value) }))}
                />
              </label>
              <button
                className={costPolicy.hardStopEnabled ? "primary-button" : "secondary-button"}
                onClick={() => setCostPolicy((current) => ({ ...current, hardStopEnabled: !current.hardStopEnabled }))}
              >
                <Lock size={16} />
                {costPolicy.hardStopEnabled ? "초과 사용 차단 중" : "초과 사용 허용"}
              </button>
            </article>

            <article className="ops-panel">
              <div className="panel-heading">
                <Sparkles size={17} />
                <strong>온보딩 마법사</strong>
              </div>
              <div className="onboarding-list">
                {onboardingSteps.map((step, index) => (
                  <button
                    className={onboardingState.completedSteps.includes(step) ? "done" : ""}
                    key={step}
                    onClick={() => handleCompleteOnboarding(step, index)}
                  >
                    <span>{index + 1}</span>
                    {step}
                  </button>
                ))}
              </div>
            </article>

            <article className="ops-panel wide">
              <div className="panel-heading">
                <Database size={17} />
                <strong>Provider 작업 상태</strong>
              </div>
              <div className="job-list">
                {providerJobs.length === 0 && <span>음악/리딩 생성 후 작업 큐가 여기에 쌓입니다.</span>}
                {providerJobs.slice(0, 8).map((job) => (
                  <div key={job.id}>
                    <div>
                      <strong>{job.title}</strong>
                      <span>
                        {job.type} / {job.provider} / {job.status}
                      </span>
                    </div>
                    <div className="job-actions">
                      <button className="secondary-button compact" onClick={() => handlePollJob(job.id)} aria-label={`${job.title} provider polling`}>
                        <RefreshCcw size={14} />
                        polling
                      </button>
                      <button className="secondary-button compact" onClick={() => handleRetryJob(job.id)} aria-label={`${job.title} provider retry`}>
                        retry
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      );
    }

    if (activePage === "launch") {
      return (
        <section className="page-landing launch-page">
          <div className="launch-hero">
            <p className="eyebrow">Public Launch Kit</p>
            <h2>뮤지컬 작가를 위한 AI 워크스테이션</h2>
            <p>
              대본, 스토리 바이블, 넘버 위치, 음악 데모, 리딩, 권리 체크를 한 프로젝트 안에서 관리하는 창작 뮤지컬 개발 도구입니다.
            </p>
            <div className="page-actions">
              <button className="primary-button" onClick={() => openPage("workspace")}>
                <Wand2 size={16} />
                바로 체험
              </button>
              <button className="secondary-button" onClick={() => openPage("billing")}>
                <CreditCard size={16} />
                가격 보기
              </button>
            </div>
          </div>
          <div className="launch-sections">
            <article>
              <Globe2 size={20} />
              <strong>포지셔닝</strong>
              <span>AI가 대신 쓰는 서비스가 아니라, 작가가 끝까지 완성하도록 돕는 창작 워크스테이션.</span>
            </article>
            <article>
              <ShieldCheck size={20} />
              <strong>권리 메시지</strong>
              <span>레퍼런스 직접 모방 금지, provider 상업 사용 조건 확인, 인간 최종 검수.</span>
            </article>
            <article>
              <Music2 size={20} />
              <strong>차별화</strong>
              <span>소설/시나리오가 아니라 뮤지컬 넘버 구조와 리딩 비용을 중심으로 설계.</span>
            </article>
          </div>
          <div className="pricing-grid">
            {(Object.keys(plans) as PlanId[]).map((id) => (
              <article key={id}>
                <strong>{plans[id].name}</strong>
                <b>{plans[id].price}</b>
                <span>{plans[id].features.join(", ")}</span>
                <button className="secondary-button" onClick={() => handleCheckout(id)} aria-label={`${plans[id].name} checkout 세션 생성`}>
                  <CreditCard size={16} />
                  {plans[id].name} checkout
                </button>
              </article>
            ))}
          </div>
        </section>
      );
    }

    if (activePage === "mobile") {
      return (
        <section className="page-landing mobile-page">
          <div className="page-hero">
            <p className="eyebrow">Mobile Companion</p>
            <h2>모바일 리뷰/감상 보조</h2>
            <p>노트북 집필을 기본으로 두고, 휴대폰에서는 공유 링크 확인, 음악 데모 감상, 코멘트 확인에 집중합니다.</p>
            <div className="page-actions">
              <button className="primary-button" onClick={handleCreateMobileShare}>
                <Link2 size={16} />
                모바일 공유 링크 생성
              </button>
              <button className="secondary-button" onClick={() => openPage("songs")}>
                <Smartphone size={16} />
                넘버 감상으로 이동
              </button>
            </div>
          </div>
          <div className="mobile-layout">
            <div className="phone-frame">
              <div className="phone-top" />
              <section>
                <p className="eyebrow">Review Link</p>
                <h3>{project.title}</h3>
                <span>{project.bible.logline}</span>
                <button onClick={handlePlayCue}>데모 듣기</button>
                <button onClick={handleAddComment}>코멘트 남기기</button>
              </section>
            </div>
            <div className="page-grid">
              <article>
                <strong>공유 링크</strong>
                <span>{shareLink}</span>
              </article>
              <article>
                <strong>모바일 범위</strong>
                <span>긴 집필은 웹, 짧은 검토/감상/코멘트는 모바일.</span>
              </article>
              <article>
                <strong>다음 개발</strong>
                <span>PWA 설치, 오디오 플레이리스트, 씬별 코멘트 deep link.</span>
              </article>
              <article>
                <strong>접근 권한</strong>
                <span>viewer 초대자는 대본 수정 없이 감상과 코멘트만 가능.</span>
              </article>
            </div>
          </div>
        </section>
      );
    }

    return null;
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

        <button className="new-project-button" onClick={handleCreateProject} aria-label="새 뮤지컬 프로젝트 만들기">
          <Plus size={16} />
          새 뮤지컬
        </button>

        <section className="side-section page-nav">
          <h2>페이지</h2>
          <button className={`project-item ${activePage === "workspace" ? "active" : ""}`} onClick={() => openPage("workspace")}>
            <FileText size={16} />
            <span>작업실</span>
          </button>
          <button className={`project-item ${activePage === "bible" ? "active" : ""}`} onClick={() => openPage("bible")}>
            <BookOpenText size={16} />
            <span>바이블</span>
          </button>
          <button className={`project-item ${activePage === "songs" ? "active" : ""}`} onClick={() => openPage("songs")}>
            <Music2 size={16} />
            <span>넘버</span>
          </button>
          <button
            className={`project-item ${activePage === "readingShare" ? "active" : ""}`}
            onClick={() => openPage("readingShare")}
          >
            <Mic2 size={16} />
            <span>리딩/공유</span>
          </button>
        </section>

        <section className="side-section">
          <h2>프로젝트</h2>
          {projects.map((item, index) => (
            <button
              className={`project-item ${item.id === project.id ? "active" : ""}`}
              key={item.id}
              aria-label={`프로젝트 열기 ${index + 1}: ${item.title}`}
              onClick={() => {
                setActiveProjectId(item.id);
                setActiveCue(item.cues[0]?.id ?? 1);
                setActivePage("workspace");
                setNotice(`${item.title} 프로젝트로 전환했습니다.`);
              }}
            >
              <FileText size={16} />
              <span>{item.title}</span>
            </button>
          ))}
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <p className="eyebrow">{activePageLabel[currentMainPage]} · Quiet Theatre Desk</p>
            <input
              className="title-input"
              value={project.title}
              onChange={(event) => updateProject({ title: event.target.value })}
              aria-label="프로젝트 제목"
            />
          </div>
          <div className="top-actions">
            <button
              className="save-status-button"
              onClick={handleSave}
              title={`저장 상태 · A4 ${generatedPages}쪽 · ${estimatedTokens.toLocaleString()} tokens 예상`}
            >
              <Save size={16} />
              <span>{saveStatusLabel}</span>
            </button>
            <button className="share-top-button" onClick={() => openPage("readingShare")}>
              <Link2 size={16} />
              공유
            </button>
            <button
              className={`share-top-button result-top-button ${isResultDrawerOpen ? "active" : ""}`}
              onClick={() => setIsResultDrawerOpen(true)}
              title={`결과/히스토리 ${actionResults.length}개`}
            >
              <CheckCircle2 size={16} />
              <span>결과/히스토리</span>
              <b>{actionResults.length}</b>
            </button>
            <button
              className={`share-top-button account-settings-button ${isAdminPanelOpen ? "active" : ""}`}
              onClick={() => {
                setAdminTab("account");
                setIsAdminPanelOpen(true);
              }}
              title="계정/설정"
            >
              <Settings2 size={16} />
              계정/설정
            </button>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="composer-panel">
            {activePage === "workspace" ? (
              <>
            <div className="prompt-card prompt-card-quiet">
              <div className="prompt-head">
                <div>
                  <p className="eyebrow">작가 요청 입력</p>
                  <h2>무엇을 쓰고 싶나요?</h2>
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
                placeholder="사라지는 극장, 첫사랑, 가족의 비밀, 한 장면의 감정처럼 지금 떠오른 문장을 적어보세요."
              />
              <div className="prompt-actions">
                <button className="primary-button" onClick={handleGenerateDraft} aria-label="작가 요청 입력으로 대본 초안 생성">
                  <Wand2 size={16} />
                  대본 초안 생성
                </button>
                <button className="secondary-button" onClick={() => void handleSuggestCues()} aria-label="작가 요청 입력으로 음악 위치 크게 보기">
                  <Music2 size={16} />
                  음악 위치 크게 보기
                </button>
              </div>
            </div>

            {!hasScriptDraft ? (
              <EmptyState
                icon={<FileText size={24} />}
                eyebrow="Blank Draft"
                message="한 문장만 적어도 됩니다. 장르와 러닝타임은 오른쪽에서 같이 정리할게요."
              >
                <button className="primary-button" onClick={handleGenerateDraft} aria-label="빈 대본에서 대본 초안 생성">
                  <Wand2 size={16} />
                  대본 초안 생성
                </button>
                <button className="secondary-button" onClick={handleStartWithSample}>
                  <Sparkles size={16} />
                  샘플로 시작
                </button>
              </EmptyState>
            ) : (
              <>
            <div className="script-toolbar" aria-label="대본 도구">
              <ToolbarButton icon={<Bot size={17} />} label="AI 제안" active={project.aiSuggestions.length > 0} onClick={handleRunAiSuggestion} />
              <ToolbarButton icon={<MessageSquareText size={17} />} label="코멘트" active={project.comments.length > 0} onClick={handleAddComment} />
              <ToolbarButton icon={<Timer size={17} />} label="러닝타임 계산" onClick={handleRuntime} />
              <ToolbarButton icon={<Mic2 size={17} />} label="리딩 모드" active={readingMode} onClick={handleToggleReadingMode} />
            </div>

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
                  <button className="secondary-button compact" onClick={() => void handleSuggestCues("음악 위치 다시 추천")}>
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
              </>
            )}
              </>
            ) : (
              renderLandingPage()
            )}
          </section>

          <aside className="control-panel">
            {activePage === "bible" && (
              <section className="bible-inspector-panel">
                <div className="panel-title">
                  <BookOpenText size={18} />
                  <h2>바이블 갱신 조건</h2>
                </div>

                <div className="bible-refresh-card">
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
                    핵심 갈등
                    <input
                      value={project.settings.centralConflict}
                      onChange={(event) => updateSettings({ centralConflict: event.target.value })}
                    />
                  </label>
                  <label>
                    목표 러닝타임
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
                      무대 규모
                      <div className="select-shell">
                        <select value={project.settings.stageScale} onChange={(event) => updateSettings({ stageScale: event.target.value })}>
                          <option>소극장 3~5인극</option>
                          <option>중극장 8~12인 앙상블</option>
                          <option>대극장 상업 뮤지컬</option>
                          <option>학교/동아리 제작</option>
                        </select>
                        <ChevronDown size={16} />
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
                  <label>
                    권리 기준
                    <input value={project.settings.rightsMode} onChange={(event) => updateSettings({ rightsMode: event.target.value })} />
                  </label>
                </div>

                <div className="bible-ai-panel">
                  <div className="panel-heading">
                    <Sparkles size={17} />
                    <strong>캐릭터 AI 제안</strong>
                  </div>
                  <div className="suggestion-list">
                    {bibleCharacterSuggestions.map((suggestion) => (
                      <article key={suggestion.title}>
                        <strong>{suggestion.title}</strong>
                        <span>{suggestion.body}</span>
                      </article>
                    ))}
                  </div>
                  <button className="secondary-button compact" onClick={handleRunAiSuggestion}>
                    <Bot size={15} />
                    AI 제안 갱신
                  </button>
                </div>

                <div className="bible-ai-panel">
                  <div className="panel-heading">
                    <FileText size={17} />
                    <strong>씬별 AI 제안</strong>
                  </div>
                  <div className="suggestion-list">
                    {bibleSceneSuggestions.map((suggestion) => (
                      <article key={suggestion.title}>
                        <strong>{suggestion.title}</strong>
                        <span>{suggestion.body}</span>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {activePage === "readingShare" && (
              <section className="reading-inspector-panel">
                <div className="panel-title">
                  <Mic2 size={18} />
                  <h2>공유 전 점검</h2>
                </div>
                <div className="share-metrics">
                  <div>
                    <strong>리딩</strong>
                    <b>{readingStatus === "idle" ? "대기" : readingStatus === "generating" ? "생성 중" : "준비됨"}</b>
                    <span>잔여 {readingRemaining} cr</span>
                  </div>
                  <div>
                    <strong>권리</strong>
                    <b>{rightsCompletion}%</b>
                    <span>{rightsState.accepted ? "기록 완료" : "확인 필요"}</span>
                  </div>
                </div>
                <div className="prompt-pipeline">
                  <div>
                    <span>Mobile</span>
                    <strong>읽기, 듣기, 코멘트 확인만 제공</strong>
                  </div>
                  <div>
                    <span>Export</span>
                    <strong>{exportFormats.map((format) => exportFormatLabels[format]).join(", ")}</strong>
                  </div>
                  <div>
                    <span>Comments</span>
                    <strong>미해결 {project.comments.filter((comment) => !comment.resolved).length}개</strong>
                  </div>
                </div>
              </section>
            )}

            {activePage !== "bible" && activePage !== "readingShare" && (
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
            </div>
            )}

            {activePage !== "bible" && activePage !== "readingShare" && activeInspector === "settings" && (
              <section className="settings-panel">
                <div className="panel-title">
                  <Settings2 size={18} />
                  <h2>대본 생성 조건</h2>
                </div>

                <div className="step-list horizontal">
                  {settingSteps.map((step, index) => (
                    <button
                      className={`step-row ${activeSettingStep === index ? "active" : ""}`}
                      key={step}
                      onClick={() => setActiveSettingStep(index)}
                    >
                      <span>{index + 1}</span>
                      {step}
                    </button>
                  ))}
                </div>

                {activeSettingStep === 0 && (
                  <div className="wizard-fields">
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
                  </div>
                )}

                {activeSettingStep === 1 && (
                  <div className="wizard-fields">
                    <label>
                      시대
                      <input value={project.settings.era} onChange={(event) => updateSettings({ era: event.target.value })} />
                    </label>
                    <label>
                      주요 공간
                      <input value={project.settings.location} onChange={(event) => updateSettings({ location: event.target.value })} />
                    </label>
                    <label>
                      톤
                      <input value={project.settings.tone} onChange={(event) => updateSettings({ tone: event.target.value })} />
                    </label>
                  </div>
                )}

                {activeSettingStep === 2 && (
                  <div className="wizard-fields">
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
                  </div>
                )}

                {activeSettingStep === 3 && (
                  <div className="wizard-fields">
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
                  </div>
                )}

                {activeSettingStep === 4 && (
                  <div className="wizard-fields">
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
                  </div>
                )}

                {activeSettingStep === 5 && (
                  <div className="wizard-fields">
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
                  </div>
                )}

                <div className="wizard-footer">
                  <button
                    className="secondary-button compact"
                    onClick={() => setActiveSettingStep((current) => Math.max(0, current - 1))}
                    disabled={activeSettingStep === 0}
                  >
                    이전
                  </button>
                  <span>
                    {activeSettingStep + 1} / {settingSteps.length}
                  </span>
                  <button
                    className="secondary-button compact"
                    onClick={() => setActiveSettingStep((current) => Math.min(settingSteps.length - 1, current + 1))}
                    disabled={activeSettingStep === settingSteps.length - 1}
                  >
                    다음
                  </button>
                </div>
              </section>
            )}

            {activePage !== "bible" && activePage !== "readingShare" && activeInspector === "music" && activeCueData && (
              <section className="music-panel">
                <div className="panel-title">
                  <AudioLines size={18} />
                  <h2>{activePage === "songs" ? "큐 인스펙터" : "음악 큐"}</h2>
                </div>

                <div className="cue-spotlight">
                  <div className="cue-number">#{activeCueData.id}</div>
                  <div>
                    <p>{activeCueData.act}</p>
                    <h3>{activeCueData.title}</h3>
                    <StatusPill status={activeCueData.status} />
                  </div>
                </div>

                {activePage !== "songs" && (
                  <div className="cue-list">
                    {project.cues.map((cue) => (
                      <button
                        className={`cue-card ${activeCue === cue.id ? "active" : ""}`}
                        key={cue.id}
                        aria-label={`음악 큐 열기: ${cue.title}`}
                        onClick={() => setActiveCue(cue.id)}
                      >
                        <div>
                          <strong>{cue.title}</strong>
                          <span>{cue.placement}</span>
                        </div>
                        <StatusPill status={cue.status} />
                      </button>
                    ))}
                  </div>
                )}

                <div className={`cue-detail ${activePage === "songs" ? "inspector-detail" : ""}`}>
                  <p>{activeCueData.intent}</p>
                  <div className="style-line">
                    <Music2 size={16} />
                    {activeCueData.style}
                  </div>
                  {activeCueData.rewrittenPrompt && <small>{activeCueData.rewrittenPrompt}</small>}
                  <label>
                    위치
                    <textarea
                      value={activeCueData.placement}
                      onChange={(event) => updateCue(activeCueData.id, { placement: event.target.value })}
                    />
                  </label>
                  <label>
                    의도
                    <textarea
                      value={activeCueData.intent}
                      onChange={(event) => updateCue(activeCueData.id, { intent: event.target.value })}
                    />
                  </label>
                  <label>
                    곡별 가사 프롬프트
                    <textarea
                      value={activeCueData.lyricsPrompt ?? ""}
                      onChange={(event) => updateCue(activeCueData.id, { lyricsPrompt: event.target.value })}
                    />
                  </label>
                  <label>
                    음악 모티프
                    <input
                      value={activeCueData.motif ?? ""}
                      onChange={(event) => updateCue(activeCueData.id, { motif: event.target.value })}
                      placeholder="예: 세탁기 회전 리듬, 새벽 종소리"
                    />
                  </label>
                  <label>
                    금지/네거티브 프롬프트
                    <input
                      value={activeCueData.negativePrompt ?? ""}
                      onChange={(event) => updateCue(activeCueData.id, { negativePrompt: event.target.value })}
                      placeholder="기존 넘버 직접 모방 금지"
                    />
                  </label>
                </div>

                <div className="waveform" aria-label="음악 미리듣기 파형">
                  {Array.from({ length: 34 }).map((_, index) => (
                    <span key={index} style={{ height: `${18 + ((index * 13) % 44)}px` }} />
                  ))}
                </div>

                <div className="music-actions">
                  {activePage === "songs" && (
                    <button
                      className="secondary-button"
                      onClick={() => handleViewCueInScript(activeCueData)}
                      aria-label={`큐 인스펙터에서 대본 위치 보기: ${activeCueData.title}`}
                    >
                      <FileText size={16} />
                      대본 위치 보기
                    </button>
                  )}
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

            {activePage !== "bible" && activePage !== "readingShare" && activeInspector === "voice" && (
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

            {activePage !== "bible" && (
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
            )}

            {activePage !== "bible" && project.comments.length > 0 && (
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

      {isResultDrawerOpen && (
        <div className="drawer-backdrop" role="presentation" onClick={() => setIsResultDrawerOpen(false)}>
          <aside className="side-drawer result-drawer" aria-label="결과/히스토리" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <p className="eyebrow">Result History</p>
                <h2>결과/히스토리</h2>
              </div>
              <button className="icon-button" aria-label="결과 드로어 닫기" title="닫기" onClick={() => setIsResultDrawerOpen(false)}>
                <X size={17} />
              </button>
            </div>

            <div className="result-summary">
              <article>
                <strong>전체 결과</strong>
                <b>{actionResults.length}</b>
                <span>최근 80개까지 보관</span>
              </article>
              <article>
                <strong>마지막 버튼</strong>
                <b>{actionResults[0]?.sourceButton ?? "없음"}</b>
                <span>{actionResults[0]?.createdAt.slice(0, 19).replace("T", " ") ?? "아직 실행 전"}</span>
              </article>
            </div>

            <div className="drawer-actions">
              <button className="secondary-button compact" onClick={() => setActionResults([])} aria-label="결과 드로어 로그 전체 비우기">
                <RefreshCcw size={15} />
                결과 로그 비우기
              </button>
              <button className="secondary-button compact" onClick={() => openPage("workspace")}>
                <FileText size={15} />
                작업실 열기
              </button>
            </div>

            {actionResults.length === 0 ? (
              <div className="result-empty">
                <CheckCircle2 size={20} />
                <strong>아직 기록된 버튼 결과가 없습니다.</strong>
                <span>저장, checkout, 초대, 권리 확인, 음악 생성 같은 버튼을 누르면 이곳에 결과가 쌓입니다.</span>
              </div>
            ) : (
              <div className="result-list">
                {actionResults.map((result) => {
                  const status = getActionResultStatus(result);
                  const resultTimestamp = result.createdAt.slice(0, 19).replace("T", " ");
                  const resultActionLabel = `${result.title} ${resultTimestamp} ${result.id}`;
                  return (
                    <article className={`result-card ${status}`} key={result.id}>
                      <div className="result-card-head">
                        <span>{resultLabels[result.kind]}</span>
                        <small>{resultTimestamp}</small>
                      </div>
                      <div className="result-status-row">
                        <span className={`result-status ${status}`}>
                          {status === "success" ? "완료" : status === "pending" ? "대기" : "실패"}
                        </span>
                        <small>버튼: {result.sourceButton}</small>
                      </div>
                      <h3>{result.title}</h3>
                      <strong>{result.summary}</strong>
                      <p>{result.detail}</p>
                      <div className="result-meta">
                        <span>프로젝트: {result.projectTitle}</span>
                      </div>
                      <div className="result-card-actions">
                        {result.targetPage && (
                          <button
                            className="secondary-button compact"
                            onClick={() => openActionTarget(result.targetPage)}
                            aria-label={`${resultActionLabel} 관련 화면 열기`}
                          >
                            <Link2 size={15} />
                            관련 화면 열기
                          </button>
                        )}
                        {canRetryResult(result) && (
                          <button
                            className="secondary-button compact"
                            onClick={() => handleRetryActionResult(result)}
                            aria-label={`${resultActionLabel} 재시도`}
                          >
                            <RefreshCcw size={15} />
                            retry
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
      )}

      {isAdminPanelOpen && (
        <div className="drawer-backdrop" role="presentation" onClick={() => setIsAdminPanelOpen(false)}>
          <aside className="side-drawer admin-drawer" aria-label="계정/설정/관리" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <p className="eyebrow">Account + Admin</p>
                <h2>계정/설정/관리</h2>
              </div>
              <button className="icon-button" aria-label="관리 패널 닫기" title="닫기" onClick={() => setIsAdminPanelOpen(false)}>
                <X size={17} />
              </button>
            </div>

            <div className="ops-summary compact">
              <article>
                <strong>상용 준비도</strong>
                <b>{readiness.score}%</b>
                <span>{readiness.missing.length ? readiness.missing.join(", ") : "기본 체크 완료"}</span>
              </article>
              <article>
                <strong>월 한도</strong>
                <b>{monthlyCreditRemaining} cr</b>
                <span>
                  사용 {totalCreditSpent} / 한도 {costPolicy.monthlyCreditCap}
                </span>
              </article>
              <article>
                <strong>Provider 작업</strong>
                <b>{activeJobs.length}</b>
                <span>queued/processing</span>
              </article>
            </div>

            <div className="drawer-tabs">
              {(
                [
                  ["account", "계정/워크스페이스", BriefcaseBusiness],
                  ["billing", "결제/크레딧", CreditCard],
                  ["team", "팀/초대", Users],
                  ["rights", "권리/상업 사용", ShieldAlert],
                  ["provider", "Provider 작업", Database],
                  ["cost", "비용 한도", Gauge],
                ] as const
              ).map(([tab, label, Icon]) => (
                <button
                  className={adminTab === tab ? "active" : ""}
                  key={tab}
                  onClick={() => setAdminTab(tab)}
                  aria-label={`설정 탭 열기: ${label}`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>

            {adminTab === "billing" && (
              <section className="admin-section">
                <div className="panel-heading">
                  <CreditCard size={17} />
                  <strong>결제/크레딧</strong>
                </div>
                <div className="pricing-grid drawer-grid">
                  {(Object.keys(plans) as PlanId[]).map((id) => (
                    <article className={planId === id ? "active" : ""} key={id}>
                      <strong>{plans[id].name}</strong>
                      <b>{plans[id].price}</b>
                      <span>음악 {plans[id].musicCredits} cr / 리딩 {plans[id].readingCredits} cr</span>
                      <small>{plans[id].features.join(", ")}</small>
                      <button
                        className="secondary-button compact"
                        onClick={() => handleCheckout(id)}
                        aria-label={`${plans[id].name} checkout 세션 생성`}
                      >
                        <CreditCard size={15} />
                        checkout
                      </button>
                    </article>
                  ))}
                </div>
                <div className="credit-row">
                  <span>음악 잔액</span>
                  <strong>{musicRemaining} / {plan.musicCredits} cr</strong>
                </div>
                <div className="credit-row">
                  <span>리딩 잔액</span>
                  <strong>{readingRemaining} / {plan.readingCredits} cr</strong>
                </div>
                <div className="stripe-note">
                  <Link2 size={15} />
                  {checkoutStatus}
                </div>
                <div className="usage-ledger">
                  {usageLedger.slice(0, 7).map((event) => (
                    <div key={event.id}>
                      <span>{event.label}</span>
                      <strong>{event.amount} cr</strong>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {adminTab === "account" && (
              <section className="admin-section">
                <div className="panel-heading">
                  <BriefcaseBusiness size={17} />
                  <strong>계정/워크스페이스</strong>
                </div>
                <div className="drawer-actions">
                  <button className="secondary-button compact" onClick={handleDuplicateProject}>
                    <Copy size={15} />
                    프로젝트 복사
                  </button>
                  <button className="secondary-button compact" onClick={handleResetProject}>
                    <RefreshCcw size={15} />
                    샘플 상태로 초기화
                  </button>
                </div>
                <label>
                  워크스페이스
                  <input
                    value={workspaceAccount.workspaceName}
                    onChange={(event) => setWorkspaceAccount((current) => ({ ...current, workspaceName: event.target.value }))}
                  />
                </label>
                <label>
                  오너 이메일
                  <input
                    value={workspaceAccount.ownerEmail}
                    onChange={(event) => setWorkspaceAccount((current) => ({ ...current, ownerEmail: event.target.value }))}
                  />
                </label>
                <div className="segmented-control compact">
                  {(["local-first", "server-sync"] as const).map((mode) => (
                    <button
                      className={workspaceAccount.storageMode === mode ? "active" : ""}
                      key={mode}
                      onClick={() => setWorkspaceAccount((current) => ({ ...current, storageMode: mode }))}
                      aria-label={`설정 저장 방식 선택: ${mode === "local-first" ? "로컬 우선" : "서버 동기화"}`}
                    >
                      {mode === "local-first" ? "로컬 우선" : "서버 동기화"}
                    </button>
                  ))}
                </div>
                <div className="drawer-actions">
                  <button className="primary-button" onClick={handleSyncWorkspace}>
                    <Database size={16} />
                    서버 동기화
                  </button>
                  <button className="secondary-button" onClick={() => handleCreateVersion("워크스페이스 스냅샷")}>
                    <History size={16} />
                    버전 저장
                  </button>
                </div>
                <div className="version-list">
                  {versions.length === 0 && <span>아직 저장된 버전이 없습니다.</span>}
                  {versions.slice(0, 5).map((version) => (
                    <button key={version.id} onClick={() => handleRestoreVersion(version.id)}>
                      <strong>{version.label}</strong>
                      <span>
                        {version.projectTitle} / {version.createdAt.slice(0, 10)}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="onboarding-list">
                  {onboardingSteps.map((step, index) => (
                    <button
                      className={onboardingState.completedSteps.includes(step) ? "done" : ""}
                      key={step}
                      onClick={() => handleCompleteOnboarding(step, index)}
                    >
                      <span>{index + 1}</span>
                      {step}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {adminTab === "rights" && (
              <section className="admin-section">
                <div className="panel-heading">
                  <ShieldAlert size={17} />
                  <strong>권리/상업 사용</strong>
                </div>
                <div className="rights-checklist">
                  {(Object.keys(rightsState.checklist) as RightsChecklistKey[]).map((key) => (
                    <button
                      className={rightsState.checklist[key] ? "checked" : ""}
                      key={key}
                      onClick={() => toggleRightsChecklist(key)}
                      aria-label={`설정 권리 체크: ${rightsLabels[key]}`}
                    >
                      {rightsState.checklist[key] ? <CheckCircle2 size={15} /> : <Ban size={15} />}
                      {rightsLabels[key]}
                    </button>
                  ))}
                </div>
                <label>
                  권리 메모
                  <textarea
                    value={rightsState.note}
                    onChange={(event) => setRightsState((current) => ({ ...current, note: event.target.value }))}
                  />
                </label>
                <button className="primary-button" onClick={handleAcknowledgeRights}>
                  <ShieldCheck size={16} />
                  권리 확인 기록
                </button>
              </section>
            )}

            {adminTab === "provider" && (
              <section className="admin-section">
                <div className="panel-heading">
                  <Database size={17} />
                  <strong>Provider 작업</strong>
                </div>
                <div className="job-list">
                  {providerJobs.length === 0 && <span>음악/리딩 생성 후 작업 큐가 여기에 쌓입니다.</span>}
                  {providerJobs.slice(0, 10).map((job) => (
                    <div key={job.id}>
                      <div>
                        <strong>{job.title}</strong>
                        <span>
                          {job.type} / {job.provider} / {job.status}
                        </span>
                      </div>
                      <div className="job-actions">
                        <button
                          className="secondary-button compact"
                          onClick={() => handlePollJob(job.id)}
                          aria-label={`${job.title} provider polling`}
                        >
                          <RefreshCcw size={14} />
                          polling
                        </button>
                        <button
                          className="secondary-button compact"
                          onClick={() => handleRetryJob(job.id)}
                          aria-label={`${job.title} provider retry`}
                        >
                          retry
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {adminTab === "cost" && (
              <section className="admin-section">
                <div className="panel-heading">
                  <Gauge size={17} />
                  <strong>비용 한도</strong>
                </div>
                <div className="share-metrics">
                  <div>
                    <strong>월 잔여 한도</strong>
                    <b>{monthlyCreditRemaining} cr</b>
                    <span>사용 {totalCreditSpent} / 한도 {costPolicy.monthlyCreditCap}</span>
                  </div>
                  <div>
                    <strong>작업당 제한</strong>
                    <b>{costPolicy.perRequestMusicCap} / {costPolicy.perRequestReadingCap}</b>
                    <span>음악 / 리딩 credits</span>
                  </div>
                </div>
                <label>
                  월 크레딧 한도
                  <input
                    type="number"
                    value={costPolicy.monthlyCreditCap}
                    onChange={(event) => setCostPolicy((current) => ({ ...current, monthlyCreditCap: Number(event.target.value) }))}
                  />
                </label>
                <div className="settings-two-col">
                  <label>
                    음악 1회 한도
                    <input
                      type="number"
                      value={costPolicy.perRequestMusicCap}
                      onChange={(event) => setCostPolicy((current) => ({ ...current, perRequestMusicCap: Number(event.target.value) }))}
                    />
                  </label>
                  <label>
                    리딩 1회 한도
                    <input
                      type="number"
                      value={costPolicy.perRequestReadingCap}
                      onChange={(event) => setCostPolicy((current) => ({ ...current, perRequestReadingCap: Number(event.target.value) }))}
                    />
                  </label>
                </div>
                <label>
                  시간당 provider 요청 수
                  <input
                    type="number"
                    value={costPolicy.rateLimitPerHour}
                    onChange={(event) => setCostPolicy((current) => ({ ...current, rateLimitPerHour: Number(event.target.value) }))}
                  />
                </label>
                <div className="segmented-control compact">
                  <button
                    className={costPolicy.hardStopEnabled ? "active" : ""}
                    onClick={() => setCostPolicy((current) => ({ ...current, hardStopEnabled: true }))}
                  >
                    초과 차단
                  </button>
                  <button
                    className={!costPolicy.hardStopEnabled ? "active" : ""}
                    onClick={() => setCostPolicy((current) => ({ ...current, hardStopEnabled: false }))}
                  >
                    경고만
                  </button>
                </div>
                <button
                  className={costPolicy.refundFailedJobs ? "primary-button" : "secondary-button"}
                  onClick={() => setCostPolicy((current) => ({ ...current, refundFailedJobs: !current.refundFailedJobs }))}
                >
                  <CircleDollarSign size={16} />
                  {costPolicy.refundFailedJobs ? "실패 작업 환불 켜짐" : "실패 작업 환불 꺼짐"}
                </button>
              </section>
            )}

            {adminTab === "team" && (
              <section className="admin-section">
                <div className="panel-heading">
                  <Users size={17} />
                  <strong>팀/초대</strong>
                </div>
                <div className="invite-row">
                  <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} aria-label="초대 이메일" />
                  <button className="secondary-button compact" onClick={handleInviteMember}>
                    <UserPlus size={15} />
                    초대
                  </button>
                </div>
                <div className="team-list">
                  {teamMembers.map((member) => (
                    <div key={member.id}>
                      <span>{member.email}</span>
                      <strong>
                        {member.role} / {member.status}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="stripe-note">
                  <Link2 size={15} />
                  {shareLink}
                </div>
              </section>
            )}
          </aside>
        </div>
      )}

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
