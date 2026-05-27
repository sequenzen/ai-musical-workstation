export type CueStatus = "suggested" | "generating" | "ready" | "failed";

export type MusicCue = {
  id: number;
  act: string;
  title: string;
  placement: string;
  intent: string;
  style: string;
  status: CueStatus;
  duration: string;
  lyricsPrompt?: string;
  rewrittenPrompt?: string;
  taskId?: string;
  demoAudioUrl?: string | null;
};

export type Character = {
  name: string;
  role: string;
  voice: string;
  voiceId?: string;
};

export type ProjectSettings = {
  genre: string;
  reference: string;
  lengthMinutes: number;
  stageScale: string;
  characterCount: number;
  musicDensity: string;
  tone: string;
  audience: "상업" | "공모전" | "워크숍";
};

export type ProjectBible = {
  title: string;
  logline: string;
  synopsis: string;
  characters: Character[];
  themes: string[];
  structure: string[];
};

export type ProjectState = {
  title: string;
  prompt: string;
  settings: ProjectSettings;
  bible: ProjectBible;
  script: string;
  cues: MusicCue[];
};

export type PlanId = "free" | "writer" | "composer" | "studio";

export type UsageType = "draft" | "music" | "reading" | "export";

export type UsageEvent = {
  id: string;
  type: UsageType;
  amount: number;
  label: string;
  createdAt: string;
};

export type Plan = {
  id: PlanId;
  name: string;
  price: string;
  musicCredits: number;
  readingCredits: number;
  features: string[];
  stripePriceLookupKey: string;
};

export const plans: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: "0원",
    musicCredits: 0,
    readingCredits: 0,
    features: ["프로젝트 1개", "음악 큐 추천", "짧은 초안"],
    stripePriceLookupKey: "stagewrite_free",
  },
  writer: {
    id: "writer",
    name: "Writer",
    price: "월 29,000원",
    musicCredits: 12,
    readingCredits: 0,
    features: ["긴 초안", "바이블 저장", "문서 내보내기"],
    stripePriceLookupKey: "stagewrite_writer_monthly",
  },
  composer: {
    id: "composer",
    name: "Composer",
    price: "월 79,000원",
    musicCredits: 80,
    readingCredits: 10,
    features: ["음악 데모 생성", "프롬프트 재작성", "크레딧 로그"],
    stripePriceLookupKey: "stagewrite_composer_monthly",
  },
  studio: {
    id: "studio",
    name: "Studio",
    price: "월 149,000원",
    musicCredits: 220,
    readingCredits: 120,
    features: ["팀 협업", "전체 리딩", "상업 프로젝트 관리"],
    stripePriceLookupKey: "stagewrite_studio_monthly",
  },
};

export const musicGenerationCost = 12;

export function estimateReadingCost(script: string) {
  return Math.max(12, Math.ceil(script.length / 850) * 8);
}

export const initialSettings: ProjectSettings = {
  genre: "컨템포러리 뮤지컬",
  reference: "어쩌면 해피엔딩, 렌트, 빨래",
  lengthMinutes: 35,
  stageScale: "소극장 3~5인극",
  characterCount: 3,
  musicDensity: "중간: 6~8곡",
  tone: "따뜻하지만 쓸쓸한 도시 판타지",
  audience: "상업",
};

export const initialCharacters: Character[] = [
  { name: "민서", role: "작사가 지망생", voice: "선명한 알토, 빠른 말맛", voiceId: "minseo-alto" },
  { name: "도윤", role: "세탁소 야간 직원", voice: "부드러운 테너, 긴 호흡", voiceId: "doyoon-tenor" },
  { name: "해린", role: "재개발 조합 실무자", voice: "낮은 메조, 건조한 리듬", voiceId: "haerin-mezzo" },
];

export const initialBible: ProjectBible = {
  title: "새벽의 세탁소",
  logline: "사라질 동네의 24시간 세탁소에서 오래된 카세트를 발견한 작사가 지망생이 잃어버린 목소리들을 노래로 복원한다.",
  synopsis:
    "재개발 구역 끝의 세탁소는 주민들이 맡긴 빨래보다 더 오래된 기억을 품고 있다. 민서는 카세트에 담긴 허밍을 따라가며 동네가 사라지기 전 남겨야 할 마지막 노래를 찾는다.",
  characters: initialCharacters,
  themes: ["사라지는 장소", "기억과 목소리", "창작자의 두려움", "작은 공동체"],
  structure: ["1막: 카세트 발견과 동네의 비밀", "2막: 목소리의 주인과 선택", "피날레: 세탁소의 마지막 새벽"],
};

export const initialScript = `ACT 1, SCENE 1. 새벽의 세탁소

[무대]
낡은 자동 세탁기 네 대가 아직 불이 켜지지 않은 골목을 향해 줄지어 있다. 유리문 너머로 첫차 소리가 멀리 지나간다.

민서
오늘도 내가 제일 먼저 왔네. 세상이 나보다 부지런하면 좀 곤란한데.

도윤
문 열자마자 그런 말 하면 손님이 도망가요.

민서
손님이 아니라 미래가 도망가는 거겠지.

도윤은 웃지 않는다. 민서는 그 침묵을 보고, 이곳에 자신보다 오래 남아 있던 사람의 얼굴을 처음 본다.

민서
혹시 여기서 밤을 샜어요?

도윤
아니요. 여기서 시간을 접었어요.`;

export const draftScript = `ACT 1, SCENE 1. 새벽의 세탁소

[무대]
도시 재개발 구역 끝, 24시간 세탁소. 천장 형광등은 절반만 켜져 있고, 세탁기 안에서 돌아가는 셔츠들이 작은 달처럼 번진다.

민서
오늘도 내가 제일 먼저 왔네. 세상이 나보다 부지런하면 좀 곤란한데.

도윤
문 열자마자 그런 말 하면 손님이 도망가요.

민서
손님이 아니라 미래가 도망가는 거겠지.

도윤
미래가 그렇게 쉽게 도망가면 붙잡기 편하겠네요. 문 앞에서 잡으면 되니까.

[짧은 침묵]
민서는 처음으로 웃는다. 도윤은 계산대 밑에서 오래된 카세트테이프 하나를 꺼낸다.

민서
그건 뭐예요?

도윤
이 동네가 사라지기 전에 남긴 목소리요. 누가 맡겼는지는 몰라요. 그런데 매일 새벽 같은 부분에서 멈춰요.

카세트가 재생된다. 지직거리는 잡음 뒤로 어린아이의 허밍이 들린다. 세탁기 회전음이 같은 박자로 따라붙는다.

민서
노래네요.

도윤
아직은 아니에요. 누군가 끝까지 써주면요.`;

export const initialCues: MusicCue[] = [
  {
    id: 1,
    act: "Act 1",
    title: "Opening: 세탁기 속 작은 달",
    placement: "1막 1장, 카세트 허밍이 들리는 순간",
    intent: "민서가 이 공간을 단순한 세탁소가 아니라 기억 보관소로 인식한다.",
    style: "도시 포크, 6/8, 낮은 피아노와 브러시 드럼",
    lyricsPrompt: "세탁기 회전음과 카세트 잡음에서 시작되는 낮은 허밍. 장소의 비밀을 암시한다.",
    status: "suggested",
    duration: "2:10",
  },
  {
    id: 2,
    act: "Act 1",
    title: "I Want Song: 도망가는 미래",
    placement: "민서가 재개발 통지서를 발견한 직후",
    intent: "주인공의 욕망과 결핍을 명확히 세운다.",
    style: "컨템포러리 뮤지컬 팝, 92 BPM, 점층 코러스",
    lyricsPrompt: "민서가 사라지는 동네와 자기 미래를 겹쳐 보며 처음으로 욕망을 말한다.",
    status: "suggested",
    duration: "3:20",
  },
  {
    id: 3,
    act: "Act 2",
    title: "Eleven O'Clock: 접힌 시간",
    placement: "도윤이 카세트의 주인이 자신임을 고백하는 장면",
    intent: "감정적 진실을 폭발시키고 결말 선택을 준비한다.",
    style: "스트링 중심 발라드, 느린 4/4, 테너 솔로",
    lyricsPrompt: "도윤이 잃어버린 시간과 목소리를 되찾으며 민서에게 마지막 선택을 건넨다.",
    status: "suggested",
    duration: "4:05",
  },
];

export const initialProject: ProjectState = {
  title: "새벽의 세탁소",
  prompt: "글을 써줘. 사라지는 동네의 세탁소에서 오래된 카세트가 발견되는 이야기.",
  settings: initialSettings,
  bible: initialBible,
  script: initialScript,
  cues: initialCues,
};

export function makeUsageEvent(type: UsageType, amount: number, label: string): UsageEvent {
  return {
    id: `${type}-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    type,
    amount,
    label,
    createdAt: new Date().toISOString(),
  };
}
