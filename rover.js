// ============================================================
// MARS ROVER — Mode 7 style pseudo-3D perspective
// ============================================================

const roverCanvas = document.getElementById('roverCanvas');
const rCtx = roverCanvas.getContext('2d');
const minimap = document.getElementById('minimap');
const mmCtx = minimap.getContext('2d');

const startOverlay = document.getElementById('startOverlay');
const startBtn = document.getElementById('startBtn');
const infoPanel = document.getElementById('infoPanel');
const infoTitle = document.getElementById('infoTitle');
const infoBody = document.getElementById('infoBody');
const sitesVisitedEl = document.getElementById('planetsVisited');
const touchControls = document.getElementById('touchControls');
const touchStick = document.getElementById('touchStick');
const touchStickKnob = document.getElementById('touchStickKnob');
const touchThrust = document.getElementById('touchThrust');

function resize() {
  roverCanvas.width = window.innerWidth;
  roverCanvas.height = window.innerHeight;
  minimap.width = 160;
  minimap.height = 160;
}
resize();
window.addEventListener('resize', resize);

const WORLD_SIZE = 3600;

// ---------- perspective / camera tuning ----------
const FOCAL = () => roverCanvas.height * 0.9;
const CAM_HEIGHT = 55;
const CAM_BACK = 34;      // world units behind the rover
const HORIZON_FRAC = 0.44;
const MAX_GROUND_DIST = 1400;
const ROW_STEP = 4;       // increase (5,6,8...) if choppy
const COL_STEP = 8;       // increase if choppy

// ---------- procedural elevation ----------
function elevation(x, y) {
  const e =
    Math.sin(x * 0.0035 + 1.3) * Math.cos(y * 0.0031 + 0.7) * 1.0 +
    Math.sin(x * 0.0019 - 2.1) * Math.cos(y * 0.0022 + 1.9) * 0.6 +
    Math.sin((x + y) * 0.0012 + 0.4) * 0.5 +
    Math.sin(x * 0.008 + y * 0.006) * 0.15;
  return e / 2.25;
}
const GRAD_EPS = 6;
function elevationGradient(x, y) {
  const eR = elevation(x + GRAD_EPS, y), eL = elevation(x - GRAD_EPS, y);
  const eD = elevation(x, y + GRAD_EPS), eU = elevation(x, y - GRAD_EPS);
  return { gx: (eR - eL) / (2 * GRAD_EPS), gy: (eD - eU) / (2 * GRAD_EPS) };
}
const LIGHT_DIR = { x: -0.6, y: -0.8 };

function rand(a, b) { return a + Math.random() * (b - a); }
function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }

// ---------- craters (baked into ground shading) ----------
function makeCraters(count, area) {
  const arr = [];
  for (let i = 0; i < count; i++) arr.push({ x: rand(-area / 2, area / 2), y: rand(-area / 2, area / 2), r: rand(15, 45) });
  return arr;
}
const craters = makeCraters(120, WORLD_SIZE * 1.3);

function craterDarkenAt(x, y) {
  let d = 0;
  for (const c of craters) {
    const dd = dist(x, y, c.x, c.y);
    if (dd < c.r * 1.3) d += (1 - dd / (c.r * 1.3));
  }
  return Math.min(1, d);
}
function craterRoughnessAt(x, y) { return craterDarkenAt(x, y); }

function makeBoulderClusters(count, area) {
  const clusters = [];
  for (let i = 0; i < count; i++) {
    const cx = rand(-area / 2, area / 2), cy = rand(-area / 2, area / 2);
    const rocks = [];
    const n = Math.floor(rand(2, 5));
    for (let j = 0; j < n; j++) rocks.push({ x: cx + rand(-25, 25), y: cy + rand(-25, 25), r: rand(6, 16), shade: Math.random() });
    clusters.push(rocks);
  }
  return clusters.flat();
}
const boulders = makeBoulderClusters(50, WORLD_SIZE * 1.3);

function makeDebris(count, area) {
  const types = ['flag', 'panel', 'antenna'];
  const arr = [];
  for (let i = 0; i < count; i++) arr.push({ x: rand(-area / 2, area / 2), y: rand(-area / 2, area / 2), type: types[Math.floor(Math.random() * types.length)] });
  return arr;
}
const debris = makeDebris(12, WORLD_SIZE * 1.1);

function makeDustDevil() {
  return { x: rand(-WORLD_SIZE / 2, WORLD_SIZE / 2), y: rand(-WORLD_SIZE / 2, WORLD_SIZE / 2), angle: rand(0, Math.PI * 2), speed: rand(0.3, 0.8), turnRate: rand(-0.01, 0.01), spin: 0, life: rand(400, 900) };
}
let dustDevils = [makeDustDevil(), makeDustDevil(), makeDustDevil()];

// ---------- portfolio sites ----------
const SITE_DATA = [
  { title: 'About Me', body: 'Creative designer & developer building experiences that blend design and code.', color: '#5eff9e', x: 500, y: -300 },
  { title: 'Projects', body: 'A collection of web experiments, interactive builds, and client work.', color: '#ffb35e', x: -700, y: 200 },
  { title: 'Skills', body: 'HTML, CSS, JavaScript, creative coding, and a growing love for interactive builds.', color: '#b98cff', x: 900, y: 600 },
  { title: 'Contact', body: 'Open to work — reach out via Instagram or LinkedIn linked on the home page.', color: '#5ed6ff', x: -400, y: -700 },
  { title: 'This Site', body: 'Built from scratch with plain HTML/CSS/JS and Canvas — no frameworks, no engine.', color: '#ff6ec7', x: -1100, y: -400 },
];
const sites = SITE_DATA.map(s => ({ ...s, r: 55, visited: false }));

// ---------- rover / camera state ----------
const rover = { x: 0, y: 0, angle: -Math.PI / 2, vx: 0, vy: 0, speed: 0, wheelSpin: 0, bob: 0, tilt: 0 };

const THRUST_ACCEL = 0.2;
const BOOST_MULT = 1.8;
const ROTATE_SPEED = 0.036;
const DRAG = 0.92;
const MAX_SPEED = 7;

let bobPhase = 0;
let visitedCount = 0;
let nearSite = null;
let running = false;

let dustParticles = [];

const keys = { left: false, right: false, thrust: false, reverse: false, boost: false };
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
  if (k === 's' || k === 'arrowdown') keys.reverse = true;
  if (k === 'shift') keys.boost = true;
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'arrowleft') keys.left = false;
  if (k === 'd' || k === 'arrowright') keys.right = false;
  if (k === 'w' || k === 'arrowup') keys.thrust = false;
  if (k === 's' || k === 'arrowdown') keys.reverse = false;
  if (k === 'shift') keys.boost = false;
});

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
  let dx = t.clientX - stickOrigin.x, dy = t.clientY - stickOrigin.y;
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

// ---------- physics ----------
function update(dt) {
  const rotateInput = touchActive ? touchDX : ((keys.right ? 1 : 0) - (keys.left ? 1 : 0));
  rover.angle += rotateInput * ROTATE_SPEED * dt * 60 * (rover.speed !== 0 ? Math.sign(rover.speed) || 1 : 1);

  const thrusting = keys.thrust || touchThrusting || (touchActive && touchDY < -0.3);
  const reversing = keys.reverse || (touchActive && touchDY > 0.3);

  if (thrusting) {
    const accel = THRUST_ACCEL * (keys.boost ? BOOST_MULT : 1);
    rover.vx += Math.cos(rover.angle) * accel * dt * 60;
    rover.vy += Math.sin(rover.angle) * accel * dt * 60;
  }
  if (reversing) {
    rover.vx -= Math.cos(rover.angle) * THRUST_ACCEL * 0.6 * dt * 60;
    rover.vy -= Math.sin(rover.angle) * THRUST_ACCEL * 0.6 * dt * 60;
  }

  rover.vx *= DRAG; rover.vy *= DRAG;
  let speed = Math.hypot(rover.vx, rover.vy);
  if (speed > MAX_SPEED) { rover.vx = (rover.vx / speed) * MAX_SPEED; rover.vy = (rover.vy / speed) * MAX_SPEED; speed = MAX_SPEED; }
  rover.speed = speed;
  rover.wheelSpin += speed * dt * 4;

  rover.x += rover.vx * dt * 60;
  rover.y += rover.vy * dt * 60;

  const half = WORLD_SIZE / 2;
  rover.x = Math.max(-half, Math.min(half, rover.x));
  rover.y = Math.max(-half, Math.min(half, rover.y));

  const { gx, gy } = elevationGradient(rover.x, rover.y);
  const headingSlope = gx * Math.cos(rover.angle) + gy * Math.sin(rover.angle);
  const slopeMag = Math.hypot(gx, gy);

  bobPhase += dt * (4 + speed * 3);
  const suspensionBounce = Math.sin(bobPhase) * Math.min(1, slopeMag * 40 + craterRoughnessAt(rover.x, rover.y)) * 2.2;
  rover.bob += (suspensionBounce - rover.bob) * 0.3;
  rover.tilt += (-headingSlope * 6 - rover.tilt) * 0.15;

  if (speed > 1 && Math.random() < 0.5) {
    dustParticles.push({
      x: rover.x - Math.cos(rover.angle) * 14 + (Math.random() - 0.5) * 10,
      y: rover.y - Math.sin(rover.angle) * 14 + (Math.random() - 0.5) * 10,
      vx: -Math.cos(rover.angle) * 0.4 + (Math.random() - 0.5) * 0.6,
      vy: -Math.sin(rover.angle) * 0.4 + (Math.random() - 0.5) * 0.6,
      life: 45, maxLife: 45, size: rand(2, 5)
    });
  }
  dustParticles.forEach(d => { d.x += d.vx; d.y += d.vy; d.life--; });
  dustParticles = dustParticles.filter(d => d.life > 0);

  dustDevils.forEach(dd => {
    dd.angle += dd.turnRate;
    dd.x += Math.cos(dd.angle) * dd.speed;
    dd.y += Math.sin(dd.angle) * dd.speed;
    dd.spin += 0.15;
    dd.life--;
    const half2 = WORLD_SIZE / 2;
    if (dd.x < -half2) dd.x = half2; if (dd.x > half2) dd.x = -half2;
    if (dd.y < -half2) dd.y = half2; if (dd.y > half2) dd.y = -half2;
  });
  dustDevils = dustDevils.filter(dd => dd.life > 0);
  while (dustDevils.length < 3) dustDevils.push(makeDustDevil());

  let closest = null, closestDist = Infinity;
  sites.forEach(s => {
    const d = dist(rover.x, rover.y, s.x, s.y);
    if (d < closestDist) { closestDist = d; closest = s; }
  });
  const triggerDist = closest ? closest.r + 50 : Infinity;
  if (closest && closestDist < triggerDist) {
    if (nearSite !== closest) {
      nearSite = closest;
      infoTitle.textContent = `📡 ${closest.title}`;
      infoBody.textContent = closest.body;
      infoPanel.classList.remove('hidden');
      if (!closest.visited) { closest.visited = true; visitedCount++; sitesVisitedEl.textContent = visitedCount; }
    }
  } else if (nearSite && closestDist > triggerDist + 15) {
    nearSite = null;
    infoPanel.classList.add('hidden');
  }
}

// ---------- camera / projection ----------
function getCamera() {
  const fx = Math.cos(rover.angle), fy = Math.sin(rover.angle);
  const rx = -fy, ry = fx; // right vector
  const camX = rover.x - fx * CAM_BACK;
  const camY = rover.y - fy * CAM_BACK;
  return { camX, camY, fx, fy, rx, ry };
}

// project a world point into {forward, lateral} camera-space
function toCameraSpace(wx, wy, cam) {
  const dx = wx - cam.camX, dy = wy - cam.camY;
  const forward = dx * cam.fx + dy * cam.fy;
  const lateral = dx * cam.rx + dy * cam.ry;
  return { forward, lateral };
}

// project camera-space forward/lateral to screen {x,y,scale}, null if not visible
function projectToScreen(forward, lateral, groundOffsetY = 0) {
  if (forward < 8) return null;
  const focal = FOCAL();
  const horizonY = roverCanvas.height * HORIZON_FRAC;
  const screenX = roverCanvas.width / 2 + (lateral * focal) / forward;
  const screenY = horizonY + (CAM_HEIGHT * focal) / forward - groundOffsetY * (focal / forward) * 0.3;
  const scale = focal / forward;
  return { x: screenX, y: screenY, scale };
}

// ---------- ground color sampling ----------
function getGroundColor(wx, wy, fogT) {
  const h = elevation(wx, wy);
  const { gx, gy } = elevationGradient(wx, wy);
  const litness = Math.max(0, -(gx * LIGHT_DIR.x + gy * LIGHT_DIR.y) * 30);
  let shade = h * 0.3 + litness * 0.45;
  const crater = craterDarkenAt(wx, wy);
  shade -= crater * 0.5;

  let r = 140 + shade * 90;
  let g = 70 + shade * 55;
  let b = 45 + shade * 35;

  // fog toward background color with distance
  const fogR = 42, fogG = 18, fogB = 8;
  r = r + (fogR - r) * fogT;
  g = g + (fogG - g) * fogT;
  b = b + (fogB - b) * fogT;

  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---------- drawing ----------
function drawSky() {
  const horizonY = roverCanvas.height * HORIZON_FRAC;
  const sky = rCtx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, '#3a1810');
  sky.addColorStop(1, '#8a4020');
  rCtx.fillStyle = sky;
  rCtx.fillRect(0, 0, roverCanvas.width, horizonY);
}

function drawGround(cam) {
  const horizonY = roverCanvas.height * HORIZON_FRAC;
  const focal = FOCAL();

  for (let y = horizonY + 2; y < roverCanvas.height; y += ROW_STEP) {
    const forward = (CAM_HEIGHT * focal) / (y - horizonY);
    if (forward > MAX_GROUND_DIST) continue;
    const fogT = Math.min(1, forward / MAX_GROUND_DIST);

    for (let x = 0; x < roverCanvas.width; x += COL_STEP) {
      const lateral = ((x - roverCanvas.width / 2) * forward) / focal;
      const wx = cam.camX + cam.fx * forward + cam.rx * lateral;
      const wy = cam.camY + cam.fy * forward + cam.ry * lateral;

      rCtx.fillStyle = getGroundColor(wx, wy, fogT);
      rCtx.fillRect(x, y, COL_STEP + 1, ROW_STEP + 1);
    }
  }
}

function drawBillboard(wx, wy, cam, drawFn) {
  const { forward, lateral } = toCameraSpace(wx, wy, cam);
  const p = projectToScreen(forward, lateral);
  if (!p) return;
  if (p.y < roverCanvas.height * HORIZON_FRAC - 40 || p.y > roverCanvas.height + 100) return;
  drawFn(p.x, p.y, p.scale);
}

function drawSite(s, cam) {
  drawBillboard(s.x, s.y, cam, (sx, sy, scale) => {
    const size = s.r * scale * 0.6;
    if (size < 1) return;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.002 + s.x);

    rCtx.beginPath();
    rCtx.ellipse(sx, sy, size, size * 0.35, 0, 0, Math.PI * 2);
    rCtx.fillStyle = 'rgba(0,0,0,0.25)';
    rCtx.fill();

    rCtx.beginPath();
    rCtx.arc(sx, sy - size, size, 0, Math.PI * 2);
    rCtx.strokeStyle = s.color;
    rCtx.lineWidth = Math.max(1, 3 * scale * 0.3);
    rCtx.shadowBlur = 20 * scale * 0.3;
    rCtx.shadowColor = s.color;
    rCtx.stroke();
    rCtx.shadowBlur = 0;

    rCtx.beginPath();
    rCtx.arc(sx, sy - size, 4 + pulse * 3, 0, Math.PI * 2);
    rCtx.fillStyle = s.color;
    rCtx.fill();

    if (size > 8) {
      rCtx.font = `bold ${Math.max(8, 13 * scale * 0.3)}px monospace`;
      rCtx.textAlign = 'center';
      rCtx.fillStyle = '#fff';
      rCtx.fillText(s.title.toUpperCase(), sx, sy - size * 2 - 6);
    }
  });
}

function drawBoulder(r, cam) {
  drawBillboard(r.x, r.y, cam, (sx, sy, scale) => {
    const size = r.r * scale * 0.5;
    if (size < 0.6) return;
    rCtx.beginPath();
    rCtx.ellipse(sx + size * 0.2, sy + size * 0.3, size * 1.1, size * 0.4, 0, 0, Math.PI * 2);
    rCtx.fillStyle = 'rgba(0,0,0,0.25)';
    rCtx.fill();
    rCtx.beginPath();
    rCtx.arc(sx, sy, size, 0, Math.PI * 2);
    rCtx.fillStyle = r.shade > 0.5 ? '#4a2818' : '#3a1f12';
    rCtx.fill();
  });
}

function drawDebrisItem(d, cam) {
  drawBillboard(d.x, d.y, cam, (sx, sy, scale) => {
    const s2 = Math.max(0.4, scale * 0.4);
    if (s2 < 0.5) return;
    rCtx.save();
    rCtx.translate(sx, sy);
    rCtx.scale(s2, s2);
    if (d.type === 'flag') {
      rCtx.strokeStyle = '#b8a888';
      rCtx.lineWidth = 2;
      rCtx.beginPath(); rCtx.moveTo(0, 0); rCtx.lineTo(0, -30); rCtx.stroke();
      rCtx.beginPath(); rCtx.moveTo(0, -30); rCtx.lineTo(16, -25); rCtx.lineTo(0, -20); rCtx.closePath();
      rCtx.fillStyle = 'rgba(255,100,100,0.7)'; rCtx.fill();
    } else if (d.type === 'panel') {
      rCtx.fillStyle = 'rgba(60,90,120,0.5)';
      rCtx.fillRect(-14, -16, 28, 16);
    } else {
      rCtx.strokeStyle = '#a89878';
      rCtx.lineWidth = 2;
      rCtx.beginPath(); rCtx.moveTo(0, 0); rCtx.lineTo(0, -30); rCtx.stroke();
      rCtx.beginPath(); rCtx.arc(0, -30, 9, Math.PI, 0); rCtx.stroke();
    }
    rCtx.restore();
  });
}

function drawDustParticle(d, cam) {
  drawBillboard(d.x, d.y, cam, (sx, sy, scale) => {
    const alpha = Math.max(0, d.life / d.maxLife);
    const radius = Math.max(0.3, d.size * scale * 0.4 * alpha);
    rCtx.beginPath();
    rCtx.arc(sx, sy, radius, 0, Math.PI * 2);
    rCtx.fillStyle = `rgba(200,150,110,${alpha * 0.5})`;
    rCtx.fill();
  });
}

function drawDustDevilObj(dd, cam) {
  drawBillboard(dd.x, dd.y, cam, (sx, sy, scale) => {
    if (scale < 0.15) return;
    for (let i = 0; i < 5; i++) {
      const a = dd.spin + i * 1.3;
      const r = (8 + i * 6) * scale * 0.4;
      const px = sx + Math.cos(a) * r;
      const py = sy - i * 6 * scale * 0.4 + Math.sin(a) * r * 0.5;
      rCtx.beginPath();
      rCtx.arc(px, py, Math.max(0.5, (5 - i * 0.6) * scale * 0.4), 0, Math.PI * 2);
      rCtx.fillStyle = `rgba(200,150,110,${0.18 - i * 0.03})`;
      rCtx.fill();
    }
  });
}

function drawRoverModel() {
  const cx = roverCanvas.width / 2;
  const cy = roverCanvas.height * 0.86;
  const bobY = Math.abs(rover.bob) * 1.2;

  rCtx.beginPath();
  rCtx.ellipse(cx, cy + 34, 60, 14, 0, 0, Math.PI * 2);
  rCtx.fillStyle = 'rgba(0,0,0,0.3)';
  rCtx.fill();

  rCtx.save();
  rCtx.translate(cx, cy - bobY);
  rCtx.rotate(rover.tilt * 0.06);

  rCtx.fillStyle = '#1a1a1a';
  rCtx.fillRect(-52, 10, 30, 20);
  rCtx.fillRect(22, 10, 30, 20);

  const grad = rCtx.createLinearGradient(0, -30, 0, 20);
  grad.addColorStop(0, '#e8e2d4');
  grad.addColorStop(1, '#b8b2a4');
  rCtx.fillStyle = grad;
  rCtx.fillRect(-45, -30, 90, 55);
  rCtx.strokeStyle = '#8a6a4a';
  rCtx.lineWidth = 2;
  rCtx.strokeRect(-45, -30, 90, 55);

  rCtx.fillStyle = '#2a4a6a';
  rCtx.fillRect(-38, -22, 76, 20);

  rCtx.fillStyle = '#b8a888';
  rCtx.fillRect(-6, -55, 12, 28);
  rCtx.beginPath();
  rCtx.arc(0, -58, 8, 0, Math.PI * 2);
  rCtx.fillStyle = '#5ee1ff';
  rCtx.shadowBlur = 14;
  rCtx.shadowColor = '#5ee1ff';
  rCtx.fill();
  rCtx.shadowBlur = 0;

  rCtx.restore();
}

function draw() {
  const cam = getCamera();
  drawSky();
  drawGround(cam);

  const drawables = [
    ...boulders.map(b => ({ y: b.y, draw: () => drawBoulder(b, cam) })),
    ...debris.map(d => ({ y: d.y, draw: () => drawDebrisItem(d, cam) })),
    ...sites.map(s => ({ y: s.y, draw: () => drawSite(s, cam) })),
    ...dustDevils.map(dd => ({ y: dd.y, draw: () => drawDustDevilObj(dd, cam) })),
    ...dustParticles.map(d => ({ y: d.y, draw: () => drawDustParticle(d, cam) })),
  ];
  // painter's algorithm: draw far objects first (approx by forward distance)
  drawables
    .map(o => ({ ...o, fwd: toCameraSpace(0, 0, cam).forward })) // placeholder, replaced below
    .forEach(() => {});
  drawables.sort((a, b) => {
    const fa = toCameraSpace(a.y !== undefined ? 0 : 0, 0, cam); // unused fallback
    return 0;
  });

  // simpler + correct: sort by actual forward distance to camera
  const sorted = [
    ...boulders.map(o => ({ o, type: 'boulder' })),
    ...debris.map(o => ({ o, type: 'debris' })),
    ...sites.map(o => ({ o, type: 'site' })),
    ...dustDevils.map(o => ({ o, type: 'devil' })),
    ...dustParticles.map(o => ({ o, type: 'dust' })),
  ].map(item => {
    const { forward } = toCameraSpace(item.o.x, item.o.y, cam);
    return { ...item, forward };
  }).filter(item => item.forward > 0)
    .sort((a, b) => b.forward - a.forward);

  sorted.forEach(item => {
    if (item.type === 'boulder') drawBoulder(item.o, cam);
    else if (item.type === 'debris') drawDebrisItem(item.o, cam);
    else if (item.type === 'site') drawSite(item.o, cam);
    else if (item.type === 'devil') drawDustDevilObj(item.o, cam);
    else if (item.type === 'dust') drawDustParticle(item.o, cam);
  });

  drawRoverModel();
  drawMinimap();
}

function drawMinimap() {
  mmCtx.clearRect(0, 0, 160, 160);
  mmCtx.fillStyle = 'rgba(255,150,100,0.04)';
  mmCtx.fillRect(0, 0, 160, 160);
  const scale = 160 / WORLD_SIZE;
  const toMap = (x, y) => ({ x: 80 + x * scale, y: 80 + y * scale });
  sites.forEach(s => {
    const m = toMap(s.x, s.y);
    mmCtx.beginPath();
    mmCtx.arc(m.x, m.y, 3, 0, Math.PI * 2);
    mmCtx.fillStyle = s.color;
    mmCtx.fill();
  });
  const rm = toMap(rover.x, rover.y);
  mmCtx.save();
  mmCtx.translate(rm.x, rm.y);
  mmCtx.rotate(rover.angle + Math.PI / 2);
  mmCtx.beginPath();
  mmCtx.moveTo(0, -5); mmCtx.lineTo(4, 5); mmCtx.lineTo(-4, 5);
  mmCtx.closePath();
  mmCtx.fillStyle = '#fff';
  mmCtx.fill();
  mmCtx.restore();
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