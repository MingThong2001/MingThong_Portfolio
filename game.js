const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const ROUND_TIME = 75;
const START_FILM = 18;
const CAPTURE_RADIUS = 130;

const gameCanvas = document.getElementById('gameCanvas');
const gameCtx = gameCanvas.getContext('2d');
const scoreVal = document.getElementById('scoreVal');
const filmVal = document.getElementById('filmVal');
const timeVal = document.getElementById('timeVal');
const startOverlay = document.getElementById('startOverlay');
const startBtn = document.getElementById('startBtn');
const winOverlay = document.getElementById('winOverlay');
const winTitle = document.getElementById('winTitle');
const winMoves = document.getElementById('winMoves');
const nextBtn = document.getElementById('nextBtn');
const resetBtn = document.getElementById('resetBtn');
const canvasWrap = document.getElementById('canvasWrap');

gameCanvas.width = CANVAS_WIDTH;
gameCanvas.height = CANVAS_HEIGHT;

const TYPES = {
  hider:   { color: '#5eff9e', base: 150 },
  runner:  { color: '#ff9e5e', base: 120 },
  sleeper: { color: '#b98cff', base: 80  },
  dancer:  { color: '#ff6ec7', base: 100 },
  flyer:   { color: '#5ed6ff', base: 130 }
};

let rocks = [];
let aliens = [];
let popups = [];
let flashAlpha = 0;

let score = 0, film = 0, timeLeft = 0;
let capturedTypes = new Set();
let running = false;
let flyerTimer = 0;

let mouseX = CANVAS_WIDTH / 2, mouseY = CANVAS_HEIGHT / 2;
let hasPointer = false;

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }

function makeRocks() {
  rocks = [];
  for (let i = 0; i < 6; i++) {
    rocks.push({ x: rand(150, CANVAS_WIDTH - 150), y: rand(200, CANVAS_HEIGHT - 150), r: rand(50, 90) });
  }
}

function nearRock() {
  const r = rocks[Math.floor(Math.random() * rocks.length)];
  const ang = rand(0, Math.PI * 2);
  return { x: clamp(r.x + Math.cos(ang) * r.r * 0.6, 80, CANVAS_WIDTH - 80), y: clamp(r.y + Math.sin(ang) * r.r * 0.6, 80, CANVAS_HEIGHT - 80) };
}

function makeAlien(type, x, y) {
  const a = {
    type, x, y, radius: 34,
    vx: 0, vy: 0,
    hidden: false,
    stateTimer: rand(2, 4),
    danceCenter: { x, y },
    danceAngle: rand(0, Math.PI * 2),
    peak: false,
    peakTimer: 0,
    awake: type !== 'sleeper',
    wakeTimer: rand(3, 6),
    fleeing: false,
    exiting: false,
    respawnTimer: 0,
    wanderTarget: { x, y }
  };
  return a;
}

function spawnInitial() {
  aliens = [];
  aliens.push(makeAlien('hider', nearRock().x, nearRock().y));
  aliens.push(makeAlien('hider', nearRock().x, nearRock().y));
  aliens.push(makeAlien('runner', rand(200, 1700), rand(300, 900)));
  aliens.push(makeAlien('runner', rand(200, 1700), rand(300, 900)));
  aliens.push(makeAlien('sleeper', rand(300, 1600), rand(300, 900)));
  aliens.push(makeAlien('sleeper', rand(300, 1600), rand(300, 900)));
  const d1 = makeAlien('dancer', rand(400, 1500), rand(350, 850));
  d1.danceCenter = { x: d1.x, y: d1.y };
  aliens.push(d1);
  flyerTimer = rand(3, 6);
}

function respawnAlien(a) {
  const p = a.type === 'hider' ? nearRock() : { x: rand(250, CANVAS_WIDTH - 250), y: rand(300, CANVAS_HEIGHT - 150) };
  a.x = p.x; a.y = p.y;
  a.hidden = false;
  a.awake = a.type !== 'sleeper';
  a.fleeing = false;
  a.exiting = false;
  a.stateTimer = rand(2, 4);
  a.wakeTimer = rand(3, 6);
  if (a.type === 'dancer') a.danceCenter = { x: p.x, y: p.y };
}

function startRound() {
  score = 0; film = START_FILM; timeLeft = ROUND_TIME;
  capturedTypes = new Set();
  popups = [];
  flashAlpha = 0;
  makeRocks();
  spawnInitial();
  updateHud();
  running = true;
  startOverlay.classList.add('hidden');
  winOverlay.classList.add('hidden');
}

function updateHud() {
  scoreVal.textContent = score;
  filmVal.textContent = Math.max(0, film);
  timeVal.textContent = Math.ceil(Math.max(0, timeLeft));
}

function endRound(reason) {
  running = false;
  winTitle.textContent = 'Round Complete';
  const speciesText = `${capturedTypes.size} / 5 species captured`;
  winMoves.textContent = `Score: ${score} · ${speciesText}`;
  winOverlay.classList.remove('hidden');
}

// ---------- ALIEN AI ----------
function updateAlien(a, dt) {
  if (a.respawnTimer > 0) {
    a.respawnTimer -= dt;
    if (a.respawnTimer <= 0) respawnAlien(a);
    return;
  }

  if (a.type === 'hider') {
    a.stateTimer -= dt;
    if (a.stateTimer <= 0) {
      a.hidden = !a.hidden;
      a.stateTimer = a.hidden ? rand(1.4, 2.2) : rand(3, 5);
      if (a.hidden === false) {
        const p = nearRock();
        a.x = p.x; a.y = p.y;
      }
    }
  }

  else if (a.type === 'runner') {
    const dx = a.x - mouseX, dy = a.y - mouseY;
    const d = Math.hypot(dx, dy);
    if (hasPointer && d < 220 && d > 0.01) {
      a.vx = (dx / d) * 5.5;
      a.vy = (dy / d) * 5.5;
    } else {
      a.stateTimer -= dt;
      if (a.stateTimer <= 0) {
        a.wanderTarget = { x: rand(150, CANVAS_WIDTH - 150), y: rand(250, CANVAS_HEIGHT - 100) };
        a.stateTimer = rand(2, 3.5);
      }
      const wdx = a.wanderTarget.x - a.x, wdy = a.wanderTarget.y - a.y;
      const wd = Math.hypot(wdx, wdy);
      if (wd > 5) { a.vx = (wdx / wd) * 1.2; a.vy = (wdy / wd) * 1.2; }
      else { a.vx *= 0.9; a.vy *= 0.9; }
    }
    a.x = clamp(a.x + a.vx, 60, CANVAS_WIDTH - 60);
    a.y = clamp(a.y + a.vy, 200, CANVAS_HEIGHT - 100);
  }

  else if (a.type === 'sleeper') {
    a.wakeTimer -= dt;
    if (a.awake) {
      if (a.wakeTimer <= 0) { a.awake = false; a.wakeTimer = rand(4, 7); }
    } else {
      if (a.wakeTimer <= 0) { a.awake = true; a.wakeTimer = rand(1.8, 2.6); }
    }
  }

  else if (a.type === 'dancer') {
    a.danceAngle += dt * 1.4;
    a.x = a.danceCenter.x + Math.cos(a.danceAngle) * 70;
    a.y = a.danceCenter.y + Math.sin(a.danceAngle * 1.6) * 40;
    a.peakTimer -= dt;
    if (a.peakTimer <= 0) {
      a.peak = !a.peak;
      a.peakTimer = a.peak ? 0.4 : rand(2, 3.2);
    }
  }

  else if (a.type === 'flyer') {
    a.x += a.vx; a.y += a.vy;
    if (a.x < -100 || a.x > CANVAS_WIDTH + 100 || a.y < -100 || a.y > CANVAS_HEIGHT + 100) {
      a.exiting = true;
    }
  }
}

function trySpawnFlyer(dt) {
  flyerTimer -= dt;
  if (flyerTimer <= 0) {
    flyerTimer = rand(5, 9);
    const edge = Math.floor(rand(0, 4));
    let x, y, vx, vy;
    const speed = rand(4, 6);
    if (edge === 0) { x = -60; y = rand(250, 850); vx = speed; vy = rand(-1, 1); }
    else if (edge === 1) { x = CANVAS_WIDTH + 60; y = rand(250, 850); vx = -speed; vy = rand(-1, 1); }
    else if (edge === 2) { x = rand(200, 1700); y = -60; vx = rand(-1, 1); vy = speed; }
    else { x = rand(200, 1700); y = CANVAS_HEIGHT + 60; vx = rand(-1, 1); vy = -speed; }
    const f = makeAlien('flyer', x, y);
    f.vx = vx; f.vy = vy;
    aliens.push(f);
  }
}

// ---------- PHOTO CAPTURE ----------
function takePhoto(px, py) {
  if (!running || film <= 0) return;
  film--;
  flashAlpha = 0.55;

  let best = null, bestDist = Infinity;
  for (const a of aliens) {
    if (a.hidden || a.exiting || a.respawnTimer > 0) continue;
    const d = dist(a.x, a.y, px, py);
    if (d <= CAPTURE_RADIUS + a.radius && d < bestDist) { best = a; bestDist = d; }
  }

  if (!best) {
    addPopup(px, py, 'Missed', '#888');
    updateHud();
    checkEnd();
    return;
  }

  const info = TYPES[best.type];
  const centering = clamp(1 - bestDist / (CAPTURE_RADIUS + best.radius), 0, 1);
  let pts = Math.round(info.base * (0.5 + centering * 0.5));

  let bonusText = '';
  if (best.type === 'sleeper' && best.awake) { pts += 40; bonusText = ' +Awake!'; }
  if (best.type === 'dancer' && best.peak) { pts += 50; bonusText = ' +Peak Pose!'; }

  let newSpecies = false;
  if (!capturedTypes.has(best.type)) {
    capturedTypes.add(best.type);
    pts += 100;
    newSpecies = true;
  }

  score += pts;
  addPopup(best.x, best.y, `+${pts}${bonusText}`, info.color);
  if (newSpecies) addPopup(best.x, best.y - 40, 'NEW SPECIES!', '#ffd166');

  if (best.type === 'flyer') {
    best.exiting = true;
  } else {
    best.hidden = false;
    best.respawnTimer = rand(1.5, 2.5);
  }

  updateHud();
  checkEnd();
}

function checkEnd() {
  if (film <= 0) setTimeout(() => { if (running) endRound('film'); }, 900);
}

function addPopup(x, y, text, color) {
  popups.push({ x, y, text, color, life: 60, maxLife: 60 });
}

// ---------- LOOP ----------
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (running) {
    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; endRound('time'); }
    updateHud();

    trySpawnFlyer(dt);
    aliens.forEach(a => updateAlien(a, dt));
    aliens = aliens.filter(a => !a.exiting);
  }

  popups.forEach(p => { p.y -= 0.6; p.life--; });
  popups = popups.filter(p => p.life > 0);

  if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - 0.04);

  draw();
  requestAnimationFrame(loop);
}

function draw() {
  const bg = gameCtx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  bg.addColorStop(0, '#0d1730');
  bg.addColorStop(1, '#050810');
  gameCtx.fillStyle = bg;
  gameCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  rocks.forEach(r => {
    gameCtx.beginPath();
    gameCtx.ellipse(r.x, r.y, r.r, r.r * 0.75, 0, 0, Math.PI * 2);
    gameCtx.fillStyle = 'rgba(120,130,160,0.18)';
    gameCtx.fill();
    gameCtx.strokeStyle = 'rgba(180,190,220,0.2)';
    gameCtx.lineWidth = 2;
    gameCtx.stroke();
  });

  aliens.forEach(a => { if (!a.hidden && a.respawnTimer <= 0) drawAlien(a); });

  popups.forEach(p => {
    const alpha = Math.max(0, p.life / p.maxLife);
    gameCtx.font = 'bold 28px monospace';
    gameCtx.textAlign = 'center';
    gameCtx.fillStyle = p.color;
    gameCtx.globalAlpha = alpha;
    gameCtx.fillText(p.text, p.x, p.y);
    gameCtx.globalAlpha = 1;
  });

  if (hasPointer && running) {
    gameCtx.beginPath();
    gameCtx.arc(mouseX, mouseY, CAPTURE_RADIUS, 0, Math.PI * 2);
    gameCtx.strokeStyle = 'rgba(255,255,255,0.5)';
    gameCtx.lineWidth = 2;
    gameCtx.stroke();
    gameCtx.beginPath();
    gameCtx.moveTo(mouseX - 16, mouseY); gameCtx.lineTo(mouseX + 16, mouseY);
    gameCtx.moveTo(mouseX, mouseY - 16); gameCtx.lineTo(mouseX, mouseY + 16);
    gameCtx.strokeStyle = 'rgba(255,255,255,0.85)';
    gameCtx.stroke();
  }

  if (flashAlpha > 0) {
    gameCtx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
    gameCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
}

function drawAlien(a) {
  const info = TYPES[a.type];
  const scale = (a.type === 'dancer' && a.peak) ? 1.3 : 1;
  gameCtx.save();
  gameCtx.translate(a.x, a.y);
  gameCtx.scale(scale, scale);

  gameCtx.beginPath();
  gameCtx.arc(0, 0, a.radius, 0, Math.PI * 2);
  gameCtx.fillStyle = info.color;
  gameCtx.shadowBlur = 14;
  gameCtx.shadowColor = info.color;
  gameCtx.fill();
  gameCtx.shadowBlur = 0;

  const eyesClosed = a.type === 'sleeper' && !a.awake;
  gameCtx.fillStyle = '#111';
  if (eyesClosed) {
    gameCtx.fillRect(-14, -4, 10, 3);
    gameCtx.fillRect(4, -4, 10, 3);
  } else {
    gameCtx.beginPath(); gameCtx.arc(-9, -4, 5, 0, Math.PI * 2); gameCtx.fill();
    gameCtx.beginPath(); gameCtx.arc(9, -4, 5, 0, Math.PI * 2); gameCtx.fill();
  }

  if (a.type === 'sleeper' && !a.awake) {
    gameCtx.font = '18px monospace';
    gameCtx.fillStyle = 'rgba(255,255,255,0.6)';
    gameCtx.fillText('z z z', -14, -a.radius - 8);
  }

  gameCtx.restore();
}

// ---------- INPUT ----------
function getCanvasPos(clientX, clientY) {
  const rect = gameCanvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

gameCanvas.addEventListener('mousemove', (e) => {
  const p = getCanvasPos(e.clientX, e.clientY);
  mouseX = p.x; mouseY = p.y; hasPointer = true;
});

gameCanvas.addEventListener('click', (e) => {
  const p = getCanvasPos(e.clientX, e.clientY);
  takePhoto(p.x, p.y);
});

gameCanvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  const p = getCanvasPos(t.clientX, t.clientY);
  mouseX = p.x; mouseY = p.y; hasPointer = true;
}, { passive: false });

gameCanvas.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  const p = getCanvasPos(t.clientX, t.clientY);
  mouseX = p.x; mouseY = p.y; hasPointer = true;
  takePhoto(p.x, p.y);
});

startBtn.addEventListener('click', startRound);
nextBtn.addEventListener('click', startRound);
resetBtn.addEventListener('click', startRound);

// ---------- INIT ----------
makeRocks();
requestAnimationFrame(loop);