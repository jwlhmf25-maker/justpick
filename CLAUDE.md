# JustPick — 프로젝트 가이드

## 프로젝트 개요
두 가지 선택지 중 하나를 골라주는 웹앱.
- **텍스트 모드**: 두 선택지 입력 → 랜덤 선택 + 재밌는 이유 제공 (API 불필요)
- **이미지 모드**: 사진 2장 업로드 + 날씨/상황 선택 → Claude Vision 추천 (로그인 필요)
- **커뮤니티 피드**: 다른 사람들의 고민을 1시간 동안 공유
- **결과 공유**: 공유 링크 생성
- **선택적 로그인**: 회원가입 없이도 텍스트 모드 사용 가능
- **랜덤 닉네임**: 비로그인 사용자도 "즐거운 호랑이" 같은 닉네임 자동 부여

## 배포
- **운영**: Vercel (https://justpick.vercel.app)
- **로컬**: Docker (`docker compose up --build`) → http://localhost:3000
- **GitHub**: https://github.com/jwlhmf25-maker/justpick
- Vercel은 main 브랜치 push 시 자동 배포

## 기술 스택
- **Frontend**: Vanilla HTML / CSS / JavaScript (ES5, var 선언, 한글 주석)
- **Backend**: Node.js + Express (`server.js`)
- **인증**: express-session + bcryptjs
- **DB**: Upstash Redis (Vercel KV) — 환경변수 `KV_REST_API_URL`, `KV_REST_API_TOKEN`
- **DB 폴백**: JSON 파일 (`data/` 폴더) — 로컬/Docker 환경용
- **AI**: Anthropic Claude API (`ANTHROPIC_API_KEY`) — 이미지 모드만 사용
- **폰트**: Syne (로고), Pretendard (본문/한국어)

## 파일 구조
```
pickone/
├── index.html       # 메인 페이지 (선택 화면 + 피드)
├── login.html       # 로그인 / 회원가입 페이지
├── share.html       # 결과 공유 페이지
├── style.css        # 전체 스타일 (코랄/오렌지 그라디언트 테마)
├── main.js          # 프론트엔드 로직
├── server.js        # Express 서버 (API, 인증, 피드, Redis 연동)
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .env             # 로컬용 (git 제외)
└── .env.example
```

## 환경변수
```
ANTHROPIC_API_KEY=sk-ant-...       # Claude API (이미지 모드)
SESSION_SECRET=임의의_문자열
KV_REST_API_URL=https://...        # Upstash Redis (Vercel KV)
KV_REST_API_TOKEN=...              # Upstash Redis (Vercel KV)
PORT=3000                          # 선택 (기본값 3000)
```

## 코딩 컨벤션
- ES5 스타일 (`var`, named function)
- 주석은 한글
- `hidden` 클래스로 DOM 가시성 토글
- 함수명 한글 가능 (예: `피드저장`, `랜덤닉네임`)

## 주요 API 엔드포인트
| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/feed` | 피드 조회 (1시간 TTL 필터) | 불필요 |
| POST | `/api/feed` | 피드 저장 | 불필요 |
| POST | `/api/share` | 공유 링크 생성 | 불필요 |
| GET | `/api/share/:id` | 공유 결과 조회 | 불필요 |
| POST | `/api/pick` | Claude AI 이미지 분석 프록시 | **필요** |
| POST | `/auth/register` | 회원가입 | 불필요 |
| POST | `/auth/login` | 로그인 | 불필요 |

## DB 동작 방식
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` 있으면 → Upstash Redis 사용
- 없으면 → `data/` 폴더 JSON 파일 폴백 (로컬/Docker)
- Redis 키: `feed`, `users`, `share:{id}`
- 피드는 최대 100개 보관, GET 시 1시간 지난 항목 자동 필터링

## 로컬 개발
```bash
# Docker
docker compose up --build

# 직접 실행 (Node.js 필요)
npm install
npm start
```

## Vercel 배포
```bash
git add -A
git commit -m "커밋 메시지"
git push origin main
# → Vercel 자동 배포
```
