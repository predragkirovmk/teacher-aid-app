"use strict";

(() => {
  const BOSS = "PROF.OLDSCHOOL";
  const QUESTION = "What beats the old education system?";
  const MOVES = [
    { label: "Memorize 400 pages", right: false },
    { label: "More homework", right: false },
    { label: "Learning by playing", right: true },
    { label: "TeacherAid", right: true },
  ];

  const $ = (id) => document.getElementById(id);
  const game = $("game");
  const title = $("title");
  const startLabel = $("start");
  const scare = $("scare");
  const scareImg = $("scare-img");
  const pix = $("pix");
  const prof = $("prof");
  const hp = $("hp");
  const flash = $("flash");
  const dialog = $("dialog");
  const live = $("live");
  const moves = $("moves");
  const win = $("win");

  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // Vibration only exists on Android browsers, and only after a tap.
  const buzz = (pattern) => {
    try {
      navigator.vibrate?.(pattern);
    } catch {}
  };

  /* ---------- sound: everything is synthesized, nothing to download ---------- */
  let ac;
  function audio() {
    if (!ac) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) ac = new Ctx();
    }
    if (ac?.state === "suspended") ac.resume();
    return ac;
  }

  function noise(seconds) {
    const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  function tone(freq, at, dur, type = "square", vol = 0.1, toFreq) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, at + dur);
    gain.gain.setValueAtTime(vol, at);
    gain.gain.setValueAtTime(vol, at + dur * 0.75);
    gain.gain.linearRampToValueAtTime(0, at + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(at);
    osc.stop(at + dur);
  }

  function scream() {
    if (!audio()) return;
    const t = ac.currentTime;
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.8, t + 0.02);
    out.gain.setValueAtTime(0.8, t + 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    const drive = ac.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i * 2) / curve.length - 1;
      curve[i] = (61 * x) / (1 + 60 * Math.abs(x));
    }
    drive.curve = curve;
    drive.connect(out).connect(ac.destination);

    for (const detune of [0, 37]) {
      const osc = ac.createOscillator();
      const lfo = ac.createOscillator();
      const depth = ac.createGain();
      const level = ac.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(980 + detune, t);
      osc.frequency.exponentialRampToValueAtTime(380, t + 0.95);
      lfo.frequency.value = 27;
      depth.gain.value = 90;
      level.gain.value = 0.22;
      lfo.connect(depth).connect(osc.frequency);
      osc.connect(level).connect(drive);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + 1);
      lfo.stop(t + 1);
    }

    const hiss = noise(1);
    const band = ac.createBiquadFilter();
    const level = ac.createGain();
    band.type = "bandpass";
    band.frequency.value = 1800;
    band.Q.value = 0.8;
    level.gain.value = 0.45;
    hiss.connect(band).connect(level).connect(out);
    hiss.start(t);
  }

  function hitSound() {
    if (!audio()) return;
    const t = ac.currentTime;
    const crack = noise(0.2);
    const low = ac.createBiquadFilter();
    const level = ac.createGain();
    low.type = "lowpass";
    low.frequency.setValueAtTime(4000, t);
    low.frequency.exponentialRampToValueAtTime(200, t + 0.2);
    level.gain.setValueAtTime(0.5, t);
    level.gain.linearRampToValueAtTime(0, t + 0.2);
    crack.connect(low).connect(level).connect(ac.destination);
    crack.start(t);
    tone(420, t, 0.18, "square", 0.12, 90);
  }

  function missSound() {
    if (!audio()) return;
    tone(330, ac.currentTime, 0.12, "square", 0.1);
    tone(196, ac.currentTime + 0.12, 0.22, "square", 0.1);
  }

  function faintSound() {
    if (!audio()) return;
    tone(700, ac.currentTime, 0.5, "square", 0.09, 80);
  }

  function fanfare() {
    if (!audio()) return;
    const t = ac.currentTime;
    const notes = [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.3], [784, 0.1], [1047, 0.55]];
    let at = t;
    for (const [freq, dur] of notes) {
      tone(freq, at, dur, "square", 0.09);
      at += dur;
    }
    tone(131, t, 0.6, "triangle", 0.18);
    tone(196, t + 0.6, 0.65, "triangle", 0.18);
  }

  /* ---------- dialog ---------- */
  let typer;
  function say(text) {
    clearInterval(typer);
    live.textContent = text;
    dialog.textContent = "";
    // Characters follow elapsed time, so throttled timers cannot stretch the 10-second budget.
    const t0 = performance.now();
    return new Promise((resolve) => {
      typer = setInterval(() => {
        const i = Math.floor((performance.now() - t0) / 18);
        dialog.textContent = text.slice(0, i);
        if (i >= text.length) {
          clearInterval(typer);
          resolve();
        }
      }, 18);
    });
  }

  /* ---------- the scare turns into pixels ---------- */
  async function pixelate() {
    const w = innerWidth;
    const h = innerHeight;
    const rect = scareImg.getBoundingClientRect();
    pix.width = w;
    pix.height = h;
    const ctx = pix.getContext("2d");
    const small = document.createElement("canvas");
    const sctx = small.getContext("2d");
    scare.classList.add("pix");
    for (const block of [6, 12, 24, 48]) {
      small.width = Math.ceil(w / block);
      small.height = Math.ceil(h / block);
      sctx.fillStyle = "#2a0000";
      sctx.fillRect(0, 0, small.width, small.height);
      sctx.drawImage(scareImg, rect.left / block, rect.top / block, rect.width / block, rect.height / block);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, small.width * block, small.height * block);
      await wait(60);
    }
  }

  /* ---------- flow ---------- */
  let busy = false;
  let anims = [];

  function zoomOut() {
    if (calm) return;
    const box = game.getBoundingClientRect();
    const face = prof.getBoundingClientRect();
    game.style.transformOrigin = `${face.left - box.left + face.width * 0.45}px ${face.top - box.top + face.height * 0.36}px`;
    game.animate([{ transform: "scale(5)" }, { transform: "scale(1)" }], {
      duration: 750,
      easing: "cubic-bezier(.16,1,.3,1)",
    });
  }

  function renderMoves() {
    moves.replaceChildren();
    const order = [...MOVES].sort(() => Math.random() - 0.5);
    order.forEach((move, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "move px-box";
      button.style.setProperty("--i", i);
      button.textContent = move.label;
      button.addEventListener("click", () => choose(button, move));
      moves.append(button);
    });
  }

  async function start() {
    if (busy) return;
    busy = true;
    buzz([260, 40, 260, 40, 360]);
    scream();
    title.hidden = true;
    scare.classList.add("on");
    await wait(1000);
    await pixelate();

    scare.classList.remove("on", "pix");
    game.classList.add("live");
    zoomOut();
    await say(`A wild ${BOSS} appeared!`);
    await wait(420);
    moves.classList.add("on");
    busy = false;
    say(QUESTION);
  }

  async function choose(button, move) {
    if (busy) return;
    busy = true;
    const name = move.label.toUpperCase();

    if (!move.right) {
      button.classList.add("wrong");
      button.disabled = true;
      missSound();
      buzz(120);
      game.classList.remove("shake");
      void game.offsetWidth;
      game.classList.add("shake");
      anims.push(prof.animate([{ transform: "scale(1)" }, { transform: "scale(1.08) translateY(3%)" }, { transform: "scale(1)" }], { duration: 260 }));
      say(`${name}! It's not very effective...`);
      await wait(280);
      busy = false;
      return;
    }

    button.classList.add("right");
    for (const b of moves.children) b.disabled = true;
    hitSound();
    buzz([40, 30, 40]);
    flash.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 220 });
    anims.push(prof.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }, { opacity: 0 }, { opacity: 1 }], { duration: 480, easing: "steps(1, end)" }));
    say(`${name}! It's super effective!`);
    await drainHp(850);
    await wait(150);

    faintSound();
    anims.push(
      prof.animate(
        [
          { transform: "translateY(0)", clipPath: "inset(0 0 0 0)" },
          { transform: "translateY(100%)", clipPath: "inset(0 0 100% 0)" },
        ],
        { duration: calm ? 1 : 450, easing: "ease-in", fill: "forwards" },
      ),
    );
    await say(`${BOSS} fainted!`);
    await wait(380);
    showWin();
    busy = false;
  }

  function drainHp(duration) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        const left = Math.max(0, 1 - (now - t0) / duration);
        // Pokemon bars move in chunks, not smoothly.
        const pct = Math.ceil(left * 24) / 24;
        hp.style.width = `${pct * 100}%`;
        hp.style.background = pct > 0.5 ? "var(--hp-hi)" : pct > 0.2 ? "var(--hp-mid)" : "var(--hp-lo)";
        if (left > 0) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- win ---------- */
  const BADGE = [
    "....RRR.BBB....",
    "....RRR.BBB....",
    ".....RRRBB.....",
    "......RBB......",
    ".....kkkkk.....",
    "...kkGGGGGkk...",
    "..kGGYYYYYGGk..",
    "..kGYWWYYYYGk..",
    ".kGYWYYYYYYYGk.",
    ".kGYYYYYYYYYGk.",
    ".kGYYYYYYYYYGk.",
    "..kGYYYYYYYGk..",
    "..kGGYYYYYGGk..",
    "...kkGGGGGkk...",
    ".....kkkkk.....",
  ];
  const BADGE_COLORS = { R: "#e8463b", B: "#3a6fe0", k: "#1c1626", G: "#c98a1a", Y: "#f5c034", W: "#fff6c8" };

  function buildWin() {
    const rects = [];
    BADGE.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (BADGE_COLORS[ch]) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${BADGE_COLORS[ch]}"/>`);
      }),
    );
    $("badge").innerHTML = `<svg viewBox="0 0 15 15" shape-rendering="crispEdges">${rects.join("")}</svg>`;

    const heading = $("win-title");
    const text = heading.textContent;
    heading.setAttribute("aria-label", text);
    heading.innerHTML = [...text].map((ch, i) => `<span style="--i:${i}" aria-hidden="true">${ch}</span>`).join("");

    const colors = ["#f5c034", "#e8463b", "#3ad35a", "#5aa9ff", "#fbf6e4"];
    $("confetti").innerHTML = Array.from({ length: 28 }, (_, i) => {
      const style = [
        `left:${Math.random() * 100}%`,
        `--c:${colors[i % colors.length]}`,
        `--d:${(1.8 + Math.random() * 1.6).toFixed(2)}s`,
        `--delay:${(Math.random() * -3).toFixed(2)}s`,
        `--x:${Math.round(Math.random() * 80 - 40)}px`,
      ].join(";");
      return `<i style="${style}"></i>`;
    }).join("");
  }

  function showWin() {
    win.hidden = false;
    fanfare();
    buzz([60, 40, 60, 40, 200]);
    $("again").focus({ preventScroll: true });
  }

  function reset() {
    win.hidden = true;
    anims.forEach((a) => a.cancel());
    anims = [];
    hp.style.width = "100%";
    hp.style.background = "";
    moves.classList.remove("on");
    game.classList.remove("live", "shake");
    dialog.textContent = "";
    renderMoves();
  }

  /* ---------- boot ---------- */
  const ready = Promise.all([
    scareImg.decode().catch(() => {}),
    prof.decode().catch(() => {}),
    document.fonts.ready,
  ]);

  buildWin();
  renderMoves();
  ready.then(() => {
    title.disabled = false;
    startLabel.textContent = "TAP TO START";
  });

  title.addEventListener("click", () => {
    audio();
    start();
  });
  $("again").addEventListener("click", () => {
    reset();
    start();
  });

  if ("serviceWorker" in navigator) {
    addEventListener("load", () => navigator.serviceWorker.register("/boss/sw.js", { scope: "/boss/" }).catch(() => {}));
  }
})();
