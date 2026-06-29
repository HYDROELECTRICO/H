/* Phone Mouse - ક્લાયન્ટ લોજિક */
(function () {
  const socket = io({ transports: ["websocket", "polling"] });

  const dot = document.getElementById("dot");
  const stxt = document.getElementById("stxt");
  const pad = document.getElementById("pad");
  const hint = document.getElementById("hint");
  const sens = document.getElementById("sens");
  const sensv = document.getElementById("sensv");

  let sensitivity = parseFloat(sens.value);
  let scrollMode = false;

  // ---- PIN લોગિન ----
  const lock = document.getElementById("lock");
  const pinInput = document.getElementById("pinInput");
  const pinBtn = document.getElementById("pinBtn");
  const pinErr = document.getElementById("pinErr");
  let pinRequired = false;
  let authed = false;
  let demoMode = false;

  function submitPin() {
    const pin = (pinInput.value || "").trim();
    if (!pin) { pinErr.textContent = "PIN નાખો"; return; }
    pinBtn.textContent = "ચકાસી રહ્યું...";
    socket.emit("auth", { pin });
  }
  pinBtn.addEventListener("click", submitPin);
  pinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitPin(); });

  socket.on("auth-ok", () => {
    authed = true;
    lock.style.display = "none";
    stxt.textContent = demoMode ? "જોડાયેલ (ડેમો)" : "જોડાયેલ";
    pinBtn.textContent = "જોડાઓ";
    pinErr.textContent = "";
  });
  socket.on("auth-fail", (d) => {
    pinBtn.textContent = "જોડાઓ";
    const left = d && d.attempts ? Math.max(0, 5 - d.attempts) : "";
    pinErr.textContent = "ખોટો PIN" + (left ? " — " + left + " પ્રયત્ન બાકી" : "");
    pinInput.value = "";
    pinInput.focus();
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
  });

  // ---- કનેક્શન સ્ટેટસ ----
  socket.on("connect", () => {
    dot.classList.add("on");
    stxt.textContent = pinRequired && !authed ? "PIN જરૂરી" : (demoMode ? "જોડાયેલ (ડેમો)" : "જોડાયેલ");
    // ફરી જોડાય ત્યારે જો PIN જરૂરી ન હોય તો સીધું authed
    if (!pinRequired) authed = true;
  });
  socket.on("disconnect", () => {
    dot.classList.remove("on");
    stxt.textContent = "છૂટું પડ્યું";
  });
  socket.on("status", (s) => {
    if (!s) return;
    demoMode = s.nutReady === false;
    pinRequired = !!s.pinRequired;
    if (pinRequired && !authed) {
      lock.style.display = "flex";
      setTimeout(() => pinInput.focus(), 200);
      stxt.textContent = "PIN જરૂરી";
    } else {
      authed = true;
      lock.style.display = "none";
      stxt.textContent = demoMode ? "જોડાયેલ (ડેમો)" : "જોડાયેલ";
    }
  });

  // ---- સંવેદનશીલતા સ્લાઇડર ----
  sens.addEventListener("input", () => {
    sensitivity = parseFloat(sens.value);
    sensv.textContent = sensitivity + "×";
  });

  // ---- રિપલ ઇફેક્ટ ----
  function ripple(x, y) {
    const r = document.createElement("div");
    r.className = "ripple";
    const rect = pad.getBoundingClientRect();
    r.style.left = x - rect.left + "px";
    r.style.top = y - rect.top + "px";
    pad.appendChild(r);
    setTimeout(() => r.remove(), 420);
  }

  // ---- ટચ ટ્રેકિંગ ----
  let lastX = 0, lastY = 0;
  let startX = 0, startY = 0, startT = 0;
  let moved = false;
  let dragging = false;
  let dragArmTimer = null;
  let twoFinger = false;
  let lastTapTime = 0;
  let waitingDragHold = false; // double-tap-hold માટે

  const TAP_MAX_MOVE = 10;   // px
  const TAP_MAX_TIME = 250;  // ms
  const DBLTAP_GAP = 300;    // ms

  function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  pad.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (hint) hint.style.display = "none";

    if (e.touches.length === 2) {
      // બે આંગળી → સ્ક્રોલ
      twoFinger = true;
      const t = e.touches;
      lastX = (t[0].clientX + t[1].clientX) / 2;
      lastY = (t[0].clientY + t[1].clientY) / 2;
      return;
    }

    twoFinger = false;
    const t = e.touches[0];
    lastX = startX = t.clientX;
    lastY = startY = t.clientY;
    startT = Date.now();
    moved = false;

    // double-tap-hold → ડ્રેગ શરૂ
    const now = Date.now();
    if (now - lastTapTime < DBLTAP_GAP) {
      waitingDragHold = true;
      dragArmTimer = setTimeout(() => {
        if (waitingDragHold) {
          dragging = true;
          socket.emit("dragstart");
          vibrate(30);
        }
      }, 120);
    }
  }, { passive: false });

  pad.addEventListener("touchmove", (e) => {
    e.preventDefault();

    if (twoFinger && e.touches.length >= 2) {
      const t = e.touches;
      const cx = (t[0].clientX + t[1].clientX) / 2;
      const cy = (t[0].clientY + t[1].clientY) / 2;
      const dx = cx - lastX;
      const dy = cy - lastY;
      lastX = cx; lastY = cy;
      // સ્ક્રોલ: ઊભી મુખ્ય
      const sx = Math.round(dx / 6);
      const sy = Math.round(-dy / 6);
      if (sx || sy) socket.emit("scroll", { dx: sx, dy: sy });
      return;
    }

    const t = e.touches[0];
    let dx = (t.clientX - lastX);
    let dy = (t.clientY - lastY);
    lastX = t.clientX;
    lastY = t.clientY;

    if (Math.abs(t.clientX - startX) > TAP_MAX_MOVE || Math.abs(t.clientY - startY) > TAP_MAX_MOVE) {
      moved = true;
      waitingDragHold = false;
    }

    if (scrollMode) {
      const sy = Math.round(-dy / 5);
      const sx = Math.round(dx / 5);
      if (sx || sy) socket.emit("scroll", { dx: sx, dy: sy });
    } else {
      // એક્સેલેરેશન વળાંક
      const mag = Math.sqrt(dx * dx + dy * dy);
      const accel = 1 + Math.min(mag / 12, 2.2);
      const mx = dx * sensitivity * accel;
      const my = dy * sensitivity * accel;
      if (mx || my) socket.emit("move", { dx: mx, dy: my });
    }
  }, { passive: false });

  pad.addEventListener("touchend", (e) => {
    e.preventDefault();
    clearTimeout(dragArmTimer);

    if (dragging) {
      dragging = false;
      socket.emit("dragend");
      vibrate(15);
      waitingDragHold = false;
      return;
    }

    if (twoFinger) { twoFinger = false; return; }

    const dt = Date.now() - startT;
    // ટેપ → ડાબી ક્લિક
    if (!moved && dt < TAP_MAX_TIME) {
      socket.emit("click", { button: "left" });
      ripple(startX, startY);
      vibrate(10);
      lastTapTime = Date.now();
    }
    waitingDragHold = false;
  }, { passive: false });

  // ---- ક્લિક બટન ----
  const bL = document.getElementById("bL");
  const bR = document.getElementById("bR");
  const bM = document.getElementById("bM");
  bL.addEventListener("click", () => { socket.emit("click", { button: "left" }); vibrate(10); });
  bR.addEventListener("click", () => { socket.emit("click", { button: "right" }); vibrate(10); });
  bM.addEventListener("click", () => { socket.emit("dblclick"); vibrate(12); });

  // ---- ટૂલબાર ----
  const tScroll = document.getElementById("tScroll");
  const tKb = document.getElementById("tKb");
  const tFull = document.getElementById("tFull");

  tScroll.addEventListener("click", () => {
    scrollMode = !scrollMode;
    tScroll.classList.toggle("active", scrollMode);
    if (hint) {
      hint.style.display = "block";
      hint.innerHTML = scrollMode
        ? "સ્ક્રોલ મોડ ચાલુ<br/>આંગળી ઉપર/નીચે ફેરવો"
        : "અહીં આંગળી ફેરવો → કર્સર ખસશે<br/>ટેપ = ક્લિક · બે આંગળી = સ્ક્રોલ";
      setTimeout(() => { if (hint) hint.style.display = "none"; }, 1500);
    }
  });

  // ---- કીબોર્ડ ----
  const kbPanel = document.getElementById("kbPanel");
  const kbInput = document.getElementById("kbInput");
  const kbClose = document.getElementById("kbClose");

  tKb.addEventListener("click", () => {
    const open = kbPanel.classList.toggle("open");
    tKb.classList.toggle("active", open);
    if (open) setTimeout(() => kbInput.focus(), 250);
    else kbInput.blur();
  });
  kbClose.addEventListener("click", () => {
    kbPanel.classList.remove("open");
    tKb.classList.remove("active");
    kbInput.blur();
  });

  // જેમ ટાઇપ થાય તેમ અક્ષર મોકલો
  let prevValue = "";
  kbInput.addEventListener("input", () => {
    const v = kbInput.value;
    if (v.length > prevValue.length) {
      const added = v.slice(prevValue.length);
      socket.emit("type", { text: added });
    } else if (v.length < prevValue.length) {
      const n = prevValue.length - v.length;
      for (let i = 0; i < n; i++) socket.emit("key", { key: "backspace" });
    }
    prevValue = v;
  });
  // ઇનપુટ ખાલી રાખવા માટે સમયાંતરે રીસેટ (ઘણા બધા અક્ષર પછી)
  kbInput.addEventListener("blur", () => { prevValue = ""; kbInput.value = ""; });

  // સ્પેશિયલ કી બટન
  document.querySelectorAll(".kb .keys button[data-k]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.getAttribute("data-k");
      socket.emit("key", { key: k });
      vibrate(8);
      if (k === "enter") { prevValue = ""; kbInput.value = ""; }
      kbInput.focus();
    });
  });

  // ---- ફુલસ્ક્રીન ----
  tFull.addEventListener("click", () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || function(){}).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
    }
  });

  // પેજ સ્ક્રોલ/ઝૂમ બંધ
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault());
})();
