import {
  initialCharacters,
  type Character,
  type MusicCue,
  type ProjectBible,
  type ProjectSettings,
  type ProjectState,
} from "./domain";

type DraftResult = {
  script: string;
  bible: ProjectBible;
  provider: string;
};

const names = ["민서", "도윤", "해린", "라온", "주원", "이안", "서윤", "태오", "유리", "건우", "나래", "현"];

function pickCharacter(index: number, settings: ProjectSettings): Character {
  if (index < initialCharacters.length) return initialCharacters[index];
  const name = names[index % names.length];
  return {
    name,
    role: index % 2 === 0 ? "동네 주민이자 앙상블 리더" : "주인공의 선택을 흔드는 조력자",
    desire: `${settings.location}에서 자기 몫의 기억을 남기고 싶다`,
    secret: "주인공이 모르는 과거의 단서를 알고 있다",
    voice: index % 2 === 0 ? "밝은 바리톤, 리듬감 있는 대사" : "맑은 소프라노, 긴 선율",
    voiceId: `${name}-mock-voice`,
  };
}

function actLabels(settings: ProjectSettings) {
  if (settings.actStructure === "단막") return ["단막"];
  if (settings.actStructure === "3막") return ["1막", "2막", "3막"];
  return ["1막", "2막"];
}

export function buildProjectBible(settings: ProjectSettings, prompt: string, title = "새 뮤지컬"): ProjectBible {
  const characters = Array.from({ length: settings.characterCount }).map((_, index) => pickCharacter(index, settings));
  const acts = actLabels(settings);
  const sceneCards = Array.from({ length: settings.sceneCount }).map((_, index) => {
    const act = acts[Math.min(acts.length - 1, Math.floor((index / settings.sceneCount) * acts.length))];
    if (index === 0) return `${act} ${index + 1}장: ${settings.location}에서 ${settings.protagonist}의 결핍과 세계 규칙을 보여준다.`;
    if (index === settings.sceneCount - 1) return `${act} ${index + 1}장: ${settings.endingType}로 중심 갈등을 정리한다.`;
    if (index === Math.floor(settings.sceneCount / 2)) return `${act} ${index + 1}장: ${settings.antagonistForce}가 가장 강하게 밀려와 선택을 뒤집는다.`;
    return `${act} ${index + 1}장: ${settings.centralConflict}를 새 정보와 관계 변화로 압박한다.`;
  });

  const songMap = Array.from({ length: settings.songCount }).map((_, index) => {
    const labels = ["Opening", "I Want Song", "Charm Song", "Conflict Duet", "Reprise", "11시 넘버", "Finale"];
    return `${index + 1}. ${labels[index % labels.length]} - ${characters[index % characters.length].name} 중심`;
  });

  return {
    title,
    logline: `${settings.era}, ${settings.location}에서 ${settings.protagonist}가 ${settings.protagonistGoal}를 이루려 하지만 ${settings.antagonistForce}와 맞선다.`,
    premise: `사용자 요청 "${prompt}"를 바탕으로 한 ${settings.genre}. ${settings.rightsMode}.`,
    synopsis: `${settings.protagonist}는 ${settings.location}에서 ${settings.protagonistGoal}. 하지만 ${settings.antagonistForce}가 밀려오면서 ${settings.centralConflict}. 작품은 ${settings.tone}의 결로 진행되고 ${settings.endingType}에 도착한다.`,
    characters,
    themes: ["욕망과 선택", "장소의 기억", "관계의 회복", settings.centralConflict],
    structure: acts.map((act, index) => {
      const phase = index === 0 ? "세계와 욕망을 세운다" : index === acts.length - 1 ? "진실과 선택을 결말로 밀어붙인다" : "관계를 깨뜨리고 재조립한다";
      return `${act}: ${phase}.`;
    }),
    sceneCards,
    songMap,
  };
}

export function generateLocalDraft(settings: ProjectSettings, prompt: string, title = "새 뮤지컬"): DraftResult {
  const bible = buildProjectBible(settings, prompt, title);
  const lead = bible.characters[0];
  const second = bible.characters[1] ?? lead;
  const third = bible.characters[2] ?? second;

  const storyPackage = `작품 개발 카드

제목: ${title}
장르: ${settings.genre}
목표: ${settings.outputMode} / ${settings.lengthMinutes}분 / A4 ${settings.pageTarget}쪽
레퍼런스: ${settings.reference}
무대: ${settings.stageScale}, ${settings.budgetRange}
시대/공간: ${settings.era}, ${settings.location}
관객/등급: ${settings.audience}, ${settings.rating}
권리 기준: ${settings.rightsMode}

로그라인
${bible.logline}

시놉시스
${bible.synopsis}

등장인물
${bible.characters
  .map((character) => `- ${character.name}: ${character.role}. 욕망: ${character.desire}. 비밀: ${character.secret}. 음색: ${character.voice}.`)
  .join("\n")}

씬 구조
${bible.sceneCards.map((card) => `- ${card}`).join("\n")}

넘버 맵
${bible.songMap.map((song) => `- ${song}`).join("\n")}`;

  const script = `${storyPackage}

ACT 1, SCENE 1. ${settings.location}

[무대]
${settings.era}. ${settings.location}. 제작 규모는 ${settings.stageScale}에 맞춰 세트 전환을 최소화한다. 조명은 새벽과 실내 형광등의 온도 차이를 크게 두고, 음악은 ${settings.lyricStyle}로 말하듯 시작한다.

${lead.name}
오늘은 이상하게 모든 소리가 박자를 갖고 있어. 문 닫히는 소리, 발자국, 내가 삼키는 말까지.

${second.name}
박자가 있다는 건 아직 끝나지 않았다는 뜻이죠.

${lead.name}
끝나지 않았다는 말은 가끔 벌처럼 들려요. 계속 써야 한다는 벌.

[${third.name}가 들어온다. 손에는 일정표 혹은 통지서가 들려 있다.]

${third.name}
감상은 나중에 해요. 오늘 안에 결정해야 합니다.

${lead.name}
무엇을요?

${third.name}
남길 건지, 지울 건지. ${settings.location}도, 당신이 붙잡고 있는 그 노래도.

[침묵. 멀리서 리듬이 시작된다. ${settings.danceLevel} 수준의 동선으로 인물들이 서로의 거리를 재며 움직인다.]

${lead.name}
그럼 첫 소절만 들어봐요. 지우기 전에, 지워지는 쪽도 한 번쯤은 자기 이름을 말해야 하니까.

♪ 넘버 1. ${bible.songMap[0]?.replace(/^\d+\.\s*/, "") ?? "Opening"} ♪

${lead.name}
나는 아직 제목이 없는 사람
한 줄로 접힌 새벽을 펴
누가 버린 목소리라도
내 입술에 닿으면 노래가 돼

${second.name}
멈춘 테이프를 다시 감으면
끝난 줄 알던 시간이 와

${third.name}
기록은 가끔 짐이 되고
짐은 결국 누군가의 방을 막아

[세 사람의 리듬이 충돌한다. 노래는 완성되지 않은 채 끊긴다.]

${lead.name}
좋아요. 이제부터 조건이 있어요. 이 이야기는 나 혼자 못 써요.

${second.name}
그럼 같이 씁시다.

${third.name}
기한은 오늘 새벽까지예요.

[장면 끝]`;

  return {
    script,
    bible,
    provider: "client-condition-generator",
  };
}

export function generateLocalCues(project: ProjectState): MusicCue[] {
  const { settings, bible } = project;
  const count = Math.max(3, Math.min(settings.songCount, 12));
  const labels = ["Opening", "I Want Song", "Charm Song", "Conflict Duet", "Reprise", "11시 넘버", "Finale", "Tag"];
  const placements = [
    "첫 장면에서 세계의 리듬이 드러나는 순간",
    `${settings.protagonist}가 "${settings.protagonistGoal}"를 처음 말하는 직후`,
    "관객이 공간과 인물에게 정서적으로 붙어야 하는 중반 초입",
    `${settings.antagonistForce}가 선택지를 좁히는 장면`,
    "1막에서 들린 선율이 반대 의미로 돌아오는 순간",
    "결말 직전, 숨겨진 진실이 말보다 먼저 터지는 순간",
    `${settings.endingType}를 앙상블로 정리하는 마지막 장면`,
    "커튼콜 직전 짧은 후렴 reprise",
  ];

  return Array.from({ length: count }).map((_, index) => {
    const character = bible.characters[index % bible.characters.length];
    const label = labels[index % labels.length];
    return {
      id: index + 1,
      act: actLabels(settings)[Math.min(actLabels(settings).length - 1, Math.floor((index / count) * actLabels(settings).length))],
      title: `${label}: ${character.name}의 ${index === 0 ? "첫 박자" : "선택"}`,
      placement: placements[index % placements.length],
      intent:
        index === 0
          ? "관객에게 작품의 규칙, 리듬, 정서를 한 번에 각인한다."
          : `${character.name}의 욕망과 ${settings.centralConflict}를 음악으로 선명하게 만든다.`,
      style: `${settings.genre}, ${settings.lyricStyle}, ${settings.musicDensity}, ${index % 2 === 0 ? "6/8" : "4/4"}, ${settings.tone}`,
      lyricsPrompt: `${character.name}의 욕망 "${character.desire}"를 ${settings.location}의 이미지로 풀어낸다. ${settings.rightsMode}.`,
      status: "suggested",
      duration: index === count - 1 ? "3:40" : index === 5 ? "4:10" : "2:50",
    };
  });
}

export function buildRuntimeReport(project: ProjectState) {
  const pages = Math.max(1, Math.round(project.script.length / 950));
  const estimatedMinutes = Math.max(1, pages);
  const targetGap = estimatedMinutes - project.settings.lengthMinutes;
  const cueMinutes = project.cues.length * 3;
  return `현재 초안 추정: A4 ${pages}쪽, 약 ${estimatedMinutes}분.
목표: A4 ${project.settings.pageTarget}쪽, ${project.settings.lengthMinutes}분.
차이: ${targetGap === 0 ? "목표와 거의 일치" : targetGap > 0 ? `${targetGap}분 초과 가능` : `${Math.abs(targetGap)}분 부족 가능`}.
음악 큐: ${project.cues.length}곡, 데모 기준 약 ${cueMinutes}분.
권장: 대사 장면 ${Math.max(1, project.settings.sceneCount - project.cues.length)}개와 넘버 ${project.settings.songCount}개를 균형 있게 배치하세요.`;
}

export function buildAiSuggestions(project: ProjectState) {
  return [
    `오프닝 3분 안에 "${project.settings.centralConflict}"가 보이도록 첫 장면의 사건을 더 빨리 배치하세요.`,
    `${project.settings.protagonist}의 I Want Song은 목표 "${project.settings.protagonistGoal}"를 한 문장 후렴으로 반복하게 만들면 좋습니다.`,
    `레퍼런스 "${project.settings.reference}"는 구조 참고로만 두고, ${project.settings.location}의 고유한 소리 이미지를 음악 모티프로 쓰세요.`,
    `${project.settings.endingType}라면 마지막 대사는 설명보다 행동으로 닫는 편이 강합니다.`,
  ];
}
