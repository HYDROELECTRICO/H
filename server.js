/**
 * Phone Mouse - તમારા ફોનને લેપટોપના વાયરલેસ માઉસ + કીબોર્ડ તરીકે વાપરો
 *
 * કેવી રીતે ચાલે છે:
 *  1. આ સર્વર લેપટોપ પર ચાલે છે અને એક વેબ પેજ આપે છે.
 *  2. ફોન એ જ Wi-Fi પર બ્રાઉઝરમાં તે પેજ ખોલે છે.
 *  3. ફોનની ટચ-મૂવમેન્ટ Socket.IO દ્વારા સર્વર પર આવે છે.
 *  4. સર્વર nut-js વાપરીને લેપટોપનું કર્સર/ક્લિક/સ્ક્રોલ/ટાઇપ કરે છે.
 */

const express = require("express");
const http = require("http");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");
const qrcode = require("qrcode-terminal");

const PORT = process.env.PORT || 3000;

// ---- સુરક્ષા: PIN ----
// જો ઇન્ટરનેટ (Cloudflare ટનલ) પર ખુલ્લું હોય તો PIN જરૂરી છે.
// PIN બદલવા: PMOUSE_PIN environment variable સેટ કરો, અથવા નીચે બદલો.
// ખાલી રાખો ('') તો કોઈ PIN નહીં (ફક્ત ભરોસાપાત્ર લોકલ Wi-Fi માટે).
let PIN = process.env.PMOUSE_PIN;
if (PIN === undefined) {
  // ડિફોલ્ટ: દર વખતે રેન્ડમ 4-આંકડાનો PIN બનાવો (વધુ સલામત)
  PIN = String(Math.floor(1000 + Math.random() * 9000));
}
PIN = String(PIN);
const PIN_REQUIRED = PIN.length > 0;

// ---- nut-js (native mouse/keyboard control) સાથે સલામત લોડિંગ ----
let nut = null;
let nutReady = false;
try {
  nut = require("@nut-tree-fork/nut-js");
  // ઝડપી હલચલ માટે delay ઘટાડો
  nut.mouse.config.mouseSpeed = 99999;
  nut.keyboard.config.autoDelayMs = 0;
  nutReady = true;
} catch (err) {
  console.warn(
    "\n[ચેતવણી] nut-js લોડ ન થયું — ડેમો મોડમાં ચાલશે (કર્સર ખરેખર નહીં ખસે).\n" +
      "         કારણ: " + err.message + "\n"
  );
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// pkg થી બનેલા .exe માં static ફાઇલો snapshot path પર હોય; બંને કેસ સંભાળો
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// સ્ટેટસ endpoint
app.get("/status", (req, res) => {
  res.json({ nutReady, pinRequired: PIN_REQUIRED });
});

// PIN ચકાસણી — ટાઇમિંગ-સેફ સરખામણી
function checkPin(input) {
  if (!PIN_REQUIRED) return true;
  if (typeof input !== "string") return false;
  const a = Buffer.from(input);
  const b = Buffer.from(PIN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---- સહાયક ફંક્શન્સ ----
async function moveBy(dx, dy) {
  if (!nutReady) return;
  try {
    const pos = await nut.mouse.getPosition();
    let nx = Math.round(pos.x + dx);
    let ny = Math.round(pos.y + dy);
    // સ્ક્રીન બાઉન્ડ્સની અંદર રાખો
    const { width, height } = await nut.screen.width().then(async (w) => ({
      width: w,
      height: await nut.screen.height(),
    }));
    nx = Math.max(0, Math.min(width - 1, nx));
    ny = Math.max(0, Math.min(height - 1, ny));
    await nut.mouse.setPosition(new nut.Point(nx, ny));
  } catch (e) {
    /* ignore */
  }
}

async function click(button) {
  if (!nutReady) return;
  const btn = button === "right" ? nut.Button.RIGHT : nut.Button.LEFT;
  try {
    await nut.mouse.click(btn);
  } catch (e) {}
}

async function doubleClick() {
  if (!nutReady) return;
  try {
    await nut.mouse.doubleClick(nut.Button.LEFT);
  } catch (e) {}
}

async function scroll(dx, dy) {
  if (!nutReady) return;
  try {
    if (dy > 0) await nut.mouse.scrollDown(Math.abs(dy));
    else if (dy < 0) await nut.mouse.scrollUp(Math.abs(dy));
    if (dx > 0) await nut.mouse.scrollRight(Math.abs(dx));
    else if (dx < 0) await nut.mouse.scrollLeft(Math.abs(dx));
  } catch (e) {}
}

async function pressDown() {
  if (!nutReady) return;
  try { await nut.mouse.pressButton(nut.Button.LEFT); } catch (e) {}
}
async function pressUp() {
  if (!nutReady) return;
  try { await nut.mouse.releaseButton(nut.Button.LEFT); } catch (e) {}
}

async function typeText(text) {
  if (!nutReady || !text) return;
  try { await nut.keyboard.type(text); } catch (e) {}
}

async function specialKey(key) {
  if (!nutReady) return;
  const K = nut.Key;
  const map = {
    backspace: K.Backspace,
    enter: K.Enter,
    space: K.Space,
    tab: K.Tab,
    escape: K.Escape,
    up: K.Up,
    down: K.Down,
    left: K.Left,
    right: K.Right,
  };
  const k = map[key];
  if (!k) return;
  try { await nut.keyboard.type(k); } catch (e) {}
}

// ---- Socket.IO ----
io.on("connection", (socket) => {
  console.log("ફોન જોડાયો:", socket.id);
  socket.emit("status", { nutReady, pinRequired: PIN_REQUIRED });

  // PIN જરૂરી હોય તો ઓથ ન થાય ત્યાં સુધી કંટ્રોલ બંધ
  let authed = !PIN_REQUIRED;
  let attempts = 0;

  socket.on("auth", (d) => {
    if (authed) { socket.emit("auth-ok"); return; }
    attempts++;
    if (checkPin(d && d.pin)) {
      authed = true;
      console.log("ફોન ઓથ થયો:", socket.id);
      socket.emit("auth-ok");
    } else {
      socket.emit("auth-fail", { attempts });
      // વારંવાર ખોટા પ્રયત્ન → થોડીવાર બ્લોક
      if (attempts >= 5) {
        console.warn("બહુ ખોટા PIN પ્રયત્ન, કનેક્શન બંધ:", socket.id);
        socket.disconnect(true);
      }
    }
  });

  // ગાર્ડ: ઓથ ન હોય તો કોઈ કંટ્રોલ ઇવેન્ટ ન ચાલે
  const guard = (fn) => (d) => { if (authed) fn(d); };

  socket.on("move", guard((d) => moveBy(d.dx || 0, d.dy || 0)));
  socket.on("click", guard((d) => click((d && d.button) || "left")));
  socket.on("dblclick", guard(() => doubleClick()));
  socket.on("scroll", guard((d) => scroll(d.dx || 0, d.dy || 0)));
  socket.on("dragstart", guard(() => pressDown()));
  socket.on("dragend", guard(() => pressUp()));
  socket.on("type", guard((d) => typeText(d && d.text)));
  socket.on("key", guard((d) => specialKey(d && d.key)));

  socket.on("disconnect", () => console.log("ફોન છૂટ્યો:", socket.id));
});

// ---- લોકલ IP શોધો ----
function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

server.listen(PORT, "0.0.0.0", () => {
  const ips = getLocalIPs();
  const url = ips.length ? `http://${ips[0]}:${PORT}` : `http://localhost:${PORT}`;

  console.log("\n==================================================");
  console.log("  📱  Phone Mouse સર્વર ચાલુ થયું!");
  console.log("==================================================");
  console.log("  લેપટોપ અને ફોન એક જ Wi-Fi પર હોવા જોઈએ.\n");
  console.log("  ફોનના બ્રાઉઝરમાં આ સરનામું ખોલો:");
  console.log("      " + url + "\n");
  if (ips.length > 1) {
    console.log("  (ન ચાલે તો બીજા IP પણ અજમાવો:)");
    ips.slice(1).forEach((ip) => console.log("      http://" + ip + ":" + PORT));
    console.log("");
  }
  console.log("  નીચેનો QR કોડ ફોનના કેમેરાથી સ્કેન કરો:\n");
  qrcode.generate(url, { small: true });

  if (PIN_REQUIRED) {
    console.log("\n  🔒  સુરક્ષા PIN (ફોન પર નાખવો પડશે):  >>>  " + PIN + "  <<<");
    console.log("      (PIN બદલવા: PMOUSE_PIN=1234 સેટ કરો. બંધ કરવા: PMOUSE_PIN= ખાલી)");
  } else {
    console.log("\n  ⚠️  PIN બંધ છે — ફક્ત ભરોસાપાત્ર લોકલ Wi-Fi પર જ વાપરો!");
  }

  console.log("\n  🌐 બીજા નેટવર્કથી (ઇન્ટરનેટ દ્વારા) વાપરવા:");
  console.log("      cloudflared tunnel --url http://localhost:" + PORT);
  console.log("      (વિગત README માં છે)");

  console.log("\n  બંધ કરવા માટે: Ctrl + C");
  if (!nutReady) {
    console.log("\n  ⚠️  ડેમો મોડ: કર્સર ખરેખર નહીં ખસે (nut-js ઇન્સ્ટોલ નથી).");
  }
  console.log("==================================================\n");
});
