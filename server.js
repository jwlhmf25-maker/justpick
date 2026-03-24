require('dotenv').config();

var express = require('express');
var session = require('express-session');
var bcrypt  = require('bcryptjs');
var fs      = require('fs');
var path    = require('path');

var app = express();

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'pickone-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

/* ── 랜덤 닉네임 생성 ── */
var 형용사 = ['즐거운','배고픈','신나는','졸린','용감한','수줍은','엉뚱한','당당한','귀여운','무서운','느긋한','바쁜','행복한','심심한','설레는'];
var 동물   = ['호랑이','사자','토끼','고양이','강아지','펭귄','여우','곰','다람쥐','코알라','늑대','판다','수달','햄스터','고슴도치'];

function 랜덤닉네임() {
  var 형 = 형용사[Math.floor(Math.random() * 형용사.length)];
  var 동 = 동물[Math.floor(Math.random() * 동물.length)];
  return 형 + ' ' + 동;
}

/* 세션에 닉네임 자동 부여 미들웨어 */
app.use(function(req, res, next) {
  if (!req.session.nickname) {
    req.session.nickname = 랜덤닉네임();
  }
  next();
});

/* ── 파일 DB 헬퍼 ── */
var USERS_FILE = path.join(__dirname, 'users.json');
var FEED_FILE  = path.join(__dirname, 'feed.json');

function 파일읽기(filepath, defaultVal) {
  if (!fs.existsSync(filepath)) return defaultVal;
  try { return JSON.parse(fs.readFileSync(filepath, 'utf8')); }
  catch (e) { return defaultVal; }
}

function 파일저장(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

/* ── 인증 미들웨어 (선택적) ── */
function 로그인필요(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: '로그인이 필요합니다.' });
}

/* ── 정적 파일 ── */
app.use('/style.css', express.static(path.join(__dirname, 'style.css')));
app.use('/main.js',   express.static(path.join(__dirname, 'main.js')));

/* ── 페이지 라우트 ── */

app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', function(req, res) {
  if (req.session && req.session.userId) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/share/:id', function(req, res) {
  res.sendFile(path.join(__dirname, 'share.html'));
});

/* ── 인증 API ── */

app.post('/auth/register', function(req, res) {
  var username = (req.body.username || '').trim();
  var password = (req.body.password || '').trim();

  if (!username || !password)  return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요.' });
  if (username.length < 2)     return res.status(400).json({ error: '아이디는 2자 이상이어야 합니다.' });
  if (password.length < 4)     return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });

  var users = 파일읽기(USERS_FILE, []);
  if (users.find(function(u) { return u.username === username; }))
    return res.status(400).json({ error: '이미 사용 중인 아이디입니다.' });

  users.push({ id: Date.now().toString(), username: username, password: bcrypt.hashSync(password, 10) });
  파일저장(USERS_FILE, users);
  res.json({ ok: true });
});

app.post('/auth/login', function(req, res) {
  var username = (req.body.username || '').trim();
  var password = (req.body.password || '').trim();

  var users = 파일읽기(USERS_FILE, []);
  var user  = users.find(function(u) { return u.username === username; });

  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: '아이디 또는 비밀번호가 틀렸습니다.' });

  req.session.userId   = user.id;
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

app.post('/auth/logout', function(req, res) {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/auth/me', function(req, res) {
  if (req.session && req.session.userId)
    return res.json({ username: req.session.username });
  res.status(401).json({ error: '로그인 필요' });
});

/* ── 피드 API ── */

/* 기본 예시 피드 (실제 데이터가 없을 때 보여줌) */
var 예시피드 = [
  {
    id: 'ex1', username: '배고픈 수달',
    optionA: '치킨', optionB: '피자', winner: 'A', label: '치킨',
    reasoning: '오늘 같은 날엔 역시 치킨이죠. 바삭한 튀김옷이 모든 고민을 해결해줄 거예요.',
    createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString()
  },
  {
    id: 'ex2', username: '즐거운 고양이',
    optionA: '넷플릭스', optionB: '유튜브', winner: 'A', label: '넷플릭스',
    reasoning: '오늘은 광고 없이 편하게 보는 날이에요. 좋아하는 시리즈 정주행 가즈아!',
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString()
  },
  {
    id: 'ex3', username: '신나는 펭귄',
    optionA: '헬스장', optionB: '집에서 쉬기', winner: 'B', label: '집에서 쉬기',
    reasoning: '몸이 먼저 알아요. 오늘은 충전하는 날! 내일 두 배로 운동하면 되거든요.',
    createdAt: new Date(Date.now() - 1000 * 60 * 27).toISOString()
  },
  {
    id: 'ex4', username: '수줍은 여우',
    optionA: '아메리카노', optionB: '라떼', winner: 'B', label: '라떼',
    reasoning: '오늘 하루가 좀 피곤해 보이시네요. 부드러운 라떼로 달달하게 시작해봐요.',
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString()
  },
  {
    id: 'ex5', username: '느긋한 곰',
    optionA: '택시', optionB: '버스', winner: 'A', label: '택시',
    reasoning: '시간은 돈이에요. 오늘만큼은 편하게 가도 괜찮아요, 충분히 그럴 자격이 있어요!',
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString()
  }
];

/* 피드 조회 (공개) */
app.get('/api/feed', function(req, res) {
  var feed = 파일읽기(FEED_FILE, []);
  /* 실제 데이터가 있으면 실제 데이터, 없으면 예시로 채움 */
  var result = feed.length > 0 ? feed.slice(0, 30) : 예시피드;
  res.json(result);
});

/* 피드 저장 (로그인 불필요 — 텍스트 모드) */
app.post('/api/feed', function(req, res) {
  var optionA   = (req.body.optionA || '').trim().slice(0, 40);
  var optionB   = (req.body.optionB || '').trim().slice(0, 40);
  var winner    = req.body.winner;
  var label     = (req.body.label || '').slice(0, 40);
  var reasoning = (req.body.reasoning || '').slice(0, 300);

  if (!optionA || !optionB || !winner) return res.status(400).json({ error: '잘못된 데이터입니다.' });

  var feed = 파일읽기(FEED_FILE, []);
  feed.unshift({
    id:        Math.random().toString(36).slice(2, 8),
    username:  (req.session && req.session.username) || req.session.nickname,
    optionA:   optionA,
    optionB:   optionB,
    winner:    winner,
    label:     label,
    reasoning: reasoning,
    createdAt: new Date().toISOString()
  });
  파일저장(FEED_FILE, feed.slice(0, 100));  /* 최대 100개 보관 */
  res.json({ ok: true });
});

/* ── 공유 API ── */
var shares = {};

app.post('/api/share', function(req, res) {
  var id = Math.random().toString(36).slice(2, 8);
  shares[id] = {
    optionA:   (req.body.optionA || '').slice(0, 40),
    optionB:   (req.body.optionB || '').slice(0, 40),
    winner:    req.body.winner || '',
    label:     (req.body.label || '').slice(0, 40),
    reasoning: (req.body.reasoning || '').slice(0, 300),
    mode:      req.body.mode || 'text',
    createdAt: new Date().toISOString()
  };
  res.json({ id: id });
});

app.get('/api/share/:id', function(req, res) {
  var share = shares[req.params.id];
  if (!share) return res.status(404).json({ error: '결과를 찾을 수 없습니다.' });
  res.json(share);
});

/* ── Claude API 프록시 (로그인 필요 — 이미지 모드만) ── */
var API_URL     = 'https://api.anthropic.com/v1/messages';
var API_VERSION = '2023-06-01';

app.post('/api/pick', 로그인필요, function(req, res) {
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: '서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다.' });

  fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': API_VERSION
    },
    body: JSON.stringify({
      model:      req.body.model,
      max_tokens: req.body.max_tokens,
      messages:   req.body.messages
    })
  })
    .then(function(apiRes) {
      return apiRes.json().then(function(data) {
        res.status(apiRes.status).json(data);
      });
    })
    .catch(function(err) {
      res.status(500).json({ error: 'Claude API 호출 실패: ' + err.message });
    });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('픽원 서버 실행 중: http://localhost:' + PORT);
});
