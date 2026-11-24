// エステ魂の管理画面から出勤表を読み込む（読むだけ。エステ魂の内容は一切変更しません）
//   使い方: const estama = require('./estama'); const r = await estama.fetchSchedule(mail, password);
'use strict';

const BASE = process.env.ESTAMA_BASE || 'https://estama.jp';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const DAYS = 14;                 // 今日から2週間分
const SLOT = 30;                 // エステ魂の出勤表は30分きざみ

/* ---------- Cookie を覚えて通信する ---------- */
function session() {
  const jar = new Map();
  function keep(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    list.forEach((c) => {
      const kv = c.split(';')[0], i = kv.indexOf('=');
      if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    });
  }
  async function req(p, opt = {}) {
    let url = new URL(p, BASE).href, method = opt.method || 'GET', body = opt.body;
    for (let hop = 0; hop < 6; hop++) {
      const res = await fetch(url, {
        method, body, redirect: 'manual', signal: AbortSignal.timeout(20000),
        headers: Object.assign({ 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8',
          Cookie: [...jar].map(([k, v]) => k + '=' + v).join('; ') }, opt.headers || {})
      });
      keep(res);
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url).href; method = 'GET'; body = undefined; continue; }
      return { status: res.status, url, text: await res.text() };
    }
    throw new Error('エステ魂の画面の移動が多すぎます');
  }
  return { req, loggedIn: false };
}

const isLoginPage = (r) => /\/login\//.test(new URL(r.url).pathname) || /id="form-login_shop"/.test(r.text);

async function login(s, mail, password) {
  const page = await s.req('/login/?r=/admin/');
  const tag = /<input[^>]*id="csrf_footer"[^>]*>/.exec(page.text);
  const ctk = tag && /value="([^"]*)"/.exec(tag[0]);
  if (!ctk) throw new Error('エステ魂のログイン画面を読み取れませんでした。画面の作りが変わった可能性があります。');
  const form = new URLSearchParams();
  [['mail', mail], ['password', password], ['r', '/admin/']].forEach(([k, v], i) => {
    form.append('str[' + i + '][name]', k); form.append('str[' + i + '][value]', v);
  });
  form.append('ctk', ctk[1]);
  const r = await s.req('/post/login_shop', {
    method: 'POST', body: form.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01', Origin: BASE, Referer: BASE + '/login/?r=/admin/' }
  });
  let data = null;
  try { data = JSON.parse(r.text); } catch (e) { /* 下で確かめる */ }
  if (Array.isArray(data) && data[0] === 'OUT') {
    const msg = data[1] && typeof data[1] === 'object' ? Object.values(data[1]).join(' ') : '';
    throw new Error('エステ魂にログインできませんでした。メールアドレスとパスワードを確かめてください。' + (msg ? '（' + msg + '）' : ''));
  }
  const top = await s.req('/admin/');
  if (isLoginPage(top)) throw new Error('エステ魂にログインできませんでした。メールアドレスとパスワードを確かめてください。');
  s.loggedIn = true;
}

/* ---------- 出勤表（1日表示）を読み取る ---------- */
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
const toMin = (hm) => { const p = hm.split(':'); return +p[0] * 60 + +p[1]; };
const hm = (m) => Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');   // 25:00 のように24時を超えても書く

// 状態: 0=─（出勤なし） 1=○（受付中） 2=×（空きなし） 3=TEL（電話で確認） 99=お休み
function parseDay(html) {
  const tb = /<table[^>]*l-work_schedule_table[^>]*>([\s\S]*?)<\/table>/.exec(html);
  if (!tb) return null;
  const casts = [], byId = {};
  const thRe = /<th[^>]*\bth_sce\b[^>]*data-idx="(\d+)"[^>]*>([\s\S]*?)<\/th>/g;
  let m;
  while ((m = thRe.exec(tb[1]))) {
    const img = /<img[^>]*src="([^"]+)"/.exec(m[2]), name = /<span[^>]*>([\s\S]*?)<\/span>/.exec(m[2]);
    const c = { castId: Number(m[1]), name: name ? decode(name[1].replace(/<[^>]+>/g, '')).trim() : '', img: img ? decode(img[1]) : '', slots: [] };
    casts.push(c); byId[c.castId] = c;
  }
  tb[1].split(/<tr[\s>]/).forEach((row) => {
    const t = /<th[^>]*>\s*(\d{1,2}:\d{2})\s*<\/th>/.exec(row);
    if (!t) return;
    const tdRe = /<td[^>]*class="[^"]*\btdbg_(\d+)\b[^"]*"[^>]*data-idx="(\d+)"/g;
    let d;
    while ((d = tdRe.exec(row))) if (byId[d[2]]) byId[d[2]].slots.push({ t: t[1], st: Number(d[1]) });
  });
  return casts;
}

// 出勤表の上の日付タブ（?days=N&week=W → 11/25(水)）から、その日の日付を読む（年は今日に近い方）
function dateOf(html, idx, fallback) {
  const re = new RegExp('href="/admin/schedule/\\?days=' + idx + '&(?:amp;)?week=\\d+"[^>]*>\\s*(?:<[^>]+>\\s*)*(\\d{1,2})/(\\d{1,2})');
  const m = re.exec(html);
  if (!m) return fallback;
  const fb = new Date(fallback + 'T00:00:00');
  let best = fallback, gap = Infinity;
  [-1, 0, 1].forEach((k) => {
    const d = new Date(fb.getFullYear() + k, +m[1] - 1, +m[2]);
    const g = Math.abs(d - fb);
    if (g < gap) { gap = g; best = iso(d); }
  });
  return best;
}
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// 1人分のマスを、予約サイトの出勤（from / to / full / booked）に直す
function toShift(slots) {
  const on = slots.filter((s) => s.st === 1 || s.st === 2 || s.st === 3).sort((a, b) => toMin(a.t) - toMin(b.t));
  if (!on.length) return null;
  const from = toMin(on[0].t);
  let to = toMin(on[on.length - 1].t);         // エステ魂は退勤時刻のマスまで印が付く
  if (to <= from) to = from + SLOT;
  const booked = [];
  on.filter((s) => s.st !== 1).forEach((s) => {
    for (let x = toMin(s.t); x < toMin(s.t) + SLOT && x < to; x += 10) if (!booked.includes(hm(x))) booked.push(hm(x));
  });
  booked.sort((a, b) => toMin(a) - toMin(b));
  return { from: hm(from), to: hm(to), full: !on.some((s) => s.st === 1), booked };
}

/* ---------- まとめて読む ---------- */
async function fetchSchedule(mail, password, opt = {}) {
  if (!mail || !password) throw new Error('エステ魂のメールアドレスとパスワードを登録してください');
  const s = opt.session || session();
  if (!s.loggedIn) await login(s, mail, password);
  const today = new Date(), days = {}, casts = {};
  for (let i = 0; i < (opt.days || DAYS); i++) {
    const page = '/admin/schedule/?days=' + i + '&week=' + Math.floor(i / 7);   // days は今日からの通し番号（0〜13）
    const want = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    let r = await s.req(page);
    if (isLoginPage(r)) {                       // ログインが切れていたら1回だけ入り直す
      s.loggedIn = false; await login(s, mail, password);
      r = await s.req(page);
      if (isLoginPage(r)) throw new Error('エステ魂のログインが続けて切れました。しばらくしてからもう一度お試しください。');
    }
    const date = dateOf(r.text, i, iso(want));   // 深夜はエステ魂側が前日扱いのこともあるので、エステ魂の日付に合わせる
    const list = parseDay(r.text);
    if (list === null && !/の出勤セラピストがおりません/.test(r.text)) {
      throw new Error('エステ魂の出勤表（' + date + '）を読み取れませんでした。画面の作りが変わった可能性があります。');
    }
    days[date] = [];
    (list || []).forEach((c) => {
      casts[c.castId] = { castId: c.castId, name: c.name, img: c.img };
      const sh = toShift(c.slots);
      if (sh) days[date].push(Object.assign({ castId: c.castId }, sh));
    });
    if (opt.wait !== 0) await new Promise((ok) => setTimeout(ok, opt.wait || 700));   // エステ魂に負担をかけないよう少し間をあける
  }
  return { days, casts: Object.values(casts), session: s };
}

// 公開ページから年齢を読む（新しく見つかったセラピストのときだけ使う）
async function fetchAge(shopId, castId) {
  try {
    const r = await session().req('/shop/' + shopId + '/cast/' + castId + '/');
    const m = /class="therapist_name"[^>]*>[^<]*\((\d{2})\)/.exec(r.text);   // 例 <h3 class="therapist_name"> みあ♡(29) </h3>
    return m ? Number(m[1]) : 0;
  } catch (e) { return 0; }
}

async function fetchImage(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('画像を取得できませんでした');
  const type = r.headers.get('content-type') || '';
  if (!/^image\/(jpeg|png|webp)/.test(type)) throw new Error('画像の形式が違います');
  return { buf: Buffer.from(await r.arrayBuffer()), ext: type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg' };
}

module.exports = { fetchSchedule, fetchAge, fetchImage, parseDay, toShift, dateOf, session };
