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
  Library,
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
  createWorkspaceVersion,
  defaultCostPolicy,
  defaultOnboardingState,
  defaultRightsState,
  defaultTeamMembers,
  defaultWorkspaceAccount,
  onboardingSteps,
  rightsProgress,
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

const settingSteps = ["기본", "세계", "인물", "구조", "음악", "제작"];

type AppPage = "workspace" | "overview" | "bible" | "songs" | "export" | "billing" | "ops" | "launch" | "mobile";

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
  const [activePage, setActivePage] = useState<AppPage>("workspace");
  const [readingMode, setReadingMode] = useState(false);
  const [workspaceAccount, setWorkspaceAccount] = useState<WorkspaceAccount>(() =>
    loadJson(workspaceStorageKey, defaultWorkspaceAccount),
  );
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => loadJson(teamStorageKey, defaultTeamMembers));
  const [versions, setVersions] = useState<WorkspaceVersion[]>(() => loadJson(versionsStorageKey, []));
  const [providerJobs, setProviderJobs] = useState<ProviderJob[]>(() => loadJson(jobsStorageKey, []));
  const [rightsState, setRightsState] = useState<RightsState>(() => loadJson(rightsStorageKey, defaultRightsState));
  const [costPolicy, setCostPolicy] = useState<CostPolicy>(() => loadJson(costPolicyStorageKey, defaultCostPolicy));
  const [onboardingState, setOnboardingState] = useState(() => loadJson(onboardingStorageKey, defaultOnboardingState));
  const [inviteEmail, setInviteEmail] = useState("director@example.com");
  const [shareLink, setShareLink] = useState("https://sequenzen.github.io/ai-musical-workstation/");
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
    setNotice(`${result.provider}에 ${projects.length}개 프로젝트를 동기화했습니다.`);
  }

  function handleCreateVersion(label = "작업 스냅샷") {
    const version = createWorkspaceVersion(project, workspaceAccount.ownerName, label);
    setVersions((current) => [version, ...current].slice(0, 12));
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
    setNotice(`${version.label} 버전을 복원했습니다.`);
  }

  async function handleCheckout(planToBuy: PlanId) {
    const session = await createCheckoutSession(planToBuy);
    setPlanId(planToBuy);
    setCheckoutStatus(`${session.status === "mock" ? "mock checkout" : "Stripe checkout"}: ${session.sessionId}`);
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
      setNotice("상업 사용 전에 권리 체크리스트를 모두 확인해야 합니다.");
      return;
    }
    const result = await acknowledgeRights({ rights: rightsState, projectTitle: project.title });
    setRightsState((current) => ({
      ...current,
      accepted: true,
      acceptedAt: result.acknowledgedAt,
    }));
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
    setNotice(`${member.email} 초대 링크를 만들었습니다.`);
  }

  function handleCompleteOnboarding(step: string, index: number) {
    setOnboardingState((current) => ({
      completedSteps: current.completedSteps.includes(step)
        ? current.completedSteps
        : [...current.completedSteps, step],
      currentStep: Math.min(onboardingSteps.length - 1, index + 1),
    }));
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
    setNotice("provider 작업을 재시도 대기열로 보냈습니다.");
  }

  function handleCreateProject() {
    const fresh = makeFreshProject();
    setProjects((current) => [fresh, ...current]);
    setActiveProjectId(fresh.id);
    setActiveCue(1);
    setActivePage("overview");
    setActiveInspector("settings");
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
    setActivePage("overview");
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
    setActivePage("overview");
    setActiveInspector("settings");
    setNotice("현재 프로젝트를 기본 샘플 상태로 되돌렸습니다.");
  }

  function handleSave() {
    localStorage.setItem(projectsStorageKey, JSON.stringify(projects));
    setNotice("프로젝트, 조건, 대본, 음악 큐를 브라우저 저장소에 저장했습니다.");
  }

  function handleRefreshBible() {
    const bible = buildProjectBible(project.settings, project.prompt, project.title);
    const cues = generateLocalCues({ ...project, bible });
    updateProject({
      bible,
      cues,
      runtimeReport: buildRuntimeReport({ ...project, bible, cues }),
      aiSuggestions: buildAiSuggestions({ ...project, bible, cues }),
    });
    setActiveCue(cues[0]?.id ?? 1);
    setNotice("현재 조건으로 스토리 바이블, 씬 카드, 넘버 맵을 다시 구성했습니다.");
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
    if (musicGenerationCost > costPolicy.perRequestMusicCap) {
      setNotice(`요청 비용이 1회 음악 한도 ${costPolicy.perRequestMusicCap} credits를 초과합니다.`);
      return;
    }

    if (!(await checkUsageAllowance(musicGenerationCost))) return;

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
      setNotice("음악 생성 중 문제가 생겼습니다. provider 설정을 확인하세요.");
    }
  }

  async function handleGenerateReading() {
    setActiveInspector("voice");
    if (!isStudio) {
      setNotice("전체 리딩은 Studio 플랜에서만 열립니다. 플랜을 Studio로 바꾸면 mock 생성이 가능합니다.");
      return;
    }

    if (readingCost > costPolicy.perRequestReadingCap) {
      setNotice(`요청 비용이 1회 리딩 한도 ${costPolicy.perRequestReadingCap} credits를 초과합니다.`);
      return;
    }

    if (!(await checkUsageAllowance(readingCost))) return;

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
    setActivePage(page);
    if (page === "billing") setActiveInspector("billing");
    if (page === "songs") setActiveInspector("music");
    if (page === "bible" || page === "overview") setActiveInspector("settings");
    if (page === "ops" || page === "launch" || page === "mobile") setActiveInspector("billing");
    setNotice(
      {
        workspace: "작업실로 돌아왔습니다.",
        overview: "기획 보드에서 작품의 핵심 조건과 다음 액션을 확인합니다.",
        bible: "스토리 바이블 전체 페이지를 열었습니다.",
        songs: "넘버 보관함에서 음악 큐와 가사 프롬프트를 관리합니다.",
        export: "내보내기 센터에서 포맷별 산출물을 만들 수 있습니다.",
        billing: "결제/크레딧 페이지에서 플랜과 사용량을 확인합니다.",
        ops: "상용화 콘솔에서 계정, 저장, 권리, 작업 큐를 관리합니다.",
        launch: "공개 런칭 키트에서 소개 페이지와 가격 메시지를 확인합니다.",
        mobile: "모바일 리뷰 화면에서 공유/감상 보조 경험을 확인합니다.",
      }[page],
    );
  }

  function renderLandingPage() {
    if (activePage === "overview") {
      return (
        <section className="page-landing">
          <div className="page-hero">
            <p className="eyebrow">Project Board</p>
            <h2>{project.title}</h2>
            <p>{project.bible.logline}</p>
            <div className="page-actions">
              <button className="primary-button" onClick={handleGenerateDraft}>
                <Wand2 size={16} />
                조건으로 초안 생성
              </button>
              <button className="secondary-button" onClick={() => openPage("bible")}>
                <BookOpenText size={16} />
                바이블 보기
              </button>
              <button className="secondary-button" onClick={() => openPage("workspace")}>
                <FileText size={16} />
                작업실 열기
              </button>
            </div>
          </div>
          <div className="page-grid three">
            <article>
              <strong>핵심 갈등</strong>
              <span>{project.settings.centralConflict}</span>
            </article>
            <article>
              <strong>제작 조건</strong>
              <span>
                {project.settings.stageScale} / {project.settings.budgetRange} / {project.settings.rating}
              </span>
            </article>
            <article>
              <strong>목표 구조</strong>
              <span>
                {project.settings.actStructure}, {project.settings.sceneCount}장, {project.settings.songCount}곡
              </span>
            </article>
          </div>
          <div className="page-grid">
            {project.bible.sceneCards.slice(0, 6).map((card) => (
              <article key={card}>
                <strong>Scene</strong>
                <span>{card}</span>
              </article>
            ))}
          </div>
        </section>
      );
    }

    if (activePage === "bible") {
      return (
        <section className="page-landing">
          <div className="page-hero">
            <p className="eyebrow">Story Bible</p>
            <h2>스토리 바이블</h2>
            <p>{project.bible.synopsis}</p>
            <div className="page-actions">
              <button className="primary-button" onClick={handleRefreshBible}>
                <RefreshCcw size={16} />
                조건으로 바이블 갱신
              </button>
              <button className="secondary-button" onClick={() => openPage("workspace")}>
                <FileText size={16} />
                대본으로 이동
              </button>
            </div>
          </div>
          <div className="character-grid">
            {project.bible.characters.map((character) => (
              <article key={character.name}>
                <strong>{character.name}</strong>
                <span>{character.role}</span>
                <p>욕망: {character.desire}</p>
                <p>비밀: {character.secret}</p>
                <small>{character.voice}</small>
              </article>
            ))}
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
      );
    }

    if (activePage === "songs") {
      return (
        <section className="page-landing">
          <div className="page-hero">
            <p className="eyebrow">Song Vault</p>
            <h2>넘버 보관함</h2>
            <p>{project.settings.songCount}곡 목표. 큐를 선택하면 오른쪽 음악 패널에서 생성/재생할 수 있습니다.</p>
            <div className="page-actions">
              <button className="primary-button" onClick={handleSuggestCues}>
                <Sparkles size={16} />
                넘버 맵 다시 만들기
              </button>
              <button className="secondary-button" onClick={() => openPage("workspace")}>
                <FileText size={16} />
                대본 위치 보기
              </button>
            </div>
          </div>
          <div className="song-vault-grid">
            {project.cues.map((cue) => (
              <article key={cue.id}>
                <div>
                  <strong>{cue.title}</strong>
                  <StatusPill status={cue.status} />
                </div>
                <span>{cue.placement}</span>
                <p>{cue.lyricsPrompt}</p>
                <button
                  className="secondary-button compact"
                  onClick={() => {
                    setActiveCue(cue.id);
                    setActiveInspector("music");
                  }}
                >
                  <AudioLines size={15} />
                  큐 열기
                </button>
              </article>
            ))}
          </div>
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
                <button className="secondary-button" onClick={() => handleCheckout(id)}>
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
                  <button className={rightsState.checklist[key] ? "checked" : ""} key={key} onClick={() => toggleRightsChecklist(key)}>
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
                      <button className="secondary-button compact" onClick={() => handlePollJob(job.id)}>
                        <RefreshCcw size={14} />
                        polling
                      </button>
                      <button className="secondary-button compact" onClick={() => handleRetryJob(job.id)}>
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
                <button className="secondary-button" onClick={() => handleCheckout(id)}>
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
              <button className="primary-button" onClick={() => setShareLink(`${window.location.origin}${window.location.pathname}?project=${project.id}`)}>
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

        <button className="new-project-button" onClick={handleCreateProject}>
          <Plus size={16} />
          새 뮤지컬
        </button>

        <section className="side-section page-nav">
          <h2>페이지</h2>
          <button className={`project-item ${activePage === "workspace" ? "active" : ""}`} onClick={() => openPage("workspace")}>
            <FileText size={16} />
            <span>작업실</span>
          </button>
          <button className={`project-item ${activePage === "overview" ? "active" : ""}`} onClick={() => openPage("overview")}>
            <Library size={16} />
            <span>기획 보드</span>
          </button>
          <button className={`project-item ${activePage === "bible" ? "active" : ""}`} onClick={() => openPage("bible")}>
            <BookOpenText size={16} />
            <span>스토리 바이블</span>
          </button>
          <button className={`project-item ${activePage === "songs" ? "active" : ""}`} onClick={() => openPage("songs")}>
            <Music2 size={16} />
            <span>넘버 보관함</span>
          </button>
          <button className={`project-item ${activePage === "export" ? "active" : ""}`} onClick={() => openPage("export")}>
            <Download size={16} />
            <span>내보내기 센터</span>
          </button>
          <button className={`project-item ${activePage === "billing" ? "active" : ""}`} onClick={() => openPage("billing")}>
            <CreditCard size={16} />
            <span>결제/크레딧</span>
          </button>
          <button className={`project-item ${activePage === "ops" ? "active" : ""}`} onClick={() => openPage("ops")}>
            <ShieldCheck size={16} />
            <span>상용화 콘솔</span>
          </button>
          <button className={`project-item ${activePage === "launch" ? "active" : ""}`} onClick={() => openPage("launch")}>
            <Globe2 size={16} />
            <span>런칭 키트</span>
          </button>
          <button className={`project-item ${activePage === "mobile" ? "active" : ""}`} onClick={() => openPage("mobile")}>
            <Smartphone size={16} />
            <span>모바일 리뷰</span>
          </button>
        </section>

        <section className="side-section">
          <h2>프로젝트</h2>
          {projects.map((item) => (
            <button
              className={`project-item ${item.id === project.id ? "active" : ""}`}
              key={item.id}
              onClick={() => {
                setActiveProjectId(item.id);
                setActiveCue(item.cues[0]?.id ?? 1);
                setActivePage("overview");
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
                <option value="kstage">K-Stage</option>
                <option value="reading-packet">Reading Packet</option>
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
            {activePage === "workspace" ? (
              <>
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
              </>
            ) : (
              renderLandingPage()
            )}
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
              <button
                className={activeInspector === "billing" ? "active" : ""}
                onClick={() => {
                  setActiveInspector("billing");
                  setActivePage("billing");
                }}
              >
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
                <button className="primary-button" onClick={() => handleCheckout(planId)}>
                  <CreditCard size={16} />
                  checkout 세션 만들기
                </button>
                <div className="stripe-note">
                  <Link2 size={15} />
                  {checkoutStatus}
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
