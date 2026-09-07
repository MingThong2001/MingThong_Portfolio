// ============================================================
// SPACE EXPLORER — top-down free-roam flight
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimap = document.getElementById('minimap');
const mmCtx = minimap.getContext('2d');

const startOverlay = document.getElementById('startOverlay');
const startBtn = document.getElementById('startBtn');
const infoPanel = document.getElementById('infoPanel');
const infoTitle = document.getElementById('infoTitle');
const infoBody = document.getElementById('infoBody');
const planetsVisitedEl = document.getElementById('planetsVisited');
const touchControls = document.getElementById('touchControls');
const touchStick = document.getElementById('touchStick');
const touchStickKnob = document.getElementById('touchStickKnob');
const touchThrust = document.getElementById('touchThrust');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  minimap.width = 160;
  minimap.height = 160;
}
resize();
window.addEventListener('resize', resize);

const WORLD_SIZE = 3600; // world spans -WORLD_SIZE/2 .. +WORLD_SIZE/2 on each axis

// ---------- portfolio planets ----------
const PLANET_DATA = [
  { title: 'About Me', body: 'Creative designer & developer building experiences that blend design and code.', color: '#5eff9e', x: 500, y: -300, r: 70 },
  { title: 'Projects', body: 'A collection of web experiments, interactive builds, and client work.', color: '#ff9e5e', x: -700, y: 200, r: 85 },
  { title: 'Skills', body: 'HTML, CSS, JavaScript, creative coding, and a growing love for interactive builds.', color: '#b98cff', x: 900, y: 600, r: 65 },
  { title: 'Contact', body: 'Open to work — reach out via Instagram or LinkedIn linked on the home page.', color: '#5ed6ff', x: -400, y: -700, r: 75 },
  { title: 'This Site', body: 'Built from scratch with plain HTML/CSS/JS and Canvas — no frameworks, no engine.', color: '#ff6ec7', x: -1100, y: -400, r: 80 },
];

const planets = PLANET_DATA.map(p => ({ ...p, visited: false, angle: Math.random() * Math.PI * 2 }));

// ---------- starfield (parallax layers) ----------
function makeStars(count, area) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({ x: (Math.random() - 0.5) * area, y: (Math.random() - 0.5) * area, r: Math.random() * 1.6 + 0.4 });
  }
  return arr;
}
const starsFar = makeStars(300, WORLD_SIZE * 1.6);
const starsNear = makeStars(150, WORLD_SIZE * 1.6);

// ---------- ship state ----------
const ship = {
  x: 0, y: 0,
  angle: -Math.PI / 2, // pointing "up" initially
  vx: 0, vy: 0,
  thrusting: false
};

const THRUST_ACCEL = 0.22;
const BOOST_MULT = 2;
const ROTATE_SPEED = 0.045;
const DRAG = 0.985;
const MAX_SPEED = 9;

let camX = 0, camY = 0;
let visitedCount = 0;
let nearPlanet = null;
let running = false;

const keys = { left: false, right: false, thrust: false, brake: false, boost: false };
let touchActive = false, touchDX = 0, touchDY = 0, touchThrusting = false;

function isTouchDevice() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

startBtn.addEventListener('click', () => {
  running = true;
  startOverlay.classList.add('hidden');
  if (isTouchDevice()) touchControls.classList.remove('hidden');
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'arrowleft') keys.left = true;
  if (k === 'd' || k === 'arrowright') keys.right = true;
  if (k === 'w' || k === 'arrowup') keys.thrust = true;
  if (k === ' ') { keys.brake = true; e.preventDefault(); }
  if (k === 'shift') keys.boost = true;
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'arrowleft') keys.left = false;
  if (k === 'd' || k === 'arrowright') keys.right = false;
  if (k === 'w' || k === 'arrowup') keys.thrust = false;
  if (k === ' ') keys.brake = false;
  if (k === 'shift') keys.boost = false;
});

// ---------- touch joystick ----------
let stickOrigin = null;
touchStick.addEventListener('touchstart', (e) => {
  const rect = touchStick.getBoundingClientRect();
  stickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  touchActive = true;
});
touchStick.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!stickOrigin) return;
  const t = e.touches[0];
  let dx = t.clientX - stickOrigin.x;
  let dy = t.clientY - stickOrigin.y;
  const max = 45;
  const len = Math.min(Math.hypot(dx, dy), max);
  const ang = Math.atan2(dy, dx);
  dx = Math.cos(ang) * len; dy = Math.sin(ang) * len;
  touchStickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  touchDX = dx / max; touchDY = dy / max;
}, { passive: false });
touchStick.addEventListener('touchend', () => {
  touchActive = false; touchDX = 0; touchDY = 0;
  touchStickKnob.style.transform = `translate(0px, 0px)`;
});
touchThrust.addEventListener('touchstart', (e) => { e.preventDefault(); touchThrusting = true; });
touchThrust.addEventListener('touchend', () => { touchThrusting = false; });

function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }

function update(dt) {
  const rotateInput = touchActive ? touchDX : ((keys.right ? 1 : 0) - (keys.left ? 1 : 0));
  ship.angle += rotateInput * ROTATE_SPEED * dt * 60;

  const thrusting = keys.thrust || touchThrusting || (touchActive && touchDY < -0.3);
  ship.thrusting = thrusting;

  if (thrusting) {
    const accel = THRUST_ACCEL * (keys.boost ? BOOST_MULT : 1);
    ship.vx += Math.cos(ship.angle) * accel * dt * 60;
    ship.vy += Math.sin(ship.angle) * accel * dt * 60;
  }
  if (keys.brake) {
    ship.vx *= 0.9; ship.vy *= 0.9;
  }

  ship.vx *= DRAG; ship.vy *= DRAG;
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > MAX_SPEED) { ship.vx = (ship.vx / speed) * MAX_SPEED; ship.vy = (ship.vy / speed) * MAX_SPEED; }

  ship.x += ship.vx * dt * 60;
  ship.y += ship.vy * dt * 60;

  const half = WORLD_SIZE / 2;
  ship.x = Math.max(-half, Math.min(half, ship.x));
  ship.y = Math.max(-half, Math.min(half, ship.y));

  camX += (ship.x - camX) * 0.1;
  camY += (ship.y - camY) * 0.1;

  planets.forEach(p => { p.angle += dt * 0.3; });

  let closest = null, closestDist = Infinity;
  planets.forEach(p => {
    const d = dist(ship.x, ship.y, p.x, p.y);
    if (d < closestDist) { closestDist = d; closest = p; }
  });

  const triggerDist = closest ? closest.r + 60 : Infinity;
  if (closest && closestDist < triggerDist) {
    if (nearPlanet !== closest) {
      nearPlanet = closest;
      infoTitle.textContent = closest.title;
      infoBody.textContent = closest.body;
      infoPanel.classList.remove('hidden');
      if (!closest.visited) {
        closest.visited = true;
        visitedCount++;
        planetsVisitedEl.textContent = visitedCount;
      }
    }
  } else if (nearPlanet && closestDist > triggerDist + 15) {
    nearPlanet = null;
    infoPanel.classList.add('hidden');
  }
}

// ---------- drawing ----------
function drawStars(stars, parallax, color) {
  ctx.fillStyle = color;
  stars.forEach(s => {
    const sx = s.x - camX * parallax + canvas.width / 2;
    const sy = s.y - camY * parallax + canvas.height / 2;
    const wrappedX = ((sx % canvas.width) + canvas.width) % canvas.width;
    const wrappedY = ((sy % canvas.height) + canvas.height) % canvas.height;
    ctx.beginPath();
    ctx.arc(wrappedX, wrappedY, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function worldToScreen(x, y) {
  return { x: x - camX + canvas.width / 2, y: y - camY + canvas.height / 2 };
}

function drawPlanet(p) {
  const s = worldToScreen(p.x, p.y);
  if (s.x < -150 || s.x > canvas.width + 150 || s.y < -150 || s.y > canvas.height + 150) return;

  const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.002 + p.x);

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(p.angle);
  ctx.strokeStyle = p.color;
  ctx.globalAlpha = 0.4 + pulse * 0.2;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, p.r * 1.5, p.r * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.globalAlpha = 1;
  const grad = ctx.createRadialGradient(s.x, s.y, p.r * 0.2, s.x, s.y, p.r);
  grad.addColorStop(0, p.color);
  grad.addColorStop(1, shadeColor(p.color, -40));
  ctx.beginPath();
  ctx.arc(s.x, s.y, p.r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.shadowBlur = 30;
  ctx.shadowColor = p.color;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(p.title, s.x, s.y - p.r - 16);
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + percent, g = ((num >> 8) & 0xff) + percent, b = (num & 0xff) + percent;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

function drawShip() {
  const s = worldToScreen(ship.x, ship.y);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(ship.angle + Math.PI / 2);

  if (ship.thrusting) {
    const flicker = 0.6 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.moveTo(-8, 16);
    ctx.lineTo(0, 16 + 18 * flicker);
    ctx.lineTo(8, 16);
    ctx.closePath();
    ctx.fillStyle = `rgba(94, 225, 255, ${flicker})`;
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(94,225,255,0.9)';
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(14, 16);
  ctx.lineTo(0, 8);
  ctx.lineTo(-14, 16);
  ctx.closePath();
  ctx.fillStyle = '#e8ecf5';
  ctx.shadowBlur = 12;
  ctx.shadowColor = 'rgba(255,255,255,0.6)';
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#5ee1ff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, -4, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#5ee1ff';
  ctx.fill();

  ctx.restore();
}

function drawMinimap() {
  mmCtx.clearRect(0, 0, 160, 160);
  mmCtx.fillStyle = 'rgba(255,255,255,0.03)';
  mmCtx.fillRect(0, 0, 160, 160);

  const scale = 160 / WORLD_SIZE;
  const toMap = (x, y) => ({ x: 80 + x * scale, y: 80 + y * scale });

  planets.forEach(p => {
    const m = toMap(p.x, p.y);
    mmCtx.beginPath();
    mmCtx.arc(m.x, m.y, 3, 0, Math.PI * 2);
    mmCtx.fillStyle = p.color;
    mmCtx.fill();
  });

  const sm = toMap(ship.x, ship.y);
  mmCtx.save();
  mmCtx.translate(sm.x, sm.y);
  mmCtx.rotate(ship.angle + Math.PI / 2);
  mmCtx.beginPath();
  mmCtx.moveTo(0, -5); mmCtx.lineTo(4, 5); mmCtx.lineTo(-4, 5);
  mmCtx.closePath();
  mmCtx.fillStyle = '#fff';
  mmCtx.fill();
  mmCtx.restore();
}

function draw() {
  const bgGrad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width);
  bgGrad.addColorStop(0, '#0a1230');
  bgGrad.addColorStop(1, '#02040a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawStars(starsFar, 0.3, 'rgba(255,255,255,0.4)');
  drawStars(starsNear, 0.6, 'rgba(255,255,255,0.7)');

  planets.forEach(drawPlanet);
  drawShip();
  drawMinimap();
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (running) update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);