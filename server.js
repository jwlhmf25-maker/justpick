require('dotenv').config();

var express   = require('express');
var session   = require('express-session');
var rateLimit = require('express-rate-limit');
var bcrypt    = require('bcryptjs');
var fs        = require('fs');
var path      = require('path');

var app = express();
app.set('trust proxy', 1);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'pickone-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  }
}));

var loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false
});

var registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: '회원가입 시도가 너무 많습니다. 15분 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false
});

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

/* ── Redis (Upstash) 초기화 ── */
var redis = null;
var redisUrl   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
var redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (redisUrl && redisToken) {
  var { Redis } = require('@upstash/redis');
  redis = new Redis({ url: redisUrl, token: redisToken });
  console.log('Upstash Redis 연결됨');
}

/* ── 파일 DB 폴백 (로컬/Docker용) ── */
var DATA_DIR;
try {
  var appData = path.join(__dirname, 'data');
  if (!fs.existsSync(appData)) fs.mkdirSync(appData, { recursive: true });
  var testFile = path.join(appData, '.write-test');
  fs.writeFileSync(testFile, 'ok');
  fs.unlinkSync(testFile);
  DATA_DIR = appData;
} catch (e) {
  DATA_DIR = '/tmp';
}

var USERS_FILE = path.join(DATA_DIR, 'users.json');
var FEED_FILE  = path.join(DATA_DIR, 'feed.json');

function 파일읽기(filepath, defaultVal) {
  if (!fs.existsSync(filepath)) return defaultVal;
  try { return JSON.parse(fs.readFileSync(filepath, 'utf8')); }
  catch (e) { return defaultVal; }
}

function 파일저장(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

/* ── 통합 DB 헬퍼 (Redis 우선, 없으면 파일) ── */
async function db읽기(key, filePath, defaultVal) {
  if (redis) {
    var data = await redis.get(key);
    return data !== null && data !== undefined ? data : defaultVal;
  }
  return 파일읽기(filePath, defaultVal);
}

async function db저장(key, filePath, data) {
  if (redis) {
    await redis.set(key, data);
  } else {
    파일저장(filePath, data);
  }
}

/* ── 인증 미들웨어 ── */
function 로그인필요(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: '로그인이 필요합니다.' });
}

/* ── 정적 파일 ── */
app.use('/style.css',    express.static(path.join(__dirname, 'style.css')));
app.use('/main.js',      express.static(path.join(__dirname, 'main.js')));
app.use('/og-image.svg', express.static(path.join(__dirname, 'og-image.svg')));

/* ── 페이지 라우트 ── */

app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', function(req, res) {
  if (req.session && req.session.userId) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/share/:id', async function(req, res) {
  /* 공유 데이터 조회 → OG 메타태그를 동적으로 삽입 */
  try {
    var share;
    if (redis) {
      share = await redis.get('share:' + req.params.id);
    } else {
      var shareFile = path.join(DATA_DIR, 'share-' + req.params.id + '.json');
      share = 파일읽기(shareFile, null);
    }

    var html = fs.readFileSync(path.join(__dirname, 'share.html'), 'utf8');

    if (share) {
      var ogTitle = (share.optionA || 'A') + ' vs ' + (share.optionB || 'B') + ' — JustPick 결과';
      var ogDesc  = share.label + ' 승리! ' + (share.reasoning || '').slice(0, 100);
      var ogTags  =
        '<meta property="og:type" content="website">' +
        '<meta property="og:title" content="' + ogTitle.replace(/"/g, '&quot;') + '">' +
        '<meta property="og:description" content="' + ogDesc.replace(/"/g, '&quot;') + '">' +
        '<meta property="og:url" content="https://justpick.vercel.app/share/' + req.params.id + '">' +
        '<meta property="og:image" content="https://justpick.vercel.app/og-image.svg">' +
        '<meta name="twitter:card" content="summary">';
      html = html.replace('</head>', ogTags + '</head>');
    }

    res.send(html);
  } catch (e) {
    res.sendFile(path.join(__dirname, 'share.html'));
  }
});

/* ── 인증 API ── */

app.post('/auth/register', registerLimiter, async function(req, res) {
  try {
    var username = (req.body.username || '').trim();
    var password = (req.body.password || '').trim();

    if (!username || !password)  return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요.' });
    if (username.length < 4)     return res.status(400).json({ error: '아이디는 4자 이상이어야 합니다.' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: '아이디는 영문, 숫자, 언더스코어(_)만 사용 가능합니다.' });
    if (password.length < 8)     return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
    if (!/[0-9]/.test(password) && !/[^a-zA-Z0-9]/.test(password))
      return res.status(400).json({ error: '비밀번호에 숫자 또는 특수문자를 1개 이상 포함해주세요.' });

    var users = await db읽기('users', USERS_FILE, []);
    if (users.find(function(u) { return u.username === username; }))
      return res.status(400).json({ error: '이미 사용 중인 아이디입니다.' });

    var hashed = bcrypt.hashSync(password, 10);
    users.push({ id: Date.now().toString(), username: username, password: hashed });
    await db저장('users', USERS_FILE, users);
    res.json({ ok: true });
  } catch (e) {
    console.error('회원가입 오류:', e);
    res.status(500).json({ error: '회원가입 처리 중 오류가 발생했습니다: ' + e.message });
  }
});

app.post('/auth/login', loginLimiter, async function(req, res) {
  console.log('로그인 시도 IP:', req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip);
  try {
    var username = (req.body.username || '').trim();
    var password = (req.body.password || '').trim();

    var users = await db읽기('users', USERS_FILE, []);
    var user  = users.find(function(u) { return u.username === username; });

    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: '아이디 또는 비밀번호가 틀렸습니다.' });

    req.session.userId   = user.id;
    req.session.username = user.username;
    res.json({ ok: true, username: user.username });
  } catch (e) {
    console.error('로그인 오류:', e);
    res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다: ' + e.message });
  }
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
    createdAt: new Date(Date.now() - 1000 * 60 * 52).toISOString()
  },
  {
    id: 'ex6', username: '엉뚱한 토끼',
    optionA: '짜장면', optionB: '짬뽕', winner: 'B', label: '짬뽕',
    reasoning: '인생은 짧아요. 얼큰한 국물 한 그릇이 오늘의 정답이에요!',
    createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString()
  },
  {
    id: 'ex7', username: '용감한 늑대',
    optionA: '운동화', optionB: '구두', winner: 'A', label: '운동화',
    reasoning: '편한 발이 행복한 하루를 만들어요. 오늘은 발이 이끄는 대로 가봐요.',
    createdAt: new Date(Date.now() - 1000 * 60 * 33).toISOString()
  },
  {
    id: 'ex8', username: '행복한 판다',
    optionA: '집밥', optionB: '배달음식', winner: 'A', label: '집밥',
    reasoning: '오늘만큼은 내가 나를 챙겨주는 날이에요. 따뜻한 집밥이 최고예요.',
    createdAt: new Date(Date.now() - 1000 * 60 * 7).toISOString()
  },
  {
    id: 'ex9', username: '설레는 코알라',
    optionA: '영화관', optionB: '넷플릭스', winner: 'B', label: '넷플릭스',
    reasoning: '이불 속에서 보는 영화가 제일 달콤하잖아요. 팝콘도 내 마음대로!',
    createdAt: new Date(Date.now() - 1000 * 60 * 41).toISOString()
  },
  {
    id: 'ex10', username: '귀여운 햄스터',
    optionA: '아이스크림', optionB: '케이크', winner: 'A', label: '아이스크림',
    reasoning: '달달한 건 다 좋지만, 오늘 같은 날엔 시원하게 녹아내리는 게 딱이에요.',
    createdAt: new Date(Date.now() - 1000 * 60 * 22).toISOString()
  }
];

/* 피드 조회 (공개) */
app.get('/api/feed', async function(req, res) {
  try {
    var feed = await db읽기('feed', FEED_FILE, []);
    /* 1시간 이내 항목만 필터링 */
    var 한시간전 = Date.now() - 1000 * 60 * 60;
    var filtered = feed.filter(function(item) {
      return new Date(item.createdAt).getTime() > 한시간전;
    });
    res.json(filtered.length > 0 ? filtered : 예시피드);
  } catch (e) {
    res.json(예시피드);
  }
});

/* 피드 저장 */
app.post('/api/feed', async function(req, res) {
  try {
    var optionA   = (req.body.optionA || '').trim().slice(0, 40);
    var optionB   = (req.body.optionB || '').trim().slice(0, 40);
    var winner    = req.body.winner;
    var label     = (req.body.label || '').slice(0, 40);
    var reasoning = (req.body.reasoning || '').slice(0, 300);

    if (!optionA || !optionB || !winner) return res.status(400).json({ error: '잘못된 데이터입니다.' });

    var feed = await db읽기('feed', FEED_FILE, []);
    var newItem = {
      id:        Math.random().toString(36).slice(2, 8),
      username:  (req.session && req.session.username) || req.session.nickname,
      userId:    (req.session && req.session.userId) || null,
      optionA:   optionA,
      optionB:   optionB,
      winner:    winner,
      label:     label,
      reasoning: reasoning,
      createdAt: new Date().toISOString()
    };
    feed.unshift(newItem);
    await db저장('feed', FEED_FILE, feed.slice(0, 100));

    /* 로그인 사용자면 개인 히스토리에도 저장 */
    var histUserId = (req.session && req.session.userId) || null;

    /* 세션이 유실된 경우 (Vercel 서버리스) body의 username으로 userId 조회 */
    if (!histUserId && req.body.username) {
      var users = await db읽기('users', USERS_FILE, []);
      var found = users.find(function(u) { return u.username === req.body.username; });
      if (found) histUserId = found.id;
    }

    if (histUserId) {
      var histKey  = 'history:' + histUserId;
      var histFile = path.join(DATA_DIR, 'history-' + histUserId + '.json');
      var history  = await db읽기(histKey, histFile, []);
      history.unshift(newItem);
      await db저장(histKey, histFile, history.slice(0, 50));
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('피드 저장 오류:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ── 내 히스토리 API ── */

app.get('/api/my-history', async function(req, res) {
  try {
    var userId = (req.session && req.session.userId) || null;

    /* 세션 유실 시 query의 username으로 userId 조회 */
    if (!userId && req.query.username) {
      var users = await db읽기('users', USERS_FILE, []);
      var found = users.find(function(u) { return u.username === req.query.username; });
      if (found) userId = found.id;
    }

    if (!userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    var histKey  = 'history:' + userId;
    var histFile = path.join(DATA_DIR, 'history-' + userId + '.json');
    var history  = await db읽기(histKey, histFile, []);
    res.json(history);
  } catch (e) {
    console.error('히스토리 조회 오류:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ── 공유 API ── */

app.post('/api/share', async function(req, res) {
  try {
    var id = Math.random().toString(36).slice(2, 8);
    var shareData = {
      optionA:   (req.body.optionA || '').slice(0, 40),
      optionB:   (req.body.optionB || '').slice(0, 40),
      winner:    req.body.winner || '',
      label:     (req.body.label || '').slice(0, 40),
      reasoning: (req.body.reasoning || '').slice(0, 300),
      mode:      req.body.mode || 'text',
      createdAt: new Date().toISOString()
    };
    if (redis) {
      /* 공유 링크는 7일 후 자동 만료 */
      await redis.set('share:' + id, shareData, { ex: 60 * 60 * 24 * 7 });
    } else {
      파일저장(path.join(DATA_DIR, 'share-' + id + '.json'), shareData);
    }
    res.json({ id: id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/share/:id', async function(req, res) {
  try {
    var share;
    if (redis) {
      share = await redis.get('share:' + req.params.id);
    } else {
      var shareFile = path.join(DATA_DIR, 'share-' + req.params.id + '.json');
      share = 파일읽기(shareFile, null);
    }
    if (!share) return res.status(404).json({ error: '결과를 찾을 수 없습니다.' });
    res.json(share);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

/* ── 텍스트 모드 AI 픽 — Groq (로그인 불필요, 상황 있을 때만 호출) ── */
app.post('/api/pick-text', async function(req, res) {
  var apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: '서버에 GROQ_API_KEY가 설정되지 않았습니다.' });

  var optionA = (req.body.optionA || '').trim().slice(0, 40);
  var optionB = (req.body.optionB || '').trim().slice(0, 40);
  var context = (req.body.context || '').trim().slice(0, 80);

  if (!optionA || !optionB) return res.status(400).json({ error: '선택지를 입력해주세요.' });

  var prompt =
    '사용자가 두 가지 중 하나를 고르지 못하고 있어. 반드시 하나를 골라서 이유를 알려줘.\n' +
    '선택지 A: ' + optionA + '\n' +
    '선택지 B: ' + optionB + '\n' +
    '상황: ' + context + '\n\n' +
    '아래 형식으로만 한국어로 답해줘:\n' +
    '선택: [A 또는 B]\n' +
    '이유: [상황을 고려한 실질적인 이유, 2문장 이내]';

  try {
    var apiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model:      'llama-3.3-70b-versatile',
        max_tokens: 300,
        messages:   [{ role: 'user', content: prompt }]
      })
    });
    var data = await apiRes.json();
    if (!apiRes.ok) return res.status(apiRes.status).json({ error: data.error && data.error.message || 'Groq API 오류' });
    /* Groq는 OpenAI 형식 → content 추출해서 Anthropic 형식으로 변환 */
    var text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
    res.json({ content: [{ text: text }] });
  } catch (err) {
    res.status(500).json({ error: 'Groq API 호출 실패: ' + err.message });
  }
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('JustPick 서버 실행 중: http://localhost:' + PORT);
});
