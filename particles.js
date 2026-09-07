(function () {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return; // this page has no particle background — do nothing

  const ctx = canvas.getContext('2d');

  let particles = [];
  let mouse = { x: null, y: null, prevX: null, prevY: null, active: false, vx: 0, vy: 0, speed: 0, idleTime: 0 };

  function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', () => {
      resizeCanvas();
      initDust();
  });

  class Dust {
      constructor() {
          this.x = Math.random() * canvas.width;
          this.y = Math.random() * canvas.height;

          // gentle ambient drift, unique per particle
          this.vx = (Math.random() - 0.5) * 0.15;
          this.vy = (Math.random() - 0.5) * 0.15;

          // a slow independent orbital wobble so drift isn't pure straight lines
          this.wobbleAngle = Math.random() * Math.PI * 2;
          this.wobbleSpeed = 0.002 + Math.random() * 0.004;
          this.wobbleRadius = Math.random() * 0.05;

          this.size = Math.random() * 1.6 + 0.4;
          this.isBig = Math.random() < 0.04; // rare larger "distant star" particles
          if (this.isBig) this.size = Math.random() * 2 + 2.5;

          this.baseAlpha = this.isBig ? Math.random() * 0.4 + 0.4 : Math.random() * 0.5 + 0.2;
          this.twinkleSpeed = Math.random() * 0.02 + 0.005;
          this.twinklePhase = Math.random() * Math.PI * 2;

          // slow fade in/out cycle for "distant star" particles
          this.fadeSpeed = 0.15 + Math.random() * 0.3; // used only if isBig
          this.fadePhase = Math.random() * Math.PI * 2;
      }

      update() {
          // ambient orbital wobble added to base drift
          this.wobbleAngle += this.wobbleSpeed;
          const wobbleX = Math.cos(this.wobbleAngle) * this.wobbleRadius;
          const wobbleY = Math.sin(this.wobbleAngle) * this.wobbleRadius;

          // cursor influence
          if (mouse.active) {
              const dx = mouse.x - this.x;
              const dy = mouse.y - this.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const influenceRadius = 160;

              if (dist < influenceRadius && dist > 0.01) {
                  const nx = dx / dist;
                  const ny = dy / dist;
                  const strength = 1 - dist / influenceRadius;

                  if (mouse.speed > 4) {
                      // fast movement: push particles into a swirling wake behind the cursor
                      const perpX = -ny;
                      const perpY = nx;
                      const swirl = strength * 0.35;
                      this.vx += (-nx * 0.05 + perpX * swirl) * strength;
                      this.vy += (-ny * 0.05 + perpY * swirl) * strength;
                  } else if (mouse.speed > 0.3) {
                      // slow movement: gentle orbit around the cursor
                      const perpX = -ny;
                      const perpY = nx;
                      this.vx += (perpX * 0.06 + nx * 0.015) * strength;
                      this.vy += (perpY * 0.06 + ny * 0.015) * strength;
                  } else {
                      // cursor idle: weak gravitational pull inward
                      const pull = strength * 0.02 * Math.min(mouse.idleTime / 40, 1);
                      this.vx += nx * pull;
                      this.vy += ny * pull;
                  }
              }
          }

          // damping/friction so motion has momentum but settles rather than accelerating forever
          this.vx *= 0.96;
          this.vy *= 0.96;

          this.x += this.vx + wobbleX;
          this.y += this.vy + wobbleY;

          // wrap around edges so the field feels infinite
          if (this.x < -10) this.x = canvas.width + 10;
          if (this.x > canvas.width + 10) this.x = -10;
          if (this.y < -10) this.y = canvas.height + 10;
          if (this.y > canvas.height + 10) this.y = -10;

          // twinkle
          this.twinklePhase += this.twinkleSpeed;
      }

      draw(time) {
          let alpha = this.baseAlpha + Math.sin(this.twinklePhase) * 0.25;

          if (this.isBig) {
              // slow fade in/out for distant-star particles
              alpha = this.baseAlpha * (0.5 + 0.5 * Math.sin(time * this.fadeSpeed * 0.001 + this.fadePhase));
          }

          alpha = Math.max(0, Math.min(1, alpha));

          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(210, 220, 255, ${alpha})`;
          if (this.isBig) {
              ctx.shadowBlur = 6;
              ctx.shadowColor = `rgba(210, 220, 255, ${alpha * 0.8})`;
          } else {
              ctx.shadowBlur = 0;
          }
          ctx.fill();
      }
  }

  function initDust() {
      particles = [];
      const count = Math.floor((canvas.width * canvas.height) / 2200);
      for (let i = 0; i < count; i++) {
          particles.push(new Dust());
      }
  }
  initDust();

  function animate(time) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // decay cursor speed each frame toward 0 when not moving, and track idle time
      mouse.speed *= 0.85;
      if (mouse.active) {
          mouse.idleTime++;
      }

      particles.forEach(p => {
          p.update();
          p.draw(time);
      });

      requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // track mouse across the WHOLE page now, not just one section
  window.addEventListener('mousemove', (e) => {
      const newX = e.clientX;
      const newY = e.clientY;

      if (mouse.prevX !== null) {
          const dx = newX - mouse.prevX;
          const dy = newY - mouse.prevY;
          mouse.speed = Math.sqrt(dx * dx + dy * dy);
          mouse.vx = dx;
          mouse.vy = dy;
      }

      mouse.prevX = newX;
      mouse.prevY = newY;
      mouse.x = newX;
      mouse.y = newY;
      mouse.active = true;
      mouse.idleTime = 0; // moving resets idle timer
  });

  document.addEventListener('mouseleave', () => {
      mouse.active = false;
      mouse.prevX = null;
      mouse.prevY = null;
      mouse.speed = 0;
      mouse.idleTime = 0;
  });
})();