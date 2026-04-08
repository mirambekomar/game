(function () {
  "use strict";

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const pairSelect = document.getElementById("pairCount");
  const newGameBtn = document.getElementById("newGame");

  const PALETTE = [
    "#e74c3c",
    "#3498db",
    "#2ecc71",
    "#9b59b6",
    "#f39c12",
    "#1abc9c",
    "#e91e63",
    "#00bcd4",
    "#ff9800",
    "#8bc34a",
  ];

  let dpr = 1;
  let cx = 0;
  let cy = 0;
  let radius = 0;
  let dotR = 14;
  let dots = [];
  let edges = [];
  let selectedIndex = null;
  let pointerInside = null;
  let lastPointer = null;

  function randomInt(n) {
    return Math.floor(Math.random() * n);
  }

  /**
   * Случайное идеальное сопоставление без пересечений на выпуклом многоугольнике
   * (рекурсия по порядку вершин по кругу).
   */
  function generateNonCrossingMatching(pts) {
    if (pts.length === 0) return [];
    if (pts.length === 2) return [[pts[0], pts[1]]];
    const first = pts[0];
    const candidates = [];
    for (let i = 1; i < pts.length; i += 2) {
      candidates.push(pts[i]);
    }
    const partner = candidates[randomInt(candidates.length)];
    const pi = pts.indexOf(partner);
    const left = pts.slice(1, pi);
    const right = pts.slice(pi + 1);
    return [[first, partner], ...generateNonCrossingMatching(left), ...generateNonCrossingMatching(right)];
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildDots(pairCount) {
    const n = pairCount * 2;
    const cyclicOrder = shuffleInPlace(Array.from({ length: n }, (_, i) => i));
    const pairs = generateNonCrossingMatching(cyclicOrder);
    const colorOf = new Array(n);
    pairs.forEach((pair, i) => {
      const c = i % PALETTE.length;
      colorOf[pair[0]] = c;
      colorOf[pair[1]] = c;
    });

    const base = (Math.PI * 2) / n;
    const jitter = base * 0.12;
    const angleAtIndex = cyclicOrder.map((_, k) => {
      const t = k * base + (Math.random() * 2 - 1) * jitter;
      return t + Math.random() * Math.PI * 2 * 0.06;
    });
    const rotate = Math.random() * Math.PI * 2;
    for (let k = 0; k < n; k++) angleAtIndex[k] += rotate;

    const slotToAngle = new Array(n);
    for (let k = 0; k < n; k++) {
      slotToAngle[cyclicOrder[k]] = angleAtIndex[k];
    }

    dots = Array.from({ length: n }, (_, slot) => ({
      slot,
      colorIndex: colorOf[slot],
      x: 0,
      y: 0,
      angle: slotToAngle[slot],
      connected: false,
    }));

    edges = [];
    selectedIndex = null;
    pointerInside = null;
    lastPointer = null;
  }

  function orient(ax, ay, bx, by, cx, cy) {
    return (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  }

  function onSegment(ax, ay, bx, by, px, py, eps) {
    return (
      Math.min(ax, bx) - eps <= px &&
      px <= Math.max(ax, bx) + eps &&
      Math.min(ay, by) - eps <= py &&
      py <= Math.max(ay, by) + eps
    );
  }

  /** Отрезки [a,b] и [c,d], концы не совпадают между отрезками. */
  function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const eps = 1e-9;
    const o1 = orient(ax, ay, bx, by, cx, cy);
    const o2 = orient(ax, ay, bx, by, dx, dy);
    const o3 = orient(cx, cy, dx, dy, ax, ay);
    const o4 = orient(cx, cy, dx, dy, bx, by);

    if (o1 * o2 < -eps && o3 * o4 < -eps) return true;

    if (Math.abs(o1) < eps && onSegment(ax, ay, bx, by, cx, cy, eps)) return true;
    if (Math.abs(o2) < eps && onSegment(ax, ay, bx, by, dx, dy, eps)) return true;
    if (Math.abs(o3) < eps && onSegment(cx, cy, dx, dy, ax, ay, eps)) return true;
    if (Math.abs(o4) < eps && onSegment(cx, cy, dx, dy, bx, by, eps)) return true;

    return false;
  }

  function edgeCrossesAny(ax, ay, bx, by) {
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const da = dots[e.a];
      const db = dots[e.b];
      if (segmentsIntersect(ax, ay, bx, by, da.x, da.y, db.x, db.y)) return true;
    }
    return false;
  }

  function hitDot(px, py) {
    const rHit = dotR * 1.35;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < dots.length; i++) {
      if (dots[i].connected) continue;
      const dx = px - dots[i].x;
      const dy = py - dots[i].y;
      const d = dx * dx + dy * dy;
      if (d <= rHit * rHit && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.classList.remove("is-error", "is-win");
    if (kind === "error") statusEl.classList.add("is-error");
    if (kind === "win") statusEl.classList.add("is-win");
  }

  function tryConnect(i, j) {
    if (i === j) return;
    const a = dots[i];
    const b = dots[j];
    if (a.connected || b.connected) {
      setStatus("Эти точки уже соединены.", "error");
      return;
    }
    if (a.colorIndex !== b.colorIndex) {
      setStatus("Нужно соединить точки одного цвета.", "error");
      return;
    }
    if (edgeCrossesAny(a.x, a.y, b.x, b.y)) {
      setStatus("Линии не должны пересекаться.", "error");
      return;
    }
    edges.push({ a: i, b: j, colorIndex: a.colorIndex });
    a.connected = true;
    b.connected = true;
    selectedIndex = null;
    setStatus("Отлично! Продолжайте.");
    if (edges.length === dots.length / 2) {
      setStatus("Готово! Все пары соединены без пересечений.", "win");
    }
    draw();
  }

  function layout() {
    const wrap = canvas.parentElement;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cx = w / 2;
    cy = h / 2;
    radius = Math.min(w, h) * 0.36;
    dotR = Math.max(10, Math.min(16, Math.min(w, h) * 0.035));

    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      d.x = cx + Math.cos(d.angle) * radius;
      d.y = cy + Math.sin(d.angle) * radius;
    }
  }

  function draw() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(128, 150, 180, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const da = dots[e.a];
      const db = dots[e.b];
      ctx.strokeStyle = PALETTE[e.colorIndex % PALETTE.length];
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.moveTo(da.x, da.y);
      ctx.lineTo(db.x, db.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (selectedIndex !== null && lastPointer) {
      const s = dots[selectedIndex];
      ctx.strokeStyle = PALETTE[s.colorIndex % PALETTE.length];
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(lastPointer.x, lastPointer.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      const col = PALETTE[d.colorIndex % PALETTE.length];
      ctx.beginPath();
      ctx.arc(d.x, d.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = d.connected ? col + "aa" : col;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (i === selectedIndex) {
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(d.x, d.y, dotR + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function canvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return { x, y };
  }

  function onDown(clientX, clientY) {
    const { x, y } = canvasCoords(clientX, clientY);
    lastPointer = { x, y };
    const idx = hitDot(x, y);
    if (idx < 0) {
      selectedIndex = null;
      setStatus("Коснитесь свободной точки.");
      draw();
      return;
    }

    if (selectedIndex === null) {
      selectedIndex = idx;
      setStatus("Выберите вторую точку того же цвета.");
      draw();
      return;
    }

    if (selectedIndex === idx) {
      selectedIndex = null;
      setStatus("Выбор отменён. Коснитесь первой точки пары.");
      draw();
      return;
    }

    tryConnect(selectedIndex, idx);
  }

  function onMove(clientX, clientY) {
    if (selectedIndex === null) return;
    lastPointer = canvasCoords(clientX, clientY);
    draw();
  }

  function onUp() {
    pointerInside = null;
  }

  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      pointerInside = e.pointerId;
      onDown(e.clientX, e.clientY);
      e.preventDefault();
    },
    { passive: false }
  );

  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (pointerInside !== e.pointerId && e.buttons === 0) return;
      if (selectedIndex !== null) {
        onMove(e.clientX, e.clientY);
        e.preventDefault();
      }
    },
    { passive: false }
  );

  canvas.addEventListener("pointerup", (e) => {
    if (pointerInside === e.pointerId) {
      canvas.releasePointerCapture(e.pointerId);
    }
    onUp();
  });

  canvas.addEventListener("pointercancel", () => {
    onUp();
  });

  /** Явная поддержка тачскрина: touch-события + preventDefault для скролла. */
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      onDown(t.clientX, t.clientY);
      e.preventDefault();
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (selectedIndex === null || e.touches.length !== 1) return;
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
      e.preventDefault();
    },
    { passive: false }
  );

  canvas.addEventListener("touchend", (e) => {
    if (e.touches.length === 0) lastPointer = null;
  });

  function startGame() {
    const n = parseInt(pairSelect.value, 10) || 5;
    buildDots(n);
    layout();
    setStatus("Коснитесь первой точки пары.");
    draw();
  }

  newGameBtn.addEventListener("click", startGame);

  window.addEventListener("resize", () => {
    if (!dots.length) return;
    layout();
    draw();
  });

  startGame();
})();
