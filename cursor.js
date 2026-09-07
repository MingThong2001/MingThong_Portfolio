(() => {
  // Skip entirely on touch devices (no real cursor to replace)
  if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;

  // ---- Inject styles ----
  const style = document.createElement('style');
  style.textContent = `
    html, body, a, button, input, select, textarea,
    .game-btn, .dpad-btn, .carousel-track, .carousel-dot,
    .footer-socials a, .ship-back, .touch-stick, .touch-thrust {
      cursor: none !important;
    }

    #cursor-ball {
      position: fixed;
      top: 0;
      left: 0;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #ffffff, #b9c4e6 60%, #6f7cb3 100%);
      box-shadow: 0 0 12px rgba(255, 255, 255, 0.5), 0 4px 10px rgba(0, 0, 0, 0.4);
      pointer-events: none;
      z-index: 9999;
      transition: width 0.2s ease, height 0.2s ease, transform 0.1s ease;
      will-change: transform;
    }

    #cursor-ball.clicking {
      transform: scale(0.7);
    }

    #cursor-ball.hovering {
      width: 32px;
      height: 32px;
    }
  `;
  document.head.appendChild(style);

  // ---- Create the ball ----
  const ball = document.createElement('div');
  ball.id = 'cursor-ball';
  document.body.appendChild(ball);

  // ---- Mouse tracking with eased "bouncy" follow ----
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let ballX = mouseX;
  let ballY = mouseY;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  window.addEventListener('mousedown', () => ball.classList.add('clicking'));
  window.addEventListener('mouseup', () => ball.classList.remove('clicking'));

  // ---- Grow the ball over clickable elements ----
  const hoverTargets = 'a, button, .carousel-dot, .game-btn, .dpad-btn, input, select, textarea';
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest(hoverTargets)) ball.classList.add('hovering');
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest(hoverTargets)) ball.classList.remove('hovering');
  });

  // ---- Animation loop ----
  function animate() {
    ballX += (mouseX - ballX) * 0.18;
    ballY += (mouseY - ballY) * 0.18;
    ball.style.transform += ''; // keep transition smooth on scale
    ball.style.left = `${ballX - ball.offsetWidth / 2}px`;
    ball.style.top = `${ballY - ball.offsetHeight / 2}px`;
    requestAnimationFrame(animate);
  }
  animate();
})();