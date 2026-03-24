/* ── 상수 ── */
var API_ENDPOINT = '/api/pick';
var MODEL_IMAGE  = 'claude-opus-4-6';

/* ── 전역 상태 ── */
var currentMode  = 'text';
var imageDataA   = null;
var imageDataB   = null;
var imageMimeA   = null;
var imageMimeB   = null;
var isLoading    = false;
var currentUser  = null;  /* 로그인한 경우 username 문자열 */
var 피드전체아이템 = [];
var 피드표시개수   = 5;
var 피드예시모드   = false;

/* ── DOM 참조 변수 ── */
var headerAuth;
var tabText, tabImage;
var textSection, imageSection;
var optionAInput, optionBInput, textContextInput;
var fileA, fileB, previewA, previewB;
var ctxWeather, ctxOccasion;
var textPickBtn, imagePickBtn;
var resultSection;
var cardA, cardB, cardContentA, cardContentB, crownA, crownB;
var suspenseArea, revealArea, winnerBanner, reasoningBox;
var shareBtn, kakaoShareBtn, shareToast, retryBtn;
var errorArea, errorMsg;
var feedList;

/* ── 헤더 인증 UI ── */

function 헤더업데이트(username) {
  if (username) {
    /* 로그인 상태 */
    headerAuth.innerHTML =
      '<span class="header-username">' + 텍스트이스케이프(username) + ' 님</span>' +
      '<button id="logout-btn" class="btn-ghost">로그아웃</button>';
    document.getElementById('logout-btn').addEventListener('click', function() {
      fetch('/auth/logout', { method: 'POST' })
        .then(function() { window.location.reload(); });
    });
  } else {
    /* 비로그인 상태 */
    headerAuth.innerHTML =
      '<a href="/login" class="btn-ghost">로그인</a>' +
      '<a href="/login" class="btn-ghost-solid">회원가입</a>';
  }
}

/* ── 모드 전환 ── */

function 모드전환(mode) {
  /* 이미지 모드는 로그인 필요 */
  if (mode === 'image' && !currentUser) {
    window.location.href = '/login';
    return;
  }

  currentMode = mode;
  tabText.classList.toggle('active', mode === 'text');
  tabImage.classList.toggle('active', mode === 'image');
  textSection.classList.toggle('hidden', mode !== 'text');
  imageSection.classList.toggle('hidden', mode !== 'image');
  결과초기화();
}

/* ── 이미지 처리 ── */

function 파일을Base64로(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload  = function(e) { resolve(e.target.result); };
    reader.onerror = function() { reject(new Error('파일을 읽을 수 없습니다.')); };
    reader.readAsDataURL(file);
  });
}

function base64추출(dataUrl) { return dataUrl.split(',')[1]; }
function mime추출(dataUrl)   { return dataUrl.split(';')[0].split(':')[1]; }

function 이미지축소(dataUrl, maxSize) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var scale  = Math.min(1, maxSize / Math.max(img.width, img.height));
      var canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
}

function 파일선택처리(file, previewImg, uploadCard, slot) {
  if (!file) return;
  파일을Base64로(file)
    .then(function(dataUrl) { return 이미지축소(dataUrl, 1024); })
    .then(function(resizedUrl) {
      previewImg.src = resizedUrl;
      previewImg.classList.remove('hidden');
      uploadCard.style.borderStyle = 'solid';
      uploadCard.style.borderColor = 'rgba(255,255,255,0.7)';
      if (slot === 'A') { imageDataA = resizedUrl; imageMimeA = mime추출(resizedUrl); }
      else              { imageDataB = resizedUrl; imageMimeB = mime추출(resizedUrl); }
    })
    .catch(function(err) { 오류표시('이미지 처리 오류: ' + err.message); });
}

/* ── 동물 이모지 매핑 ── */
var 동물이모지 = {
  '호랑이': '🐯', '사자': '🦁', '토끼': '🐰', '고양이': '🐱',
  '강아지': '🐶', '펭귄': '🐧', '여우': '🦊', '곰': '🐻',
  '다람쥐': '🐿️', '코알라': '🐨', '늑대': '🐺', '판다': '🐼',
  '수달': '🦦', '햄스터': '🐹', '고슴도치': '🦔'
};

function 닉네임이모지(username) {
  var 동물 = (username || '').split(' ').pop();
  return 동물이모지[동물] || '👤';
}

/* ── 텍스트 XSS 방지 ── */
function 텍스트이스케이프(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── 텍스트 모드 랜덤 선택 ── */
/* {W} = 승자, {L} = 패자 — 선택지 이름이 자동 삽입됨 */
var 이유템플릿 = [
  '{W}, 오늘은 이게 정답이에요. {L}은(는) 다음에 만나요!',
  '솔직히 {L}도 괜찮지만, {W}이(가) 살짝 더 끌리는 날이에요.',
  '{W}을(를) 선택하면 오늘 하루가 달라질 거예요. 믿어보세요!',
  '고민이 길어지면 결국 {W}을(를) 선택하게 되어 있어요.',
  '{W}을(를) 고르는 순간, 이미 절반은 행복해진 거예요.',
  '{L} 대신 {W}? 현명한 선택이에요. 나중에 고마워할 거예요.',
  '우주의 기운이 {W} 쪽을 가리키고 있었어요. {L}은(는) 오늘은 쉬는 날.',
  '{W}, 이걸 안 고르면 평생 궁금할 거예요. 후회 없는 선택!',
  '통계적으로 {W}이(가) 더 행복지수가 높아요. (근거는 없지만 느낌은 확실)',
  '이미 마음속으로 {W}을(를) 원하고 있었잖아요? 솔직해지세요!',
  '{L}한테는 미안하지만, 오늘의 주인공은 {W}이에요.',
  '{W}을(를) 선택한 당신, 센스 있어요. {L}은(는) 내일의 즐거움으로 남겨두세요.',
  '직감이 {W}을(를) 외치고 있어요. 직감은 배신하지 않거든요.',
  '{W} vs {L}, 치열했지만 근소한 차이로 {W}의 승리!',
  '오늘 같은 날엔 {W}이(가) 딱이에요. {L}은(는) 비 오는 날 다시 도전!',
  '{W}을(를) 고르면 오늘 운이 트일 것 같은 느낌적인 느낌!',
  '심사숙고 끝에 {W}입니다. {L}도 훌륭하지만 오늘은 양보.',
  '10명 중 7명이 이 상황에서 {W}을(를) 골랐어요. (출처: 내 감)',
  '{L}아 미안, 오늘은 {W}의 날이야. 다음엔 네 차례!',
  '눈 감고 골라도 {W}이(가) 나왔을 거예요. 운명이에요!',
  '잠깐 고민했지만 역시 {W}이에요. {L}은(는) 아끼다 더 좋은 날에!',
  '{W}을(를) 선택한 미래의 당신이 지금의 당신에게 감사할 거예요.',
  '{L}의 매력도 알지만, 오늘은 {W}이(가) 한 수 위예요.',
  '별자리 운세, 타로, AI 전부 {W}을(를) 가리키고 있어요.',
  '{W}을(를) 안 고르면 나중에 "그때 {W} 할걸..." 하게 돼요.',
  '방금 동전 던졌는데 {W} 나왔어요. 동전은 거짓말 안 해요.',
  '{L}이(가) 삐질 수 있지만, 오늘만큼은 {W}이(가) 주인공이에요.',
  '{W}, 이거 하나로 오늘 기분 전환 완료! {L}은(는) 주말에 만나요.',
  '인생은 짧아요. {W} 먼저 즐기고, {L}은(는) 나중에 즐겨요!',
  '{W}을(를) 고른 사람들의 만족도가 높다는 소문이 있어요. (내가 퍼뜨림)',
  '오늘의 행운 키워드: {W}. 오늘의 불운 키워드: 고민만 하기.',
  '{L}도 훌륭한 선택이지만, {W}이(가) 0.1% 더 끌려요. 그 0.1%가 중요해요!',
  '지금 이 순간 {W}을(를) 고른 당신, 결단력 최고예요.',
  '{W}을(를) 선택하세요. 이유요? 그냥요. 가끔은 이유 없는 게 정답이에요.',
  '만약 친구가 물어보면 {W} 추천하세요. 센스 있는 사람이 됩니다.',
  '{L}은(는) 언제든 할 수 있지만, {W}은(는) 오늘이 딱이에요.',
  '{W} 선택하고 남는 시간에 {L}도 하면 되잖아요. 일석이조!',
  '고민 시간 3초 컷! {W}입니다. 빠른 결정이 좋은 결정이에요.',
  '내일의 나에게 물어봤는데 {W} 하길 잘했다고 하네요.',
  '{W}이(가) 손 흔들고 있어요. "나 골라줘!" 하면서요. 저 귀여움을 어떡해요.'
];

function 텍스트랜덤선택(optA, optB) {
  var winner = Math.random() < 0.5 ? 'A' : 'B';
  var winLabel  = winner === 'A' ? optA : optB;
  var loseLabel = winner === 'A' ? optB : optA;
  var 템플릿 = 이유템플릿[Math.floor(Math.random() * 이유템플릿.length)];
  var reasoning = 템플릿.replace(/\{W\}/g, winLabel).replace(/\{L\}/g, loseLabel);
  return { winner: winner, reasoning: reasoning };
}

/* ── 이미지 모드 API 호출 ── */
function 이미지API호출() {
  var weather  = ctxWeather.value;
  var occasion = ctxOccasion.value;
  var parts    = [];
  if (weather)  parts.push('날씨: ' + weather);
  if (occasion) parts.push('상황: ' + occasion);

  var prompt = (parts.length ? '참고 정보 — ' + parts.join(', ') + '\n\n' : '') +
    '아래 두 이미지 중 하나를 골라줘. 반드시 A 또는 B 중 하나만 선택해야 해.\n\n' +
    '아래 형식으로 한국어로 답해줘:\n선택: [A 또는 B]\n이유: [센스 있는 이유, 2~3문장]';

  return fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL_IMAGE,
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imageMimeA, data: base64추출(imageDataA) } },
          { type: 'text',  text: '이미지 A' },
          { type: 'image', source: { type: 'base64', media_type: imageMimeB, data: base64추출(imageDataB) } },
          { type: 'text',  text: '이미지 B' },
          { type: 'text',  text: prompt }
        ]
      }]
    })
  });
}

/* ── 응답 파싱 ── */
function 응답파싱(text) {
  var winner   = null;
  var reasoning = '';
  var lines    = text.split('\n');

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!winner && line.indexOf('선택') !== -1 && line.indexOf(':') !== -1) {
      var raw = line.split(':')[1].trim().toUpperCase();
      if      (raw.indexOf('A') !== -1 && raw.indexOf('B') === -1) winner = 'A';
      else if (raw.indexOf('B') !== -1 && raw.indexOf('A') === -1) winner = 'B';
      else if (raw.charAt(0) === 'A') winner = 'A';
      else if (raw.charAt(0) === 'B') winner = 'B';
    }
    if (!reasoning && line.indexOf('이유') !== -1 && line.indexOf(':') !== -1) {
      reasoning = line.split(':').slice(1).join(':').trim();
      for (var j = i + 1; j < lines.length; j++) {
        if (lines[j].trim()) reasoning += ' ' + lines[j].trim();
      }
    }
  }

  if (!winner) {
    var u = text.toUpperCase();
    winner = (u.indexOf('A') <= u.indexOf('B')) ? 'A' : 'B';
  }
  if (!reasoning) reasoning = text;

  return { winner: winner, reasoning: reasoning };
}

/* ── 애니메이션 ── */

function 서스펜스시작() {
  suspenseArea.classList.remove('hidden');
  cardA.classList.add('thinking');
  cardB.classList.add('thinking');
}

function 서스펜스종료() {
  suspenseArea.classList.add('hidden');
  cardA.classList.remove('thinking');
  cardB.classList.remove('thinking');
}

function 드라마틱공개(winner, reasoning) {
  서스펜스종료();

  cardA.classList.add('drumrolling');
  cardB.classList.add('drumrolling');

  setTimeout(function() {
    cardA.classList.remove('drumrolling');
    cardB.classList.remove('drumrolling');

    var winnerCard  = (winner === 'A') ? cardA  : cardB;
    var loserCard   = (winner === 'A') ? cardB  : cardA;
    var winnerCrown = (winner === 'A') ? crownA : crownB;

    winnerCard.classList.add('winner');
    loserCard.classList.add('loser');
    winnerCrown.classList.remove('hidden');
    winnerCrown.classList.add('visible');

    setTimeout(function() {
      var label = currentMode === 'text'
        ? (winner === 'A' ? optionAInput.value.trim() : optionBInput.value.trim())
        : (winner === 'A' ? '이미지 A' : '이미지 B');

      winnerBanner.textContent = '🎉 ' + winner + ' (' + label + ') 승리!';
      reasoningBox.textContent = reasoning;
      revealArea.classList.remove('hidden');

      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          winnerBanner.classList.add('visible');
          reasoningBox.classList.add('visible');
        });
      });

      /* 공유 버튼 데이터 설정 */
      shareBtn.dataset.winner   = winner;
      shareBtn.dataset.label    = label;
      shareBtn.dataset.reasoning = reasoning;
      shareBtn.dataset.optionA  = optionAInput.value.trim();
      shareBtn.dataset.optionB  = optionBInput.value.trim();

      /* 텍스트 모드만 피드에 자동 저장 */
      if (currentMode === 'text') {
        피드저장(optionAInput.value.trim(), optionBInput.value.trim(), winner, label, reasoning);
      }
    }, 900);

  }, 680);
}

/* ── 피드 ── */

function 피드카드HTML(item) {
  var isA = item.winner === 'A';
  return '<div class="feed-card">' +
    '<div class="feed-card-header">' +
      '<span class="feed-card-user">' + 닉네임이모지(item.username) + ' ' + 텍스트이스케이프(item.username) + '</span>' +
      '<span class="feed-card-time">' + 시간포맷(item.createdAt) + '</span>' +
    '</div>' +
    '<div class="feed-card-vs">' +
      '<div class="feed-option ' + (isA ? 'winner' : '') + '">' + 텍스트이스케이프(item.optionA) + '</div>' +
      '<div class="feed-vs-dot">VS</div>' +
      '<div class="feed-option ' + (!isA ? 'winner' : '') + '">' + 텍스트이스케이프(item.optionB) + '</div>' +
    '</div>' +
    '<div class="feed-reasoning">"' + 텍스트이스케이프(item.reasoning) + '"</div>' +
  '</div>';
}

function 피드렌더링() {
  var html = 피드전체아이템.slice(0, 피드표시개수).map(피드카드HTML).join('');

  /* 더보기 버튼 */
  if (피드표시개수 < 피드전체아이템.length) {
    var 남은개수 = 피드전체아이템.length - 피드표시개수;
    var 버튼텍스트 = 피드예시모드
      ? '더보기 (' + 남은개수 + '개)'
      : '더보기';
    html += '<button id="feed-more-btn" class="feed-more-btn">' + 버튼텍스트 + '</button>';
  }

  feedList.innerHTML = html;

  var moreBtn = document.getElementById('feed-more-btn');
  if (moreBtn) {
    moreBtn.addEventListener('click', function() {
      피드표시개수 = 피드예시모드
        ? 피드전체아이템.length   /* 예시: 전체 한 번에 표시 */
        : 피드표시개수 + 5;        /* 실제: 5개씩 추가 */
      피드렌더링();
    });
  }
}

function 피드저장(optionA, optionB, winner, label, reasoning) {
  fetch('/api/feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ optionA: optionA, optionB: optionB, winner: winner, label: label, reasoning: reasoning })
  })
    .then(function() { 피드로드(); });
}

function 시간포맷(iso) {
  var diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return '방금';
  if (diff < 3600) return Math.floor(diff / 60) + '분 전';
  if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
  return Math.floor(diff / 86400) + '일 전';
}

function 피드로드() {
  피드표시개수 = 5;
  fetch('/api/feed')
    .then(function(res) { return res.json(); })
    .then(function(items) {
      if (!items.length) {
        feedList.innerHTML = '<p class="feed-empty">아직 고민이 없어요. 첫 번째로 골라줘를 눌러보세요!</p>';
        return;
      }
      피드전체아이템 = items;
      피드예시모드   = items[0] && String(items[0].id).indexOf('ex') === 0;
      피드렌더링();
    });
}

/* ── 메인 픽 실행 ── */

function 픽실행(mode) {
  if (isLoading) return;

  if (mode === 'text') {
    var a = optionAInput.value.trim();
    var b = optionBInput.value.trim();
    if (!a || !b) { 오류표시('두 선택지를 모두 입력해주세요.'); return; }
  } else {
    if (!imageDataA || !imageDataB) { 오류표시('두 이미지를 모두 업로드해주세요.'); return; }
  }

  isLoading = true;
  textPickBtn.disabled  = true;
  imagePickBtn.disabled = true;

  결과섹션준비(mode);
  서스펜스시작();

  if (mode === 'text') {
    setTimeout(function() {
      var result = 텍스트랜덤선택(a, b);
      드라마틱공개(result.winner, result.reasoning);
      isLoading = false;
      textPickBtn.disabled  = false;
      imagePickBtn.disabled = false;
    }, 1200);
    return;
  }

  /* 이미지 모드 */
  이미지API호출()
    .then(function(res) {
      if (!res.ok) {
        return res.json().then(function(d) {
          throw new Error(d && d.error && d.error.message ? d.error.message :
                          d && typeof d.error === 'string' ? d.error : 'API 오류');
        });
      }
      return res.json();
    })
    .then(function(data) {
      var result = 응답파싱(data.content[0].text);
      드라마틱공개(result.winner, result.reasoning);
    })
    .catch(function(err) { 서스펜스종료(); 오류표시('오류: ' + err.message); })
    .then(function() {
      isLoading = false;
      textPickBtn.disabled  = false;
      imagePickBtn.disabled = false;
    });
}

/* ── 결과 섹션 준비 ── */
function 결과섹션준비(mode) {
  errorArea.classList.add('hidden');
  revealArea.classList.add('hidden');
  cardA.className = 'battle-card';
  cardB.className = 'battle-card';
  crownA.classList.add('hidden');   crownA.classList.remove('visible');
  crownB.classList.add('hidden');   crownB.classList.remove('visible');
  winnerBanner.classList.remove('visible');
  reasoningBox.classList.remove('visible');

  if (mode === 'text') {
    cardContentA.innerHTML = '<span class="card-text">' + 텍스트이스케이프(optionAInput.value.trim()) + '</span>';
    cardContentB.innerHTML = '<span class="card-text">' + 텍스트이스케이프(optionBInput.value.trim()) + '</span>';
  } else {
    cardContentA.innerHTML = '<img class="card-img" src="' + imageDataA + '" alt="이미지 A">';
    cardContentB.innerHTML = '<img class="card-img" src="' + imageDataB + '" alt="이미지 B">';
  }
  resultSection.classList.remove('hidden');
}

/* ── 결과 초기화 ── */
function 결과초기화() {
  resultSection.classList.add('hidden');
  revealArea.classList.add('hidden');
  errorArea.classList.add('hidden');
  suspenseArea.classList.add('hidden');
  cardA.className = 'battle-card';
  cardB.className = 'battle-card';
  crownA.classList.add('hidden');
  crownB.classList.add('hidden');
}

/* ── 오류 표시 ── */
function 오류표시(msg) {
  errorMsg.textContent = msg;
  errorArea.classList.remove('hidden');
  resultSection.classList.remove('hidden');
  서스펜스종료();
}

/* ── 초기화 ── */
function initApp() {
  /* DOM 참조 */
  headerAuth       = document.getElementById('header-auth');
  tabText          = document.getElementById('tab-text');
  tabImage         = document.getElementById('tab-image');
  textSection      = document.getElementById('text-section');
  imageSection     = document.getElementById('image-section');
  optionAInput     = document.getElementById('option-a');
  optionBInput     = document.getElementById('option-b');
  textContextInput = document.getElementById('text-context');
  fileA            = document.getElementById('file-a');
  fileB            = document.getElementById('file-b');
  previewA         = document.getElementById('preview-a');
  previewB         = document.getElementById('preview-b');
  ctxWeather       = document.getElementById('ctx-weather');
  ctxOccasion      = document.getElementById('ctx-occasion');
  textPickBtn      = document.getElementById('text-pick-btn');
  imagePickBtn     = document.getElementById('image-pick-btn');
  resultSection    = document.getElementById('result-section');
  cardA            = document.getElementById('card-a');
  cardB            = document.getElementById('card-b');
  cardContentA     = document.getElementById('card-content-a');
  cardContentB     = document.getElementById('card-content-b');
  crownA           = document.getElementById('crown-a');
  crownB           = document.getElementById('crown-b');
  suspenseArea     = document.getElementById('suspense-area');
  revealArea       = document.getElementById('reveal-area');
  winnerBanner     = document.getElementById('winner-banner');
  reasoningBox     = document.getElementById('reasoning-box');
  shareBtn         = document.getElementById('share-btn');
  kakaoShareBtn    = document.getElementById('kakao-share-btn');
  shareToast       = document.getElementById('share-toast');
  retryBtn         = document.getElementById('retry-btn');
  errorArea        = document.getElementById('error-area');
  errorMsg         = document.getElementById('error-msg');
  feedList         = document.getElementById('feed-list');

  /* 로그인 상태 확인 → 헤더 업데이트 */
  fetch('/auth/me')
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(data) {
      currentUser = data ? data.username : null;
      헤더업데이트(currentUser);
    });

  /* 피드 초기 로드 */
  피드로드();

  /* 모드 탭 */
  tabText.addEventListener('click',  function() { 모드전환('text'); });
  tabImage.addEventListener('click', function() { 모드전환('image'); });

  /* 이미지 파일 선택 */
  fileA.addEventListener('change', function() {
    if (fileA.files[0]) 파일선택처리(fileA.files[0], previewA, document.getElementById('upload-a'), 'A');
  });
  fileB.addEventListener('change', function() {
    if (fileB.files[0]) 파일선택처리(fileB.files[0], previewB, document.getElementById('upload-b'), 'B');
  });

  /* 골라줘 버튼 */
  textPickBtn.addEventListener('click',  function() { 픽실행('text'); });
  imagePickBtn.addEventListener('click', function() { 픽실행('image'); });

  /* 공유 링크 */
  shareBtn.addEventListener('click', function() {
    fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        optionA:   shareBtn.dataset.optionA,
        optionB:   shareBtn.dataset.optionB,
        winner:    shareBtn.dataset.winner,
        label:     shareBtn.dataset.label,
        reasoning: shareBtn.dataset.reasoning,
        mode:      currentMode
      })
    })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var url = window.location.origin + '/share/' + data.id;
        navigator.clipboard.writeText(url).then(function() {
          shareToast.classList.remove('hidden');
          setTimeout(function() { shareToast.classList.add('hidden'); }, 2500);
        });
      });
  });

  /* 카카오톡 공유 */
  if (window.Kakao && !Kakao.isInitialized()) {
    Kakao.init('YOUR_KAKAO_JS_KEY');
  }

  kakaoShareBtn.addEventListener('click', function() {
    var optA = shareBtn.dataset.optionA;
    var optB = shareBtn.dataset.optionB;
    var label = shareBtn.dataset.label;
    var reasoning = shareBtn.dataset.reasoning;

    /* 먼저 공유 링크 생성 */
    fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        optionA: optA, optionB: optB,
        winner: shareBtn.dataset.winner,
        label: label, reasoning: reasoning,
        mode: currentMode
      })
    })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var shareUrl = window.location.origin + '/share/' + data.id;

        if (window.Kakao && Kakao.isInitialized()) {
          Kakao.Share.sendDefault({
            objectType: 'feed',
            content: {
              title: optA + ' vs ' + optB,
              description: label + ' 승리! ' + reasoning.slice(0, 80),
              imageUrl: window.location.origin + '/og-image.png',
              link: { mobileWebUrl: shareUrl, webUrl: shareUrl }
            },
            buttons: [{
              title: '나도 골라줘!',
              link: { mobileWebUrl: window.location.origin, webUrl: window.location.origin }
            }]
          });
        } else {
          /* 카카오 SDK 미초기화 시 링크 복사로 폴백 */
          navigator.clipboard.writeText(shareUrl).then(function() {
            shareToast.textContent = '카카오 연동 전이라 링크를 복사했어요! 📋';
            shareToast.classList.remove('hidden');
            setTimeout(function() { shareToast.classList.add('hidden'); }, 2500);
          });
        }
      });
  });

  /* 다시 해보기 */
  retryBtn.addEventListener('click', 결과초기화);

  /* Enter 키 */
  optionAInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') 픽실행('text'); });
  optionBInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') 픽실행('text'); });
}

initApp();
