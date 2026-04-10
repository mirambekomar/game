(function () {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const levelDisplay = document.getElementById("level-display");
  const pairsDisplay = document.getElementById("pairs-display");
  const resetLinesBtn = document.getElementById("reset-lines-btn");
  const newLevelBtn = document.getElementById("new-level-btn");
  const winModal = document.getElementById("win-modal");
  const modalNextBtn = document.getElementById("modal-next-btn");

  const COLORS = [
    "#F87171",
    "#4ADE80",
    "#60A5FA",
    "#FB923C",
    "#C084FC",
    "#22D3EE",
    "#FACC15",
    "#F472B6",
    "#94A3B8",
  ];

  let width = 0;
  let height = 0;
  let centerX = 0;
  let centerY = 0;
  let radius = 0;
  let dotRadius = 26;
  let minStep = 4;
  let activePointerId = null;

  let dots = [];
  let connections = [];
  let currentDrawing = null;
  let level = 1;
  let numPairs = 3;
  let completedPairs = 0;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function orientation(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function onSegment(a, b, p, eps) {
    return (
      Math.min(a.x, b.x) - eps <= p.x &&
      p.x <= Math.max(a.x, b.x) + eps &&
      Math.min(a.y, b.y) - eps <= p.y &&
      p.y <= Math.max(a.y, b.y) + eps
    );
  }

  function segmentsIntersect(a, b, c, d) {
    const eps = 1e-9;
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);

    if ((o1 > eps && o2 < -eps || o1 < -eps && o2 > eps) &&
        (o3 > eps && o4 < -eps || o3 < -eps && o4 > eps)) {
      return true;
    }

    if (Math.abs(o1) <= eps && onSegment(a, b, c, eps)) return true;
    if (Math.abs(o2) <= eps && onSegment(a, b, d, eps)) return true;
    if (Math.abs(o3) <= eps && onSegment(c, d, a, eps)) return true;
    if (Math.abs(o4) <= eps && onSegment(c, d, b, eps)) return true;
    return false;
  }

  function getPointerPos(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
    };
  }

  function isInsideCircle(point) {
    return Math.hypot(point.x - centerX, point.y - centerY) <= radius;
  }

  function findDotAt(pos) {
    const threshold = dotRadius * 1.7;
    return dots.find((dot) => Math.hypot(dot.x - pos.x, dot.y - pos.y) <= threshold) || null;
  }

  function updatePairsDisplay() {
    pairsDisplay.textContent = `${completedPairs}/${numPairs}`;
    levelDisplay.textContent = String(level);
  }

  function resizeCanvas() {
    const size = Math.min(window.innerWidth * 0.95, window.innerHeight * 0.56);
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = Math.max(1, Math.round(size * dpr));
    canvas.height = Math.max(1, Math.round(size * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    width = size;
    height = size;
    centerX = width / 2;
    centerY = height / 2;
    radius = size * 0.465;
    dotRadius = Math.max(17, Math.min(26, size * 0.05));
    minStep = Math.max(3, size * 0.0075);
  }

  function generatePositions(count) {
    const borderPadding = dotRadius + 12;
    let minDist = Math.max(dotRadius * 2.1, radius * 0.22);

    for (let restart = 0; restart < 12; restart++) {
      const result = [];
      let failed = false;

      for (let i = 0; i < count; i++) {
        let placed = false;
        for (let attempt = 0; attempt < 500; attempt++) {
          const angle = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * (radius - borderPadding);
          const candidate = {
            x: centerX + Math.cos(angle) * r,
            y: centerY + Math.sin(angle) * r,
          };
          if (result.every((dot) => distance(dot, candidate) >= minDist)) {
            result.push(candidate);
            placed = true;
            break;
          }
        }
        if (!placed) {
          failed = true;
          break;
        }
      }

      if (!failed) return result;
      minDist *= 0.88;
    }

    const fallback = [];
    const ringR = radius * 0.62;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.18;
      fallback.push({
        x: centerX + Math.cos(a) * ringR,
        y: centerY + Math.sin(a) * ringR,
      });
    }
    return shuffle(fallback);
  }

  function setupLevel() {
    currentDrawing = null;
    connections = [];
    completedPairs = 0;
    numPairs = Math.min(3 + Math.floor(level / 2), COLORS.length);
    updatePairsDisplay();
    winModal.classList.add("hidden");

    const totalDots = numPairs * 2;
    const positions = generatePositions(totalDots);
    const palette = shuffle(COLORS.slice()).slice(0, numPairs);
    const dotColors = shuffle(palette.flatMap((color) => [color, color]));

    dots = positions.map((pos, index) => ({
      id: index,
      x: pos.x,
      y: pos.y,
      color: dotColors[index],
    }));
  }

  function markCompleted() {
    completedPairs = connections.length;
    updatePairsDisplay();
    if (completedPairs === numPairs) {
      window.setTimeout(() => winModal.classList.remove("hidden"), 260);
    }
  }

  function lineCrossesExisting(a, b) {
    for (const conn of connections) {
      for (let i = 0; i < conn.path.length - 1; i++) {
        if (segmentsIntersect(a, b, conn.path[i], conn.path[i + 1])) {
          return true;
        }
      }
    }
    return false;
  }

  function lineCrossesCurrentPath(a, b) {
    if (!currentDrawing || currentDrawing.path.length < 3) return false;
    for (let i = 0; i < currentDrawing.path.length - 2; i++) {
      if (segmentsIntersect(a, b, currentDrawing.path[i], currentDrawing.path[i + 1])) {
        return true;
      }
    }
    return false;
  }

  function handleStart(event) {
    const pos = getPointerPos(event);
    const dot = findDotAt(pos);
    if (!dot) return;

    connections = connections.filter((conn) => conn.color !== dot.color);
    completedPairs = connections.length;
    updatePairsDisplay();

    currentDrawing = {
      color: dot.color,
      startDot: dot,
      path: [{ x: dot.x, y: dot.y }],
      invalid: false,
    };
  }

  function handleMove(event) {
    if (!currentDrawing) return;
    const pos = getPointerPos(event);
    const last = currentDrawing.path[currentDrawing.path.length - 1];

    if (!isInsideCircle(pos)) {
      currentDrawing.invalid = true;
      return;
    }

    if (distance(last, pos) < minStep) return;

    if (lineCrossesExisting(last, pos) || lineCrossesCurrentPath(last, pos)) {
      currentDrawing.invalid = true;
      return;
    }

    currentDrawing.path.push(pos);
    currentDrawing.invalid = false;
  }

  function handleEnd(event) {
    if (!currentDrawing) return;

    const releasePos = getPointerPos(event);
    const last = currentDrawing.path[currentDrawing.path.length - 1];
    if (isInsideCircle(releasePos) && distance(last, releasePos) >= minStep) {
      if (!lineCrossesExisting(last, releasePos) && !lineCrossesCurrentPath(last, releasePos)) {
        currentDrawing.path.push(releasePos);
      } else {
        currentDrawing.invalid = true;
      }
    }

    const endDot = findDotAt(releasePos);
    if (
      !currentDrawing.invalid &&
      endDot &&
      endDot.color === currentDrawing.color &&
      endDot.id !== currentDrawing.startDot.id
    ) {
      currentDrawing.path.push({ x: endDot.x, y: endDot.y });
      connections.push({
        color: currentDrawing.color,
        path: currentDrawing.path.slice(),
      });
      markCompleted();
    }

    currentDrawing = null;
  }

  function drawCircleBase() {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.14)";
    ctx.lineWidth = 15;
    ctx.stroke();
  }

  function drawConnections() {
    const all = currentDrawing ? connections.concat(currentDrawing) : connections;
    const lineWidth = Math.max(12, width * 0.032);
    for (const conn of all) {
      if (!conn || conn.path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(conn.path[0].x, conn.path[0].y);
      for (let i = 1; i < conn.path.length; i++) {
        ctx.lineTo(conn.path[i].x, conn.path[i].y);
      }
      ctx.strokeStyle = conn.invalid ? "#ef4444" : conn.color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (conn === currentDrawing) {
        ctx.globalAlpha = 0.6;
      } else {
        ctx.shadowBlur = 22;
        ctx.shadowColor = conn.color;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  function drawDots() {
    for (const dot of dots) {
      const isConnected = connections.some((conn) => conn.color === dot.color);
      const isCurrent = currentDrawing && currentDrawing.color === dot.color;

      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dotRadius + 14, 0, Math.PI * 2);
      ctx.fillStyle = "#020617";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = dot.color;
      if (isConnected || isCurrent) {
        ctx.shadowBlur = 28;
        ctx.shadowColor = dot.color;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.52)";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    drawCircleBase();
    drawConnections();
    drawDots();
    requestAnimationFrame(draw);
  }

  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      activePointerId = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      handleStart(event);
      event.preventDefault();
    },
    { passive: false }
  );

  window.addEventListener(
    "pointermove",
    (event) => {
      if (activePointerId !== event.pointerId) return;
      handleMove(event);
      event.preventDefault();
    },
    { passive: false }
  );

  window.addEventListener(
    "pointerup",
    (event) => {
      if (activePointerId !== event.pointerId) return;
      handleEnd(event);
      activePointerId = null;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      event.preventDefault();
    },
    { passive: false }
  );

  window.addEventListener("pointercancel", (event) => {
    if (activePointerId !== event.pointerId) return;
    activePointerId = null;
    currentDrawing = null;
  });

  resetLinesBtn.addEventListener("click", () => {
    connections = [];
    completedPairs = 0;
    currentDrawing = null;
    updatePairsDisplay();
  });

  newLevelBtn.addEventListener("click", setupLevel);

  modalNextBtn.addEventListener("click", () => {
    level += 1;
    setupLevel();
  });

  window.addEventListener("resize", () => {
    resizeCanvas();
    setupLevel();
  });

  function init() {
    resizeCanvas();
    setupLevel();
    draw();
  }

  init();
})();
