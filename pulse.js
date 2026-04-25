(function () {
  "use strict";

  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    if (typeof tg.disableVerticalSwipes === "function") {
      tg.disableVerticalSwipes();
    }
  }

  document.addEventListener(
    "touchmove",
    function (e) {
      if (e.touches.length === 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  const canvas = document.getElementById("pulseCanvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("pulse-score");
  const timeEl = document.getElementById("pulse-time");
  const comboEl = document.getElementById("pulse-combo");
  const startBtn = document.getElementById("pulse-start-btn");
  const modal = document.getElementById("pulse-modal");
  const modalTitle = document.getElementById("pulse-modal-title");
  const modalText = document.getElementById("pulse-modal-text");
  const modalRetry = document.getElementById("pulse-modal-retry");

  const COLORS = ["#22d3ee", "#4ade80", "#f472b6", "#fbbf24", "#a78bfa", "#fb923c"];
  const DURATION_MS = 700;
  const ROUND_SECONDS = 45;
  const STORAGE_KEY = "pulseHighScore";

  let width = 0;
  let height = 0;
  let dpr = 1;

  let playing = false;
  let timeLeft = ROUND_SECONDS;
  let lastTick = 0;
  let score = 0;
  let combo = 1;
  let highScore = 0;

  let targets = [];
  let spawnAccumulator = 0;
  let rafId = 0;

  function loadHigh() {
    try {
      const v = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
      highScore = Number.isFinite(v) ? v : 0;
    } catch {
      highScore = 0;
    }
  }

  function saveHigh() {
    try {
      if (score > highScore) {
        highScore = score;
        localStorage.setItem(STORAGE_KEY, String(highScore));
      }
    } catch {
      /* ignore */
    }
  }

  function resizeCanvas() {
    const maxW = window.innerWidth * 0.95;
    const maxH = window.innerHeight * 0.5;
    const size = Math.min(maxW, maxH, 420);
    dpr = window.devicePixelRatio || 1;

    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = Math.max(1, Math.round(size * dpr));
    canvas.height = Math.max(1, Math.round(size * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    width = size;
    height = size;
  }

  function randomTarget() {
    const margin = 36;
    const r = 22 + Math.random() * 10;
    return {
      x: margin + Math.random() * (width - margin * 2),
      y: margin + Math.random() * (height - margin * 2),
      r,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      born: performance.now(),
      duration: Math.max(320, DURATION_MS - Math.min(280, score * 4)),
      hit: false,
    };
  }

  function updateUI() {
    scoreEl.textContent = String(score);
    timeEl.textContent = String(Math.ceil(timeLeft));
    comboEl.textContent = `×${combo}`;
  }

  function pointerToLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height,
    };
  }

  function tryHit(clientX, clientY) {
    if (!playing) return;
    const p = pointerToLogical(clientX, clientY);
    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i];
      if (t.hit) continue;
      const dist = Math.hypot(p.x - t.x, p.y - t.y);
      if (dist <= t.r * 1.15) {
        t.hit = true;
        score += combo;
        combo = Math.min(8, combo + 1);
        updateUI();
        return;
      }
    }
    combo = 1;
    updateUI();
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
    ctx.lineWidth = 2;
    const step = 40;
    for (let x = 0; x <= width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    for (const t of targets) {
      if (t.hit) continue;
      const elapsed = now - t.born;
      const life = Math.max(0, 1 - elapsed / t.duration);
      if (life <= 0) continue;

      const pulse = 0.85 + 0.15 * Math.sin(elapsed * 0.02);
      const radius = t.r * life * pulse;

      ctx.beginPath();
      ctx.arc(t.x, t.y, radius + 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(2, 6, 23, 0.6)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = t.color;
      ctx.globalAlpha = 0.35 + life * 0.65;
      ctx.shadowBlur = 16;
      ctx.shadowColor = t.color;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function frame(now) {
    tick(now);
    if (!playing) return;
    draw(now);
    rafId = requestAnimationFrame(frame);
  }

  function tick(now) {
    if (!playing) return;

    if (!lastTick) lastTick = now;
    const dt = (now - lastTick) / 1000;
    lastTick = now;

    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame();
      return;
    }

    spawnAccumulator += dt;
    const interval = Math.max(0.35, 1.1 - score * 0.012);
    while (spawnAccumulator >= interval) {
      spawnAccumulator -= interval;
      targets.push(randomTarget());
      if (targets.length > 12) targets.shift();
    }

    let expired = false;
    targets = targets.filter((t) => {
      if (t.hit) return false;
      const elapsed = now - t.born;
      if (elapsed >= t.duration) {
        expired = true;
        return false;
      }
      return true;
    });

    if (expired) {
      combo = 1;
      updateUI();
    }

    timeEl.textContent = String(Math.ceil(timeLeft));
  }

  function endGame() {
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    saveHigh();
    modalTitle.textContent = timeLeft <= 0 ? "Время!" : "Пауза";
    const best = Math.max(score, highScore);
    modalText.textContent =
      score >= highScore && score > 0
        ? `Счёт: ${score} — новый рекорд!`
        : `Счёт: ${score}. Рекорд: ${best}.`;
    modal.classList.remove("hidden");
    startBtn.textContent = "Старт";
  }

  function startGame() {
    modal.classList.add("hidden");
    playing = true;
    timeLeft = ROUND_SECONDS;
    lastTick = 0;
    score = 0;
    combo = 1;
    targets = [];
    spawnAccumulator = 0;
    loadHigh();
    updateUI();
    startBtn.textContent = "Идёт игра";
    lastTick = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      tryHit(e.clientX, e.clientY);
      e.preventDefault();
    },
    { passive: false }
  );

  startBtn.addEventListener("click", () => {
    if (playing) return;
    startGame();
  });

  modalRetry.addEventListener("click", () => {
    startGame();
  });

  window.addEventListener("resize", () => {
    resizeCanvas();
    draw(performance.now());
  });

  loadHigh();
  resizeCanvas();
  updateUI();
  draw(performance.now());
})();
