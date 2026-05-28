import type { PlanId, ProjectState } from "./domain";

export type WorkspaceAccount = {
  workspaceId: string;
  workspaceName: string;
  ownerName: string;
  ownerEmail: string;
  role: "owner" | "writer" | "composer" | "producer";
  storageMode: "local-first" | "server-sync";
  region: "kr" | "global";
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "writer" | "composer" | "producer" | "viewer";
  status: "active" | "invited";
};

export type WorkspaceVersion = {
  id: string;
  label: string;
  projectId: string;
  projectTitle: string;
  createdAt: string;
  author: string;
  summary: string;
  snapshot: ProjectState;
};

export type ProviderJob = {
  id: string;
  providerTaskId: string;
  type: "music" | "reading";
  status: "queued" | "processing" | "ready" | "failed";
  title: string;
  projectId: string;
  cueId?: number;
  provider: string;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  cost: number;
};

export type RightsChecklistKey =
  | "referenceOnly"
  | "providerTerms"
  | "commercialPlan"
  | "noVoiceClone"
  | "humanReview";

export type RightsState = {
  accepted: boolean;
  acceptedAt?: string;
  commercialUse: boolean;
  checklist: Record<RightsChecklistKey, boolean>;
  note: string;
};

export type CostPolicy = {
  monthlyCreditCap: number;
  perRequestMusicCap: number;
  perRequestReadingCap: number;
  hardStopEnabled: boolean;
  refundFailedJobs: boolean;
  rateLimitPerHour: number;
};

export type OnboardingState = {
  completedSteps: string[];
  currentStep: number;
};

export type CheckoutSession = {
  sessionId: string;
  planId: PlanId;
  url: string;
  status: "mock" | "created";
};

export type ActionResultKind =
  | "generation"
  | "music"
  | "reading"
  | "export"
  | "billing"
  | "ops"
  | "collaboration"
  | "analysis"
  | "system";

export type ActionResult = {
  id: string;
  kind: ActionResultKind;
  status?: "success" | "pending" | "failed";
  title: string;
  sourceButton: string;
  summary: string;
  detail: string;
  projectId: string;
  projectTitle: string;
  targetPage?: string;
  retryJobId?: string;
  createdAt: string;
};

export const onboardingSteps = [
  "작품 목표 입력",
  "생성 조건 확정",
  "스토리 바이블 확인",
  "음악 위치 추천",
  "권리 체크",
  "공유/내보내기",
];

export const defaultWorkspaceAccount: WorkspaceAccount = {
  workspaceId: "ws-stagewrite-demo",
  workspaceName: "StageWrite Demo Studio",
  ownerName: "뮤지컬 작가",
  ownerEmail: "writer@example.com",
  role: "owner",
  storageMode: "local-first",
  region: "kr",
};

export const defaultTeamMembers: TeamMember[] = [
  {
    id: "member-owner",
    name: "뮤지컬 작가",
    email: "writer@example.com",
    role: "owner",
    status: "active",
  },
  {
    id: "member-composer",
    name: "작곡가 파트너",
    email: "composer@example.com",
    role: "composer",
    status: "invited",
  },
];

export const defaultRightsState: RightsState = {
  accepted: false,
  commercialUse: true,
  checklist: {
    referenceOnly: true,
    providerTerms: false,
    commercialPlan: false,
    noVoiceClone: true,
    humanReview: false,
  },
  note: "레퍼런스 작품은 구조 분석용으로만 사용하고, 멜로디/가사/캐릭터의 직접 모방은 금지합니다.",
};

export const defaultCostPolicy: CostPolicy = {
  monthlyCreditCap: 260,
  perRequestMusicCap: 12,
  perRequestReadingCap: 80,
  hardStopEnabled: true,
  refundFailedJobs: true,
  rateLimitPerHour: 12,
};

export const defaultOnboardingState: OnboardingState = {
  completedSteps: [],
  currentStep: 0,
};

export function createWorkspaceVersion(project: ProjectState, author: string, label = "수동 저장"): WorkspaceVersion {
  return {
    id: `version-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    label,
    projectId: project.id,
    projectTitle: project.title,
    createdAt: new Date().toISOString(),
    author,
    summary: `${project.settings.actStructure}, ${project.settings.sceneCount}장, ${project.cues.length}개 음악 큐`,
    snapshot: project,
  };
}

export function createProviderJob(input: {
  type: ProviderJob["type"];
  title: string;
  projectId: string;
  cueId?: number;
  providerTaskId: string;
  provider: string;
  status: ProviderJob["status"];
  cost: number;
}): ProviderJob {
  const now = new Date().toISOString();
  return {
    id: `job-${input.type}-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    providerTaskId: input.providerTaskId,
    type: input.type,
    status: input.status,
    title: input.title,
    projectId: input.projectId,
    cueId: input.cueId,
    provider: input.provider,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    cost: input.cost,
  };
}

export function rightsProgress(rights: RightsState) {
  const values = Object.values(rights.checklist);
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}

export function commercialReadiness(rights: RightsState, hasServerStorage: boolean, hasCheckout: boolean) {
  const missing = [
    !hasServerStorage ? "서버 저장소" : "",
    !hasCheckout ? "실제 결제 checkout" : "",
    rightsProgress(rights) < 100 ? "권리 체크 완료" : "",
  ].filter(Boolean);

  return {
    score: Math.max(0, 100 - missing.length * 22),
    missing,
  };
}

export function createActionResult(input: Omit<ActionResult, "id" | "createdAt">): ActionResult {
  return {
    ...input,
    id: `result-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    createdAt: new Date().toISOString(),
  };
}
