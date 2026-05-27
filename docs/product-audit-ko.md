# StageWrite AI 제품 감사

이 문서는 기획 누락, 노는 버튼, 랜딩 페이지 누락을 확인하기 위한 기준표다. 현재 제품 방향은 `웹 우선 워크스테이션`이고, 모바일은 보조 입력/검토용으로 본다.

## 화면 구조

| 영역 | 역할 | 구현 상태 |
| --- | --- | --- |
| 작업실 | 요청 입력, 대본 편집, 음악 위치 표시, 러닝타임/AI 제안 확인 | 완료 |
| 기획 보드 | 작품 조건, 핵심 갈등, 제작 조건, 씬 카드 요약 | 완료 |
| 스토리 바이블 | 시놉시스, 캐릭터, 구조, 씬 카드 갱신 | 완료 |
| 넘버 보관함 | 음악 큐 목록, 극적 기능, 가사 프롬프트, 큐 선택 | 완료 |
| 내보내기 센터 | Markdown, Fountain, Manifest, PDF 출력 진입 | 완료 |
| 결제/크레딧 | 플랜, 음악/리딩 크레딧, Stripe lookup key | 완료 |

## 버튼 감사

| 버튼 | 기대 동작 | 현재 연결 |
| --- | --- | --- |
| 새 뮤지컬 | 새 프로젝트 생성 후 기획 보드로 이동 | `handleCreateProject` |
| 작업실 | 대본 편집 화면으로 이동 | `openPage("workspace")` |
| 기획 보드 | 프로젝트 기획 랜딩 페이지로 이동 | `openPage("overview")` |
| 스토리 바이블 | 바이블 랜딩 페이지로 이동 | `openPage("bible")` |
| 넘버 보관함 | 넘버 관리 랜딩 페이지로 이동 | `openPage("songs")` |
| 내보내기 센터 | 포맷별 export 랜딩 페이지로 이동 | `openPage("export")` |
| 결제/크레딧 | 결제 랜딩 페이지와 결제 패널 열기 | `openPage("billing")` |
| 프로젝트 항목 | 해당 프로젝트 선택 후 기획 보드로 이동 | 프로젝트 선택 핸들러 |
| 사이드바 접기 | 좌측 프로젝트 패널 접기/펴기 | `setIsSidebarCollapsed` |
| 프로젝트 복사 | 현재 프로젝트 복제 | `handleDuplicateProject` |
| 초기화 | 현재 프로젝트를 샘플 상태로 복구 | `handleResetProject` |
| 저장 | localStorage 저장 | `handleSave` |
| 상단 내보내기 | 선택한 포맷으로 다운로드/인쇄 | `handleExport` |
| 조건으로 초안 생성 | 설정값 기반 바이블과 대본 생성 | `handleGenerateDraft` |
| 바이블 보기 | 스토리 바이블 페이지로 이동 | `openPage("bible")` |
| 작업실 열기/대본으로 이동 | 작업실로 이동 | `openPage("workspace")` |
| 조건으로 바이블 갱신 | 현재 설정으로 캐릭터/구조/넘버 맵 갱신 | `handleRefreshBible` |
| 넘버 맵 다시 만들기 | 음악 큐 재추천 | `handleSuggestCues` |
| 큐 열기 | 오른쪽 음악 패널에서 해당 큐 선택 | 큐 선택 핸들러 |
| Markdown/Fountain/Manifest/PDF 생성 | 포맷별 export 실행 | `handleExportAs` |
| 플랜 선택 | 현재 플랜과 크레딧 기준 변경 | `setPlanId` |
| 대본 초안 생성 | 작업실에서 대본 생성 | `handleGenerateDraft` |
| 음악 위치 크게 보기/다시 추천 | 음악 위치 맵 생성 | `handleSuggestCues` |
| AI 제안 | dramaturg 제안 생성 | `handleRunAiSuggestion` |
| 코멘트 | 검토 코멘트 추가 | `handleAddComment` |
| 러닝타임 계산 | A4 1장 1분 기준 리포트 갱신 | `handleRuntime` |
| 리딩 모드 | 편집기를 읽기 모드로 전환하고 리딩 패널 열기 | `handleToggleReadingMode` |
| 설정/음악/리딩/결제 탭 | 오른쪽 패널 전환 | inspector state |
| 음악 생성 | 프롬프트 재작성 후 mock/provider 음악 생성 | `handleGenerateMusic` |
| 재생 | ready 상태 큐의 mock 오디오 재생 | `handlePlayCue` |
| 전체 리딩 생성 | Studio 플랜에서 mock/provider 리딩 생성 | `handleGenerateReading` |
| 코멘트 항목 | 해결/미해결 토글 | `toggleComment` |
| 모바일 전송 | 대본 생성 | `handleGenerateDraft` |

## 랜딩 페이지 판단

페이지가 필요한 버튼은 좌측 네비게이션과 결제 탭처럼 사용자가 별도 업무 맥락으로 이동한다고 기대하는 버튼이다. 현재 `작업실`, `기획 보드`, `스토리 바이블`, `넘버 보관함`, `내보내기 센터`, `결제/크레딧`은 모두 별도 화면을 가진다.

액션 버튼은 랜딩 페이지가 아니라 현재 문맥에서 즉시 결과를 만들어야 한다. `AI 제안`, `코멘트`, `러닝타임 계산`, `음악 생성`, `재생`, `저장`, `내보내기`는 알림/패널/파일 출력으로 피드백을 준다.

## 남은 제품 범위

현재 공개 배포는 API 키 없이도 전체 흐름을 확인하는 정적 mock 제품이다. 실제 상용화를 위해서는 OpenAI, 음악 생성 provider, 음성 provider, Stripe checkout, 사용자 계정/팀 협업, 서버 저장소, 약관/권리 고지가 필요하다. 다만 프론트 버튼과 화면 흐름은 빈 상태 없이 동작하도록 연결되어 있다.
