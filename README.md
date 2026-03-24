# 🎯 픽원 (PickOne)

두 가지 선택지 중 하나를 골라주는 웹앱. 텍스트는 랜덤으로, 이미지는 Claude AI가 상황에 맞게 골라줍니다.

## 기능

- **텍스트 모드** — 두 선택지 입력 → 랜덤 선택 + 재밌는 이유 제공
- **이미지 모드** — 사진 2장 업로드 + 날씨/상황 선택 → Claude Vision이 추천 (로그인 필요)
- **커뮤니티 피드** — 다른 사람들의 고민과 결과를 실시간으로 확인
- **결과 공유** — 공유 링크 생성 및 클립보드 복사
- **선택적 로그인** — 회원가입 없이도 텍스트 모드 사용 가능
- **랜덤 닉네임** — 비로그인 사용자도 "즐거운 호랑이" 같은 닉네임 자동 부여

## 기술 스택

- **Frontend** — Vanilla HTML / CSS / JavaScript
- **Backend** — Node.js + Express
- **인증** — express-session + bcryptjs
- **AI** — Anthropic Claude API (이미지 모드)
- **데이터 저장** — JSON 파일 (users.json, feed.json)

## 실행 방법

### 1. 환경 설정

`.env.example`을 복사해서 `.env` 파일 생성:

```
ANTHROPIC_API_KEY=sk-ant-...
SESSION_SECRET=임의의_시크릿_문자열
PORT=3000
```

API 키는 [console.anthropic.com](https://console.anthropic.com) 에서 발급.

### 2. Docker로 실행 (권장)

```bash
docker compose up --build
```

### 3. 로컬 실행

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000` 접속.

## 파일 구조

```
pickone/
├── index.html      # 메인 페이지 (선택 화면 + 피드)
├── login.html      # 로그인 / 회원가입 페이지
├── share.html      # 결과 공유 페이지
├── style.css       # 전체 스타일
├── main.js         # 프론트엔드 로직
├── server.js       # Express 서버 (API, 인증, 피드)
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── .gitignore      # .env, node_modules 제외
```

## API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/` | 메인 페이지 | 불필요 |
| GET | `/login` | 로그인 페이지 | 불필요 |
| POST | `/auth/register` | 회원가입 | 불필요 |
| POST | `/auth/login` | 로그인 | 불필요 |
| POST | `/auth/logout` | 로그아웃 | 불필요 |
| GET | `/auth/me` | 현재 사용자 확인 | 불필요 |
| GET | `/api/feed` | 피드 조회 | 불필요 |
| POST | `/api/feed` | 피드 저장 | 불필요 |
| POST | `/api/share` | 결과 공유 생성 | 불필요 |
| GET | `/api/share/:id` | 공유 결과 조회 | 불필요 |
| POST | `/api/pick` | Claude AI 이미지 분석 | **필요** |
