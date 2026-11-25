// 男蜜 予約サイト：管理用サーバー（追加インストール不要・Node.js だけで動きます）
//   起動:  node server.js   →  http://localhost:8793/        予約サイト
//                               http://localhost:8793/admin/  管理画面（このパソコンからのみ開けます）
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const estama = require('./estama');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8793;
const DATA_JS = path.join(ROOT, 'js', 'data.js');
const RES_DIR = path.join(ROOT, 'data');
const RES_JSON = path.join(RES_DIR, 'reservations.json');
const IMG_DIR = path.join(ROOT, 'img');
const EST_JSON = path.join(RES_DIR, 'estama.json');   // エステ魂のログイン情報（このパソコンの中だけに保存）
const EST_EVERY_MIN = 10;                             // 自動取り込みの間隔（分）

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
  syncHtml(d.shop);
}

// 店名を HTML にも書き込む（JavaScript を読まない検索エンジンや、表示直後のちらつき対策）
const escHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function syncHtml(shop) {
  const full = shop.brand + (shop.kana ? '-' + shop.kana + '-' : ' ') + shop.branch;
  const sub = [shop.kana, shop.branch].filter(Boolean).join('　');
  const put = (file, rules) => {
    const f = path.join(ROOT, file);
    let html;
    try { html = fs.readFileSync(f, 'utf8'); } catch (e) { return; }
    let out = html;
    rules.forEach(([re, val]) => { out = out.replace(re, (m, a, b) => a + escHtml(val) + b); });
    if (out !== html) writeAtomic(f, out);
  };
  put('index.html', [
    [/(<title>)[^<]*(<\/title>)/, full + '｜ご予約'],
    [/(<meta name="description" content=")[^"]*(")/, full + 'のご予約ページ。出勤セラピストと空き時間を確認して、そのままご予約いただけます。'],
    [/(<span class="bar__brand" id="barBrand">)[^<]*(<\/span>)/, shop.brand],
    [/(<span class="bar__sub" id="barSub">)[^<]*(<\/span>)/, sub],
    [/(<img id="heroImg" alt=")[^"]*(")/, full],
    [/(<p class="foot__name" id="footName">)[^<]*(<\/p>)/, full]
  ]);
  put(path.join('admin', 'index.html'), [
    [/(<title>)[^<]*(<\/title>)/, shop.brand + ' 管理画面'],
    [/(<b id="topBrand">)[^<]*(<\/b>)/, shop.brand]
  ]);
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
    const rec = { id, name: str(g.name, 20).trim(), age: Math.max(0, Math.min(99, Number(g.age) || 0)), new: !!g.new,
      img: /^img\/[\w.-]+$/.test(g.img) ? g.img : '' };
    if (Number.isInteger(Number(g.estama)) && Number(g.estama) > 0) rec.estama = Number(g.estama);   // エステ魂のセラピスト番号
    return rec;
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

/* ---------- エステ魂から出勤を取り込む（読むだけ） ---------- */
const est = { running: false, session: null, mail: '' };
function readEst() { try { return JSON.parse(fs.readFileSync(EST_JSON, 'utf8')); } catch (e) { return {}; } }
function writeEst(o) {
  fs.mkdirSync(RES_DIR, { recursive: true });
  writeAtomic(EST_JSON, JSON.stringify(o, null, 1));
  try { fs.chmodSync(EST_JSON, 0o600); } catch (e) { /* Windows では効かないことがある */ }
}
function estStatus() {
  const c = readEst();
  return { mail: c.mail || '', hasPassword: !!c.password, auto: c.auto !== false, every: EST_EVERY_MIN, running: est.running, last: c.last || null };
}
const norm = (s) => String(s).replace(/新人|[♡♥❤☆★♪\s\u3000\uFE0F]/g, '');

async function syncEstama(reason) {
  if (est.running) throw new Error('いま取り込み中です。少しお待ちください。');
  const conf = readEst();
  if (!conf.mail || !conf.password) throw new Error('エステ魂のメールアドレスとパスワードを登録してください');
  est.running = true;
  const at = new Date().toISOString();
  let last;
  try {
    const r = await estama.fetchSchedule(conf.mail, conf.password, { session: est.mail === conf.mail ? est.session : null });
    est.session = r.session; est.mail = conf.mail;
    const d = readData(), added = [];

    // セラピストの対応づけ：エステ魂の番号 → 同じ名前 → 新しく追加
    for (const c of r.casts) {
      let g = d.girls.find((x) => x.estama === c.castId);
      if (!g) { g = d.girls.find((x) => !x.estama && norm(x.name) === norm(c.name)); if (g) g.estama = c.castId; }
      if (!g) {
        const shop = /shop_data\/0*(\d+)\//.exec(c.img);
        g = { id: Math.max(0, ...d.girls.map((x) => x.id)) + 1, name: c.name.replace(/新人/g, '').trim().slice(0, 20) || 'セラピスト',
          age: shop ? await estama.fetchAge(shop[1], c.castId) : 0, new: /新人/.test(c.name), img: '', estama: c.castId };
        d.girls.push(g); added.push(g.name);
      }
      if (!g.img && c.img) {
        try {
          const im = await estama.fetchImage(c.img.replace('/250x250/', '/357x556/'));
          const name = 'estama_' + c.castId + '_' + Date.now().toString(36) + '.' + im.ext;
          fs.writeFileSync(path.join(IMG_DIR, name), im.buf);
          g.img = 'img/' + name;
        } catch (e) { console.log('写真を取得できませんでした:', g.name, e.message); }
      }
    }

    // 出勤：エステ魂とつながっているセラピストは、エステ魂の内容で置き換える（手で入れた他の人の出勤はそのまま）
    const idOf = {}; d.girls.forEach((g) => { if (g.estama) idOf[g.estama] = g.id; });
    const linked = (id) => { const g = d.girls.find((x) => x.id === id); return !!(g && g.estama); };
    let shifts = 0;
    Object.keys(r.days).forEach((date) => {
      const keep = (d.days[date] || []).filter((e) => !linked(e.id));
      const got = r.days[date].map((x) => ({ id: idOf[x.castId], from: x.from, to: x.to, full: x.full, booked: x.booked.slice() }))
        .filter((e) => e.id && !keep.some((k) => k.id === e.id));
      shifts += got.length;
      const list = keep.concat(got).sort((a, b) => toMin(a.from) - toMin(b.from));
      if (list.length) d.days[date] = list; else delete d.days[date];
    });

    // このサイトで確定した予約の × を、取り込んだ出勤にもう一度反映する
    const res = readRes();
    let resChanged = false;
    res.forEach((x) => { if (x.status === 'confirmed' && r.days[x.date]) { block(d, x); resChanged = true; } });
    writeData(d);
    if (resChanged) writeRes(res);
    last = { at, ok: true, reason, days: Object.keys(r.days).length, shifts, added };
    console.log('エステ魂から出勤を取り込みました:', shifts + '件', added.length ? '（追加: ' + added.join('、') + '）' : '');
    return last;
  } catch (e) {
    est.session = null;
    last = { at, ok: false, reason, error: e.message || '取り込みに失敗しました' };
    console.log('エステ魂の取り込みに失敗しました:', last.error);
    throw e;
  } finally {
    est.running = false;
    const now = readEst(); now.last = last; writeEst(now);   // 取り込み中に設定が変わっても上書きしない
  }
}
function autoSync() {
  const c = readEst();
  if (c.auto !== false && c.mail && c.password && !est.running) syncEstama('自動').catch(() => {});
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

  // エステ魂の連携設定（パスワードは画面に返さない）
  if (p === '/api/estama' && m === 'GET') return send(res, 200, estStatus());
  if (p === '/api/estama' && m === 'PUT') {
    const b = await body(req, 5000), c = readEst();
    const mail = str(b.mail, 200).trim();
    if (!mail) return send(res, 400, { error: 'メールアドレスを入力してください' });
    if (mail !== c.mail) { est.session = null; c.last = null; }
    c.mail = mail;
    if (typeof b.password === 'string' && b.password) { c.password = str(b.password, 200); est.session = null; }
    if (!c.password) return send(res, 400, { error: 'パスワードを入力してください' });
    c.auto = b.auto !== false;
    writeEst(c);
    return send(res, 200, estStatus());
  }
  if (p === '/api/estama' && m === 'DELETE') {
    try { fs.unlinkSync(EST_JSON); } catch (e) { /* もともと無い */ }
    est.session = null;
    return send(res, 200, estStatus());
  }
  if (p === '/api/estama/sync' && m === 'POST') {
    try { await syncEstama('手動'); } catch (e) { return send(res, 400, Object.assign(estStatus(), { error: e.message })); }
    return send(res, 200, Object.assign(estStatus(), { data: readData() }));
  }

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
  if (rel.startsWith('..') || path.isAbsolute(rel) || top === 'data' || top === 'server.js' || top === 'estama.js' || rel.split(path.sep).some((s) => s.startsWith('.'))) return send(res, 404, 'Not found', 'text/plain');
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
  setTimeout(autoSync, 5000);                                   // 起動して少ししたら1回
  setInterval(autoSync, EST_EVERY_MIN * 60 * 1000);             // その後は10分ごと
});
