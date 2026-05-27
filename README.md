# StageWrite AI

뮤지컬 작사가/극작가를 위한 AI 워크스테이션 MVP입니다. 웹 편집기, 스토리 바이블, 음악 큐 추천, 음악 생성 mock 파이프라인, Studio 플랜용 전체 리딩 mock, 크레딧 가드, 내보내기를 포함합니다.

Public MVP: https://sequenzen.github.io/ai-musical-workstation/

## Local

```bash
npm install
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:8787

## Production

```bash
npm ci
npm run build
npm start
```

Production 서버는 `dist/` 정적 앱과 `/api/*` Express 엔드포인트를 같은 포트에서 제공합니다.

## Environment

`.env.example`을 복사해서 `.env`를 만들면 됩니다. API 키가 비어 있으면 mock provider로 동작합니다.

```bash
cp .env.example .env
```

중요 변수:

- `OPENAI_API_KEY`: OpenAI Responses API 키
- `OPENAI_MODEL`: 기본값 `gpt-5.2`
- `MUSIC_PROVIDER_ENDPOINT`: Suno-compatible 또는 다른 음악 생성 provider gateway
- `MUSIC_PROVIDER_API_KEY`: 음악 provider 키
- `VOICE_PROVIDER_ENDPOINT`: ElevenLabs-compatible 또는 다른 음성 생성 provider gateway
- `VOICE_PROVIDER_API_KEY`: 음성 provider 키

## Deploy

현재 저장소는 GitHub Pages에 정적 MVP로 배포되어 있고, Render, Railway, Docker 백엔드 배포 준비도 되어 있습니다. 검증 상태는 `DEPLOYMENT_STATUS.md`에 정리되어 있습니다.

제품 버튼/페이지 감사 기준은 `docs/product-audit-ko.md`에, 최종 기획 점검은 `docs/final-planning-check-ko.md`에 정리되어 있습니다.

### Render

이 저장소를 GitHub에 push한 뒤 Render에서 Blueprint로 `render.yaml`을 선택하면 됩니다.

Build command:

```bash
npm ci && npm run build
```

Start command:

```bash
npm start
```

### Railway

Railway에 저장소를 연결하면 `railway.json`의 build/start command를 사용합니다.

### Docker

```bash
docker build -t stagewrite-ai .
docker run -p 8787:8787 stagewrite-ai
```

브라우저에서 http://localhost:8787 을 열면 production 앱이 실행됩니다.

### GitHub Pages

GitHub Pages는 정적 MVP 공개용입니다. 백엔드 API는 포함하지 않지만, 앱의 client mock fallback으로 대본/음악/리딩 플로우를 체험할 수 있습니다.

현재 GitHub 토큰에 `workflow` scope가 없어 Actions workflow 대신 `gh-pages` 브랜치에 `dist/` 산출물을 직접 push하는 방식으로 배포합니다.

Public URL:

https://sequenzen.github.io/ai-musical-workstation/
