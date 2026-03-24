# JustPick — 프로젝트 가이드

## 프로젝트 개요
두 가지 선택지 중 하나를 골라주는 결정 도우미 웹앱.

### 핵심 기능
- **텍스트 모드**: 선택지 A/B 입력 + 상황 입력(선택)
  - 상황 없음 → 40개 템플릿 중 랜덤 코멘트 (API 없음)
  - 상황 있음 → Groq AI (`llama-3.3-70b-versatile`) 맥락 기반 추천 (무료 tier)
- **이미지 모드**: 사진 2장 업로드 → Claude Vision AI 추천 (로그인 필요)
- **결과 배너**: `"🎉 A (xxx) 골랐어!"` / `"결정!"` / `"이거야!"` 중 랜덤
- **결과 공유**: 공유 링크 생성 + 카카오톡 공유 (KakaoTalk SDK)
- **커뮤니티 피드**: 다른 사람들의 고민 (1시간 TTL, 기본 5개 + 더보기, 실데이터 없으면 예시 피드 표시)

### 로그인 사용자 전용
- **좌측 사이드바** (모바일 ≤768px: 상단 가로 탭): 3개 패널 전환
  - ✏️ 고민 입력 (`#panel-pick`)
  - 📋 내 히스토리 (`#panel-history`) — 최대 50개, 시간 제한 없음
  - 🔥 다른 사람들의 고민 (`#panel-feed`)
- **헤더**: `{username} 님` + 로그아웃 버튼
- 비로그인: 로그인/회원가입 버튼 + 피드 기본 표시
- 히스토리 비어있을 때: "골라줘! 요청하러 가기" 버튼 → 고민 입력 패널로 이동

### 닉네임
- 비로그인: 세션에 "즐거운 호랑이" 형태 랜덤 닉네임 자동 부여

---

## 배포
- **운영**: Vercel — https://justpick.vercel.app
- **GitHub**: https://github.com/jwlhmf25-maker/justpick
- **로컬**: Docker (`docker compose up --build`) → http://localhost:3000
- Vercel은 `main` 브랜치 push 시 자동 배포

```bash
git add 파일명
git commit -m "커밋 메시지"
git push origin main
# → Vercel 자동 배포
```

---

## 기술 스택
| 영역 | 기술 |
|------|------|
| Frontend | Vanilla HTML / CSS / JavaScript (ES5) |
| Backend | Node.js + Express (`server.js`) |
| 인증 | express-session + bcryptjs |
| Rate Limiting | express-rate-limit |
| DB (운영) | Upstash Redis (Vercel KV 마켓플레이스) |
| DB (로컬) | JSON 파일 (`data/` 폴더) 자동 폴백 |
| AI (이미지 모드) | Anthropic Claude API (`claude-opus-4-5`) — 로그인 필요 |
| AI (텍스트 모드) | Groq API (`llama-3.3-70b-versatile`) — 상황 입력 시만, 로그인 불필요 |
| 폰트 | Syne (로고), Pretendard (본문) |

---

## 파일 구조
```
pickone/
├── index.html         # 메인 페이지 (사이드바 + 3개 패널)
├── login.html         # 로그인 / 회원가입 페이지 (탭 전환, URL ?tab=register 지원)
├── share.html         # 결과 공유 페이지
├── style.css          # 전체 스타일
├── main.js            # 프론트엔드 로직
├── server.js          # Express 서버 (API, 인증, 피드, Redis)
├── og-image.svg       # OG 메타태그용 이미지
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .env               # 로컬용 (git 제외)
└── .env.example
```

---

## 환경변수
```
ANTHROPIC_API_KEY=sk-ant-...       # Claude API (이미지 모드)
GROQ_API_KEY=gsk_...               # Groq API (텍스트 모드 + 상황 있을 때)
SESSION_SECRET=임의의_문자열        # 세션 암호화
KV_REST_API_URL=https://...        # Upstash Redis (Vercel KV)
KV_REST_API_TOKEN=...              # Upstash Redis (Vercel KV)
NODE_ENV=production                # 운영 환경 (쿠키 secure 플래그 활성화)
PORT=3000                          # 선택 (기본값 3000)
```

Vercel에서는 Storage 탭 → KV 연동 시 `KV_REST_API_URL`, `KV_REST_API_TOKEN` 자동 생성.

---

## 주요 API 엔드포인트
| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/feed` | 피드 조회 (1시간 TTL 필터) | 불필요 |
| POST | `/api/feed` | 피드 저장 + 로그인 유저면 히스토리도 저장 | 불필요 |
| GET | `/api/my-history?username=` | 내 히스토리 조회 | 불필요 (username 쿼리 필요) |
| POST | `/api/share` | 공유 링크 생성 (7일 TTL) | 불필요 |
| GET | `/api/share/:id` | 공유 결과 조회 | 불필요 |
| POST | `/api/pick` | Claude Vision AI 이미지 분석 프록시 | **필요** |
| POST | `/api/pick-text` | Groq AI 텍스트 분석 프록시 (상황 있을 때만) | 불필요 |
| POST | `/auth/register` | 회원가입 (rate limit: 15분/5회) | 불필요 |
| POST | `/auth/login` | 로그인 (rate limit: 15분/10회) | 불필요 |
| POST | `/auth/logout` | 로그아웃 | 불필요 |
| GET | `/auth/me` | 현재 로그인 사용자 확인 | 불필요 |

---

## 인증 보안
| 항목 | 내용 |
|------|------|
| 비밀번호 해싱 | bcryptjs 10 rounds |
| 로그인 횟수 제한 | 15분에 10회 초과 시 429 차단 |
| 회원가입 횟수 제한 | 15분에 5회 초과 시 429 차단 |
| 쿠키 | `httpOnly` + `sameSite=strict` + `secure`(운영환경만) |
| 아이디 | 4자 이상, 영문/숫자/언더스코어(_)만 허용 |
| 비밀번호 | 8자 이상 + 숫자 또는 특수문자 1개 이상 필수 |

---

## DB 동작 방식
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` 있으면 → Upstash Redis 사용
- 없으면 → `data/` 폴더 JSON 파일 자동 폴백 (로컬/Docker)

### Redis 키 구조
| 키 | 내용 | TTL |
|----|------|-----|
| `feed` | 전체 피드 배열 (최대 100개) | 없음 (GET 시 1시간 필터링) |
| `users` | 유저 배열 (id, username, password 해시) | 없음 |
| `share:{id}` | 공유 결과 | 7일 |
| `history:{userId}` | 유저별 히스토리 배열 (최대 50개) | 없음 |

### Vercel 서버리스 세션 문제 대응
Vercel에서 express-session의 MemoryStore는 콜드 스타트 시 세션이 유실됨.
- `POST /api/feed`: body에 `username` 포함 → users DB 조회로 userId 확보 후 히스토리 저장
- `GET /api/my-history`: query에 `username` 포함 → users DB 조회로 userId 확보

---

## 코딩 컨벤션
- **ES5 스타일**: `var` 선언, named function (화살표 함수 미사용)
- **한글 함수명/주석**: `피드저장()`, `랜덤닉네임()`, `헤더업데이트()` 등
- **DOM 가시성**: `hidden` CSS 클래스로 토글 (`display: none !important`)
- **텍스트 이스케이프**: XSS 방지를 위해 `텍스트이스케이프()` 함수 사용
- **피드 카드 재사용**: `피드카드HTML()` 함수를 피드/히스토리 모두에서 사용

---

## 주요 프론트엔드 함수 (main.js)
| 함수 | 역할 |
|------|------|
| `헤더업데이트(username)` | 로그인 상태에 따라 헤더 + 사이드바 전환 |
| `메뉴전환(panelId)` | 사이드바 패널 전환 + 활성 메뉴 하이라이트 |
| `피드저장(...)` | POST /api/feed 호출 (body에 username 포함) |
| `피드로드()` | GET /api/feed → 렌더링 |
| `히스토리로드()` | GET /api/my-history?username= → 렌더링 |
| `텍스트랜덤선택(a, b)` | 40개 템플릿 중 랜덤 선택, {W}/{L} 치환 |
| `텍스트AI선택(a, b, ctx)` | POST /api/pick-text → Groq AI 호출 |
| `드라마틱공개(winner, reasoning)` | 결과 애니메이션 + 배너 + 피드 자동 저장 |
| `픽실행('text')` | 상황 없으면 랜덤 템플릿, 상황 있으면 Groq AI → 폴백: 랜덤 템플릿 |

---

## 로컬 개발
```bash
# Docker
docker compose up --build

# 직접 실행 (Node.js 필요)
npm install
npm start
```
