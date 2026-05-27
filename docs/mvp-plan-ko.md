# 뮤지컬 작가용 AI 워크스테이션 기획

## 결론

이 서비스는 `웹 우선`이 맞다. 타깃 사용자인 작사가, 극작가, 창작 뮤지컬 팀은 긴 문서, 레퍼런스, 버전, 넘버 위치, 음원 데모를 동시에 봐야 한다. 모바일 앱은 첫 제품이 아니라 공유 링크, 데모 감상, 코멘트 확인용 보조 제품으로 붙이는 편이 낫다.

초기 포지셔닝은 "뮤지컬을 대신 써주는 AI"가 아니라 "작가가 초안을 끝까지 완성하게 해주는 뮤지컬 전용 워크스테이션"이어야 한다. 작가들은 결과물의 통제권을 원하고, 저작권/창작윤리 이슈에 민감하기 때문이다.

## 시장 판단

- 한국 공연시장은 2025년 티켓 판매액 1조 7,326억 원, 전년 대비 18.8% 증가를 기록했다. 출처: [문화체육관광부](https://www.mcst.go.kr/site/s_notice/press/pressView.jsp?pSeq=22285)
- 2025년 한국 뮤지컬 시장은 상위 10개 작품 판매액이 약 1,783억 원이고, 전체 뮤지컬 시장 내 상위 10개 비중이 35.7%로 상승했다. 이는 대형작 쏠림이 강하지만, 창작자 입장에서는 "작품 개발 효율"에 돈을 낼 이유가 커진 시장이라는 뜻이다. 출처: [예술경영지원센터 2025 공연시장 보고서](https://www.gokams.or.kr/DATA/GO/2025%EB%85%84%20%EA%B3%B5%EC%97%B0%EC%8B%9C%EC%9E%A5%20%ED%8B%B0%EC%BC%93%ED%8C%90%EB%A7%A4%20%ED%98%84%ED%99%A9%20%EB%B6%84%EC%84%9D%20%EB%B3%B4%EA%B3%A0%EC%84%9C.pdf)
- Broadway는 2024-2025 시즌 18.9억 달러 매출, 1,470만 관객을 기록했다. 출처: [The Broadway League](https://www.broadwayleague.com/press/press-releases/broadways-2024-2025-season-wraps-with-147-million-attendances-and-grosses-of-189-billion/)

## 경쟁 서비스에서 배울 점

- Sudowrite의 Story Bible은 세계관, 캐릭터, 줄거리 같은 핵심 정보를 AI가 계속 참조하게 만든다. 우리 서비스도 "뮤지컬 바이블"을 중심에 둬야 한다. 출처: [Sudowrite Story Bible](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/what-is-story-bible/jmWepHcQdJetNrE991fjJC)
- WriterDuet은 실시간 공동작업, 댓글, 히스토리, 대본 소리내어 읽기를 제공한다. 뮤지컬 팀 협업에는 이 흐름이 중요하다. 출처: [WriterDuet](https://www.writerduet.com/features/collaboration/)
- Final Draft와 Celtx는 자동 포맷팅, 스토리 계획, 제작 준비 도구로 신뢰를 만든다. 뮤지컬 특화 제품도 전문 포맷과 내보내기가 없으면 장난감처럼 보인다. 출처: [Final Draft](https://www.finaldraft.com/products/features/), [Celtx](https://www.celtx.com/)

## 핵심 제품

1. AI 채팅 진입: 사용자가 "글을 써줘"라고 말하면 장르, 레퍼런스 작품, 목표 러닝타임, 무대 규모, 등장인물 수, 음악 밀도, 톤을 선택하게 한다.
2. 뮤지컬 바이블: 시놉시스, 캐릭터, 세계관, Act 구조, 씬 목록, 넘버 목록을 한 프로젝트 안에서 유지한다.
3. 대본 편집기: A4 1장 1분 기준으로 분량을 추정하고, 대사/가사/무대지시를 분리한다.
4. 음악 큐 추천: AI가 오프닝, I Want Song, Reprise, 11시 넘버처럼 극적 기능 기준으로 음악 위치를 제안한다.
5. 음악 생성: 내부 하우스 프롬프트와 작가 입력을 OpenAI가 정리한 뒤 Suno 같은 음악 생성 API에 전달한다.
6. 전체 리딩: 유료 플랜에서 캐릭터별 음성을 지정하고 전체 대본을 재생한다. 비용이 크므로 초반에는 짧은 씬 리딩부터 제공한다.

## 비즈니스 모델

- Free: 프로젝트 1개, 짧은 초안, 음악 큐 추천까지만.
- Writer: 월 19,000~29,000원. 긴 초안, 바이블 저장, PDF/Docx export.
- Composer: 월 49,000~79,000원. 음악 데모 생성 크레딧 포함.
- Studio: 월 149,000원 이상. 팀 협업, 버전 관리, 전체 리딩, 상업 프로젝트 관리.

Suno는 약관상 무료/Basic 계층 출력물의 상업 사용 제한이 있고, 유료 구독 생성물에는 상업 사용 권리가 부여되지만 저작권 보호 자체를 보장하지는 않는다고 안내한다. 따라서 사용자에게 생성물 권리와 상업 사용 가능 범위를 명확히 보여줘야 한다. 출처: [Suno Terms](https://suno.com/terms-of-service), [Suno paid rights](https://help.suno.com/en/articles/9601665)

ElevenLabs류 전체 리딩은 비용 관리가 핵심이다. ElevenLabs는 2026년 기준 무료 10k credits, Pro 600k credits, Scale 1.8M credits, Business 6M credits 같은 크레딧 기반 요금을 제공한다. 출처: [ElevenLabs Pricing](https://elevenlabs.io/pricing)

## MVP 개발 프롬프트

아래 프롬프트를 순서대로 Codex에 넣으면 된다. 현재 저장소에는 1단계 UI 프로토타입이 이미 구현되어 있다.

## 현재 실행 현황

- 1~5단계: React/Vite 웹 워크스테이션 UI, 생성 설정, mock 대본 생성, 음악 큐 추천, Web Audio 기반 mock 재생까지 구현.
- 6단계: Express 백엔드 `/api/rewrite-music-prompt` 구현. `OPENAI_API_KEY`가 있으면 OpenAI Responses API로 JSON Schema 출력 요청, 없으면 mock 반환.
- 7단계: `/api/generate-music`와 `server/providers/musicProvider.js` 구현. `MUSIC_PROVIDER_ENDPOINT`가 있으면 외부 음악 provider로 전달, 없으면 mock task 반환.
- 8단계: `/api/generate-reading`와 `server/providers/voiceProvider.js` 구현. Studio 플랜에서만 전체 리딩 생성 버튼이 열리고, 키가 없으면 60초 이하 mock 리딩 반환.
- 9단계: 프로젝트 localStorage 자동 저장, Markdown/Fountain/Manifest 다운로드, PDF 인쇄 내보내기 구현.
- 10단계: Free/Writer/Composer/Studio 플랜 모델, Stripe lookup key, 음악/리딩 크레딧 잔액, 사용 ledger, 생성 전 credit guard 구현.

## 로컬 실행

```bash
npm install
npm run dev
```

프론트엔드는 `http://localhost:5173`, 백엔드는 `http://localhost:8787`에서 실행된다. API 키 없이도 mock 모드로 작동한다.

## API 키 연결

`.env.example`을 기준으로 `.env`를 만들고 값을 채운다. 현재 서버는 Node 기본 환경변수를 읽는다.

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.2
MUSIC_PROVIDER_NAME=suno-compatible
MUSIC_PROVIDER_API_KEY=...
MUSIC_PROVIDER_ENDPOINT=https://your-music-provider.example/generate
VOICE_PROVIDER_NAME=elevenlabs-compatible
VOICE_PROVIDER_API_KEY=...
VOICE_PROVIDER_ENDPOINT=https://your-voice-provider.example/generate
```

OpenAI 쪽은 공식 문서의 Responses API 패턴을 따른다. 새 프로젝트 권장 예시는 `client.responses.create({ model, input })` 형태이고, 구조화 출력은 Responses API에서 `text.format`에 JSON Schema를 넣는 방식이다. 출처: [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses/compact?api-mode=responses), [OpenAI Text Generation](https://platform.openai.com/docs/guides/text?api-mode=responses%5C)

### 1. 웹 MVP 스캐폴드

```text
React, TypeScript, Vite로 뮤지컬 작가용 AI 워크스테이션 MVP를 만들어줘. 첫 화면은 랜딩 페이지가 아니라 작업 화면이어야 해. 왼쪽에는 프로젝트/스토리 바이블, 가운데에는 대본 편집기, 오른쪽에는 생성 설정과 음악 큐 패널을 배치해줘. API 키는 없으니 모든 생성은 mock 상태로 구현해줘.
```

### 2. 생성 설정 플로우

```text
사용자가 "글을 써줘"라고 입력하면 장르, 비슷한 작품, 목표 러닝타임, 무대 규모, 등장인물 수, 음악 밀도, 톤을 고르는 설정 패널을 만들어줘. 설정값은 React state로 관리하고, A4 1장 = 1분 기준의 예상 분량을 표시해줘.
```

### 3. 대본 초안 생성 Mock

```text
"대본 초안 생성" 버튼을 누르면 샘플 뮤지컬 대본이 편집기에 채워지게 해줘. 대본은 ACT/SCENE, 무대지시, 캐릭터명, 대사 형식이 구분되어야 해. 나중에 OpenAI API로 교체하기 쉽도록 generateDraft 함수를 별도로 분리해줘.
```

### 4. 음악 위치 추천

```text
"음악 위치 추천" 버튼을 누르면 오프닝 넘버, I Want Song, 11시 넘버 등 뮤지컬 구조에 맞춘 음악 큐 3~5개를 추천해줘. 각 큐에는 위치, 극적 기능, 장르/템포, 예상 길이, 생성 상태가 있어야 해.
```

### 5. 음악 생성 Mock

```text
각 음악 큐에 "음악 생성" 버튼을 추가해줘. 누르면 상태가 generating으로 바뀌었다가 ready가 되고, ready 상태에서는 재생 버튼이 활성화되게 해줘. 실제 파일은 없어도 Web Audio API나 mock waveform으로 데모 재생감을 만들어줘.
```

### 6. OpenAI 프롬프트 재작성 백엔드

```text
Node/Express 백엔드를 추가해줘. /api/rewrite-music-prompt 엔드포인트를 만들고, 입력으로 projectBible, cue, userPrompt를 받아서 하우스 프롬프트와 합쳐 OpenAI Responses API에 전달할 수 있게 해줘. OPENAI_API_KEY가 없으면 mock JSON을 반환하게 해줘.
```

### 7. 음악 생성 API 어댑터

```text
/api/generate-music 엔드포인트를 추가해줘. rewrite된 prompt, lyrics, style, duration을 받아서 Suno 또는 호환 음악 생성 API에 전달하는 adapter 인터페이스를 만들어줘. 실제 API 키가 없으면 mock taskId와 demoAudioUrl을 반환해줘. API 제공자 교체가 가능하도록 provider 파일을 분리해줘.
```

### 8. 전체 리딩 유료 기능

```text
캐릭터별 음성 캐스팅 UI와 전체 대본 리딩 버튼을 만들어줘. 무료 플랜에서는 잠금 상태로 보이고, Studio 플랜에서만 전체 리딩 생성이 가능하게 해줘. ElevenLabs API는 adapter로 분리하고, 키가 없으면 60초 샘플 리딩 mock만 반환해줘.
```

### 9. 저장/내보내기

```text
프로젝트를 localStorage에 저장하고, 대본을 PDF/Markdown/Fountain 형식으로 내보내는 기능을 추가해줘. 음악 큐와 스토리 바이블도 함께 export manifest에 포함해줘.
```

### 10. 결제/크레딧 설계

```text
Stripe 결제 구조를 붙일 수 있도록 plan, credits, usage ledger 모델을 설계해줘. 음악 생성과 음성 리딩은 비용이 큰 기능이므로 요청 전에 예상 크레딧 차감을 보여주고, 초과 사용을 막는 guard를 추가해줘.
```
