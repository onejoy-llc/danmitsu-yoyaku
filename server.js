// 男蜜 予約サイト：管理用サーバー（追加インストール不要・Node.js だけで動きます）
//   起動:  node server.js   →  http://localhost:8793/        予約サイト
//                               http://localhost:8793/admin/  管理画面（このパソコンからのみ開けます）
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8793;
const DATA_JS = path.join(ROOT, 'js', 'data.js');
const RES_DIR = path.join(ROOT, 'data');
const RES_JSON = path.join(RES_DIR, 'reservations.json');
const IMG_DIR = path.join(ROOT, 'img');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

/* ---------- データの読み書き ---------- */
function readData() {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(DATA_JS, 'utf8'), box, { timeout: 1000 });
  return box.window.DATA;
}
function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
function writeData(d) {
  const now = new Date(), p = (n) => String(n).padStart(2, '0');
  d.shop.asOf = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
  writeAtomic(DATA_JS,
    '// 掲載データ。管理画面（/admin/）から保存すると、このファイルが書き換わります。\n' +
    'window.DATA = ' + JSON.stringify(d, null, 1) + ';\n\n' +
    '// 予約の送信先（server.js で開いているときは自動で接続されます）\n' +
    "window.RESERVE_ENDPOINT = '';\n");
}
function readRes() {
  try { return JSON.parse(fs.readFileSync(RES_JSON, 'utf8')); } catch (e) { return []; }
}
function writeRes(list) {
  fs.mkdirSync(RES_DIR, { recursive: true });
  writeAtomic(RES_JSON, JSON.stringify(list, null, 1));
}

/* ---------- 入力チェック ---------- */
const isTime = (s) => typeof s === 'string' && /^\d{1,2}:\d{2}$/.test(s);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const toMin = (hm) => { const p = hm.split(':'); return +p[0] * 60 + +p[1]; };
const hm = (m) => Math.floor(m / 60) % 24 + ':' + String(m % 60).padStart(2, '0');

function cleanData(d) {
  if (!d || typeof d !== 'object' || !d.shop || !Array.isArray(d.girls) || !Array.isArray(d.courses) || !d.days) throw new Error('データの形が正しくありません');
  const s = d.shop, old = readData().shop;
  const shop = {
    name: str(s.name, 60), brand: str(s.brand, 30), kana: str(s.kana, 30), branch: str(s.branch, 30), en: str(s.en, 80),
    access: (s.access || []).map((a) => str(a, 60)).filter(Boolean).slice(0, 8),
    hours: str(s.hours, 30), freeHours: str(s.freeHours, 30),
    freeFrom: isTime(s.freeFrom) ? s.freeFrom : old.freeFrom, freeTo: isTime(s.freeTo) ? s.freeTo : old.freeTo,
    tel: str(s.tel, 15).replace(/\D/g, ''), pay: (s.pay || []).map((a) => str(a, 30)).filter(Boolean).slice(0, 8),
    lead: str(s.lead, 400), recruit: str(s.recruit, 80), hero: /^img\/[\w.-]+$/.test(s.hero) ? s.hero : old.hero,
    freeNote: str(s.freeNote, 200), asOf: old.asOf
  };
  const ids = {};
  const girls = d.girls.map((g) => {
    const id = Number(g.id);
    if (!Number.isInteger(id) || id <= 0 || ids[id]) throw new Error('セラピストのIDが正しくありません');
    ids[id] = 1;
    if (!str(g.name, 20).trim()) throw new Error('セラピストの名前が空です');
    return { id, name: str(g.name, 20).trim(), age: Math.max(0, Math.min(99, Number(g.age) || 0)), new: !!g.new,
      img: /^img\/[\w.-]+$/.test(g.img) ? g.img : '' };
  });
  const days = {};
  Object.keys(d.days).sort().forEach((date) => {
    if (!isDate(date) || !Array.isArray(d.days[date])) return;
    const seen = {};
    const list = d.days[date].filter((e) => ids[e.id] && !seen[e.id] && (seen[e.id] = 1) && isTime(e.from) && isTime(e.to) && toMin(e.to) > toMin(e.from))
      .map((e) => ({ id: Number(e.id), from: e.from, to: e.to, full: !!e.full, booked: (e.booked || []).filter(isTime).sort((a, b) => toMin(a) - toMin(b)) }))
      .sort((a, b) => toMin(a.from) - toMin(b.from));
    if (list.length) days[date] = list;
  });
  const cids = {};
  const courses = d.courses.map((c) => {
    const id = Number(c.id);
    if (!Number.isInteger(id) || id <= 0 || cids[id]) throw new Error('コースのIDが正しくありません');
    cids[id] = 1;
    const min = Number(c.min), price = Number(c.price);
    if (!str(c.name, 30).trim() || !(min > 0) || !(price >= 0)) throw new Error('コースの名前・時間・料金を確認してください');
    return { id, name: str(c.name, 30).trim(), min: Math.round(min), price: Math.round(price), desc: str(c.desc, 300) };
  });
  return { shop, girls, days, courses };
}

/* ---------- 予約と空き枠の連動 ---------- */
function shiftOf(d, girlId, date) { return (d.days[date] || []).find((e) => e.id === girlId); }
function block(d, r) {            // 確定 → その時間帯を × にする
  r.blocked = [];
  const e = r.girl_id ? shiftOf(d, r.girl_id, r.date) : null;
  if (!e) return false;
  for (let m = toMin(r.time); m < toMin(r.time) + r.min; m += 10) {
    const t = hm(m);
    if (!e.booked.includes(t)) { e.booked.push(t); r.blocked.push(t); }
  }
  e.booked.sort((a, b) => toMin(a) - toMin(b));
  return r.blocked.length > 0;
}
function unblock(d, r) {          // 取消・削除 → × を戻す
  const e = r.girl_id ? shiftOf(d, r.girl_id, r.date) : null;
  const had = (r.blocked || []).length > 0;
  if (e && had) e.booked = e.booked.filter((t) => !r.blocked.includes(t));
  r.blocked = [];
  return !!e && had;
}

/* ---------- HTTP ---------- */
function send(res, code, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(buf);
}
function body(req, limit) {
  return new Promise((ok, ng) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { ng(new Error('データが大きすぎます')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { ng(new Error('JSONが読めません')); } });
    req.on('error', ng);
  });
}
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

const recent = new Map();         // 連続投稿よけ（同じ接続元から1分に5件まで）
function tooMany(ip) {
  const now = Date.now(), list = (recent.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now); recent.set(ip, list);
  return list.length > 5;
}

async function api(req, res, url) {
  const p = url.pathname, m = req.method;

  if (p === '/api/ping') return send(res, 200, { ok: true });

  // お客様からの予約（だれでも送れる）
  if (p === '/api/reserve' && m === 'POST') {
    if (tooMany(req.socket.remoteAddress)) return send(res, 429, { error: '短時間に連続して送信されています。少し時間をおいてお試しください。' });
    const b = await body(req, 20000), d = readData();
    const girlId = Number(b.girl_id) || 0;
    const girl = girlId ? d.girls.find((g) => g.id === girlId) : { id: 0, name: 'フリー', age: 0 };
    const course = d.courses.find((c) => c.id === Number(b.course_id));
    const tel = str(b.tel, 15), name = str(b.name, 30).trim();
    if (!girl || !course || !isDate(b.date) || !isTime(b.time)) return send(res, 400, { error: '予約内容を確認できませんでした。もう一度お試しください。' });
    if (!/^0\d{9,10}$/.test(tel)) return send(res, 400, { error: '電話番号をハイフンなしで入力して下さい' });
    if (!name) return send(res, 400, { error: 'お名前は入力必須です' });
    const start = toMin(b.time);
    if (girlId) {
      const e = shiftOf(d, girlId, b.date);
      const taken = e && Array.from({ length: Math.ceil(course.min / 10) }, (_, i) => hm(start + i * 10)).some((t) => e.booked.includes(t));
      if (!e || e.full || start < toMin(e.from) || start + course.min > toMin(e.to) || taken) {
        return send(res, 409, { error: '申し訳ございません。選択された時間はすでに埋まっています。別の時間をお選びください。' });
      }
    }
    const list = readRes();
    const r = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString(), status: 'new',
      girl_id: girlId, girl: girl.name, age: girl.age || 0, date: b.date, time: hm(start), course_id: course.id, course: course.name,
      min: course.min, price: course.price, tel, name, biko: str(b.biko, 1000), blocked: [] };
    list.push(r); writeRes(list);
    console.log('予約を受け付けました:', r.date, r.time, r.girl, r.course);
    return send(res, 200, { ok: true, id: r.id });
  }

  // ここから下は管理用（このパソコンからのみ）
  if (!isLocal(req)) return send(res, 403, { error: '管理機能はこのパソコンからのみ使えます' });

  if (p === '/api/data' && m === 'GET') return send(res, 200, readData());
  if (p === '/api/data' && m === 'PUT') {
    const d = cleanData(await body(req, 2e6)); writeData(d);
    return send(res, 200, readData());
  }
  if (p === '/api/photo' && m === 'POST') {
    const b = await body(req, 8e6);
    const mt = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.data || '');
    if (!mt) return send(res, 400, { error: '画像は JPEG / PNG / WebP を選んでください' });
    const kind = b.kind === 'shop' ? 'shopimg' : 'girlimg_' + (Number(b.id) || 0);
    const name = kind + '_' + Date.now().toString(36) + '.' + (mt[1] === 'jpeg' ? 'jpg' : mt[1]);
    fs.writeFileSync(path.join(IMG_DIR, name), Buffer.from(mt[2], 'base64'));
    return send(res, 200, { img: 'img/' + name });
  }
  if (p === '/api/reservations' && m === 'GET') return send(res, 200, readRes());

  const one = /^\/api\/reservations\/([a-z0-9]+)$/.exec(p);
  if (one && (m === 'PATCH' || m === 'DELETE')) {
    const list = readRes(), i = list.findIndex((r) => r.id === one[1]);
    if (i < 0) return send(res, 404, { error: '予約が見つかりません' });
    const r = list[i], d = readData();
    let changed = false, note = '';
    if (m === 'DELETE') { changed = unblock(d, r); list.splice(i, 1); }
    else {
      const b = await body(req, 2000);
      if (!['new', 'confirmed', 'cancelled'].includes(b.status)) return send(res, 400, { error: '状態が正しくありません' });
      if (r.status === 'confirmed' && b.status !== 'confirmed') changed = unblock(d, r);
      if (r.status !== 'confirmed' && b.status === 'confirmed') {
        changed = block(d, r);
        if (r.girl_id && !shiftOf(d, r.girl_id, r.date)) note = 'この日の出勤が登録されていないため、空き枠は変更していません。';
      }
      r.status = b.status;
    }
    if (changed) writeData(d);
    writeRes(list);
    return send(res, 200, { ok: true, note, reservations: list });
  }
  send(res, 404, { error: 'not found' });
}

function file(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const abs = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, abs);
  const top = rel.split(path.sep)[0];
  // 予約データ・サーバー本体・隠しファイルは配信しない
  if (rel.startsWith('..') || path.isAbsolute(rel) || top === 'data' || top === 'server.js' || rel.split(path.sep).some((s) => s.startsWith('.'))) return send(res, 404, 'Not found', 'text/plain');
  if (top === 'admin' && !isLocal(req)) return send(res, 403, '管理画面はこのパソコンからのみ開けます', 'text/plain; charset=utf-8');
  fs.stat(abs, (err, st) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    if (st.isDirectory()) { res.writeHead(302, { Location: url.pathname + '/' }); return res.end(); }
    const type = MIME[path.extname(abs).toLowerCase()];
    if (!type) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, fs.readFileSync(abs), type);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch((e) => { if (!res.headersSent) send(res, 400, { error: e.message || 'エラーが発生しました' }); });
  } else if (req.method === 'GET' || req.method === 'HEAD') file(req, res, url);
  else send(res, 405, 'Method not allowed', 'text/plain');
}).listen(PORT, () => {
  console.log('予約サイト   http://localhost:' + PORT + '/');
  console.log('管理画面     http://localhost:' + PORT + '/admin/');
});
