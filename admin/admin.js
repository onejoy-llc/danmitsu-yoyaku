(function () {
  'use strict';

  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var ST = { new: '新規', confirmed: '確定', cancelled: 'キャンセル' };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var yen = function (n) { return Number(n).toLocaleString('ja-JP'); };
  var toMin = function (hm) { var p = hm.split(':'); return +p[0] * 60 + +p[1]; };
  var hm = function (m) { return Math.floor(m / 60) % 24 + ':' + pad(m % 60); };
  var hm2 = function (s) { var p = s.split(':'); return pad(+p[0]) + ':' + p[1]; };      // input[type=time] 用
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var jp = function (s) { var d = parse(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD[d.getDay()] + '）'; };

  var today = iso(new Date());
  var DATA = null, RES = [], EST = null;
  var ui = { tab: 'res', filter: 'new', date: today };

  /* ---------- 通信 ---------- */
  // GitHub Pages などサーバーのない場所では、ブラウザの中だけで動くデモ表示にする
  var DEMO = false, demoData = null, DEMO_KEY = 'danmitsu.demoRes';
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  function demoRes(list) {
    if (list) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(list)); } catch (e) {} return list; }
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]'); } catch (e) { return []; }
  }
  // デモ用の見本予約（名前・電話番号は架空）
  function sampleRes() {
    var now = new Date(), today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    var who = [['山田', '09000000001', ''], ['佐藤', '09000000002', '初めてです'], ['鈴木', '09000000003', ''], ['田中', '09000000004', '少し遅れるかもしれません']];
    var st = ['new', 'new', 'confirmed', 'cancelled'], out = [], c = demoData.courses;
    Object.keys(demoData.days).sort().filter(function (d) { return d >= today; }).forEach(function (d) {
      demoData.days[d].forEach(function (e) {
        if (out.length >= who.length) return;
        var g = demoData.girls.filter(function (x) { return x.id === e.id; })[0], co = c[out.length % c.length];
        var t = toMin(e.from) + 60;
        if (!g || t + co.min > toMin(e.to)) return;
        var i = out.length, created = new Date(now.getTime() - (i + 1) * 47 * 60000);
        out.push({ id: 'demo' + i, createdAt: created.toISOString(), status: st[i], girl_id: g.id, girl: g.name, age: g.age || 0, date: d, time: hm(t),
          course_id: co.id, course: co.name, min: co.min, price: co.price, tel: who[i][1], name: who[i][0] + '（見本）', biko: who[i][2], blocked: [] });
      });
    });
    return out;
  }
  function demoApi(method, url, body) {
    return new Promise(function (ok) {
      if (url === '/api/data') {
        if (method === 'PUT') {
          demoData = clone(body);
          Object.keys(demoData.days).forEach(function (k) {
            demoData.days[k].sort(function (x, y) { return toMin(x.from) - toMin(y.from); });
            if (!demoData.days[k].length) delete demoData.days[k];
          });
        }
        return ok(clone(demoData));
      }
      if (url === '/api/photo') throw new Error('デモ表示では写真を差し替えできません');
      var list = demoRes();
      if (url === '/api/reservations') return ok(list);
      var id = url.split('/').pop(), r = list.filter(function (x) { return x.id === id; })[0];
      if (!r) throw new Error('予約が見つかりません');
      var e = r.girl_id ? (demoData.days[r.date] || []).filter(function (x) { return x.id === r.girl_id; })[0] : null;
      var release = function () { if (e) e.booked = e.booked.filter(function (t) { return (r.blocked || []).indexOf(t) < 0; }); r.blocked = []; };
      if (method === 'DELETE') { release(); list = list.filter(function (x) { return x !== r; }); }
      else {
        if (r.status === 'confirmed' && body.status !== 'confirmed') release();
        if (r.status !== 'confirmed' && body.status === 'confirmed' && e) {
          r.blocked = [];
          for (var m = toMin(r.time); m < toMin(r.time) + r.min; m += 10) if (e.booked.indexOf(hm(m)) < 0) { e.booked.push(hm(m)); r.blocked.push(hm(m)); }
        }
        r.status = body.status;
      }
      ok({ ok: true, note: '', reservations: demoRes(list) });
    });
  }

  function api(method, url, body) {
    if (DEMO) return demoApi(method, url, body);
    return fetch(url, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || '通信に失敗しました（' + r.status + '）'); return j; }); });
  }
  var toastTimer;
  function toast(msg, bad) {
    var t = $('toast'); t.textContent = msg; t.className = 'toast is-on' + (bad ? ' is-bad' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'toast'; }, bad ? 5000 : 2200);
  }
  function fail(e) { toast(e.message || 'エラーが発生しました', true); }

  function save(msg) {
    return api('PUT', '/api/data', DATA).then(function (d) { DATA = d; toast(msg || '保存しました'); render(); })
      .catch(function (e) { fail(e); return api('GET', '/api/data').then(function (d) { DATA = d; render(); }); });
  }
  function loadRes(quiet) {
    return api('GET', '/api/reservations').then(function (r) {
      var before = RES.length; RES = r; badge();
      if (ui.tab === 'res' && (!quiet || r.length !== before)) render();
      if (quiet && r.length > before) toast('新しい予約が届きました');
    });
  }
  function badge() {
    var n = RES.filter(function (r) { return r.status === 'new'; }).length;
    $('badge').hidden = !n; $('badge').textContent = n;
  }
  function girl(id) { return DATA.girls.filter(function (g) { return g.id === id; })[0]; }
  var ageTxt = function (g) { return g.age ? g.age + '歳' : ''; };

  /* ---------- 画面 ---------- */
  function render() {
    var v = { res: viewRes, shift: viewShift, girl: viewGirl, course: viewCourse, shop: viewShop, est: viewEst }[ui.tab];
    $('view').innerHTML = v();
    [].forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.setAttribute('aria-current', b.dataset.tab === ui.tab); });
  }

  function viewRes() {
    var counts = { new: 0, confirmed: 0, cancelled: 0 };
    RES.forEach(function (r) { counts[r.status]++; });
    var list = RES.filter(function (r) { return ui.filter === 'all' || r.status === ui.filter; })
      .sort(function (a, b) { return ui.filter === 'new' ? (a.createdAt < b.createdAt ? 1 : -1) : ((a.date + hm2(a.time)) < (b.date + hm2(b.time)) ? -1 : 1); });
    var h = '<div class="h"><h1>予約</h1><p>30秒ごとに自動で更新</p></div>' +
      (DEMO || (EST && EST.hasPassword) ? '<p class="lead">予約を確定すると、この予約サイトではその時間が × になります。エステ魂には自動で反映されないので、エステ魂の出勤表は手で × にしてください。</p>' : '') +
      '<div class="seg">' +
      [['new', '新規 ' + counts.new], ['confirmed', '確定 ' + counts.confirmed], ['cancelled', 'キャンセル ' + counts.cancelled], ['all', 'すべて ' + RES.length]].map(function (f) {
        return '<button type="button" data-act="filter" data-v="' + f[0] + '" aria-pressed="' + (ui.filter === f[0]) + '">' + f[1] + '</button>';
      }).join('') + '</div>';
    if (!list.length) return h + '<p class="empty">' + (ui.filter === 'new' ? '新しい予約はありません。' : '該当する予約はありません。') + '</p>';
    return h + list.map(function (r) {
      var c = new Date(r.createdAt);
      var act = '';
      if (r.status !== 'confirmed') act += '<button type="button" class="btn btn--s" data-act="res-status" data-id="' + r.id + '" data-v="confirmed">確定する</button>';
      if (r.status !== 'cancelled') act += '<button type="button" class="btn btn--line btn--s" data-act="res-status" data-id="' + r.id + '" data-v="cancelled">キャンセルにする</button>';
      if (r.status !== 'new') act += '<button type="button" class="btn btn--line btn--s" data-act="res-status" data-id="' + r.id + '" data-v="new">新規に戻す</button>';
      act += '<button type="button" class="btn btn--danger btn--s" data-act="res-del" data-id="' + r.id + '">削除</button>';
      return '<article class="card rv is-' + r.status + '"><div class="rv__top"><p class="rv__when num">' + jp(r.date) + ' ' + esc(r.time) + '～' + hm(toMin(r.time) + r.min) +
        '<small>受付 ' + (c.getMonth() + 1) + '/' + c.getDate() + ' ' + c.getHours() + ':' + pad(c.getMinutes()) + '</small></p><span class="st st--' + r.status + '">' + ST[r.status] + '</span></div>' +
        '<dl><dt>セラピスト</dt><dd>' + esc(r.girl) + (r.age ? '（' + r.age + '）' : '') + '</dd>' +
        '<dt>コース</dt><dd class="num">' + esc(r.course) + '　' + r.min + '分　￥' + yen(r.price) + '</dd>' +
        '<dt>お名前</dt><dd>' + esc(r.name) + '</dd>' +
        '<dt>電話番号</dt><dd class="num"><a href="tel:' + esc(r.tel) + '">' + esc(r.tel) + '</a></dd>' +
        (r.biko ? '<dt>備考</dt><dd>' + esc(r.biko) + '</dd>' : '') + '</dl><div class="rv__act">' + act + '</div></article>';
    }).join('');
  }

  function viewShift() {
    var dates = [];
    for (var i = 0; i < 14; i++) { var t = parse(today); t.setDate(t.getDate() + i); dates.push(iso(t)); }
    var h = '<div class="h"><h1>出勤</h1><p>' + jp(ui.date) + '</p></div><div class="days">' + dates.map(function (s) {
      var d = parse(s), n = (DATA.days[s] || []).length;
      return '<button type="button" class="day" data-act="date" data-v="' + s + '" aria-pressed="' + (s === ui.date) + '"><span>' + WD[d.getDay()] + '</span><b class="num">' + d.getDate() + '</b><em>' + (n ? n + '名' : '') + '</em></button>';
    }).join('') + '<input type="date" id="dateAny" value="' + ui.date + '" aria-label="ほかの日付"></div>';

    var list = DATA.days[ui.date] || [];
    if (!list.length) h += '<p class="empty">この日の出勤はまだ登録されていません。</p>';
    h += list.map(function (e) {
      var g = girl(e.id);
      if (g.estama) {   // エステ魂から取り込んだ出勤：ここでは変えられない（次の取り込みで上書きされるため）
        var open = (toMin(e.to) - toMin(e.from)) / 10 - e.booked.length;
        return '<article class="card sf"><img class="sf__img" src="../' + esc(g.img) + '" alt=""><div>' +
          '<p class="sf__name"><span class="tag tag--est">エステ魂</span>' + esc(g.name) + '<small>' + ageTxt(g) + '</small></p>' +
          '<p class="sf__fixed num">' + esc(e.from) + '～' + esc(e.to) + (e.full ? '　満員御礼' : '　予約済み ' + e.booked.length * 10 + '分 / 空き ' + Math.max(0, open) * 10 + '分') +
          '<small>時間や空きの変更はエステ魂の管理画面で行ってください。' + (EST && EST.auto ? EST.every + '分ごとに' : '取り込むと') + 'ここに反映されます。</small></p></div></article>';
      }
      return '<article class="card sf"><img class="sf__img" src="../' + esc(g.img) + '" alt=""><div>' +
        '<p class="sf__name">' + esc(g.name) + '<small>' + ageTxt(g) + '</small></p>' +
        '<div class="sf__time"><input type="time" step="600" value="' + hm2(e.from) + '" data-chg="from" data-id="' + e.id + '" aria-label="開始">～<input type="time" step="600" value="' + hm2(e.to) + '" data-chg="to" data-id="' + e.id + '" aria-label="終了"></div>' +
        '<div class="sf__row"><label class="sw"><input type="checkbox" data-chg="full" data-id="' + e.id + '"' + (e.full ? ' checked' : '') + '><i></i>満員御礼</label>' +
        '<button type="button" class="btn btn--line btn--s" data-act="slots" data-id="' + e.id + '">予約済みの枠 ' + e.booked.length + '</button>' +
        '<button type="button" class="btn btn--danger btn--s" data-act="shift-del" data-id="' + e.id + '">外す</button></div></div></article>';
    }).join('');

    var on = {}; list.forEach(function (e) { on[e.id] = 1; });
    var rest = DATA.girls.filter(function (g) { return !on[g.id] && !g.estama; });
    if (rest.length) {
      h += '<div class="add"><h2>出勤を追加</h2><select id="addGirl" aria-label="セラピスト">' + rest.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + (g.age ? '（' + g.age + '）' : '') + '</option>'; }).join('') + '</select>' +
        '<div class="add__t"><input type="time" step="600" id="addFrom" value="12:00" aria-label="開始">～<input type="time" step="600" id="addTo" value="18:00" aria-label="終了"></div>' +
        '<button type="button" class="btn" data-act="shift-add">追加する</button></div>';
    }
    return h;
  }

  function viewGirl() {
    return '<div class="h"><h1>セラピスト</h1><button type="button" class="btn btn--s" data-act="girl-edit" data-id="0">新しく追加</button></div>' +
      '<p class="lead">在籍 ' + DATA.girls.length + '名。名前を押すと編集できます。</p>' +
      DATA.girls.map(function (g) {
        var next = Object.keys(DATA.days).sort().filter(function (s) { return s >= today && DATA.days[s].some(function (e) { return e.id === g.id; }); })[0];
        return '<article class="card gl"><img class="gl__img" src="../' + esc(g.img) + '" alt="" loading="lazy"><div><p class="gl__name">' + (g.estama ? '<span class="tag tag--est">エステ魂</span>' : '') + (g.new ? '<span class="tag">NEW</span>' : '') + esc(g.name) + '</p>' +
          '<p class="gl__sub">' + (g.age ? g.age + '歳　' : '年齢未登録　') + (next ? '次回 ' + jp(next) : '出勤予定なし') + '</p></div>' +
          '<button type="button" class="btn btn--line btn--s" data-act="girl-edit" data-id="' + g.id + '">編集</button></article>';
      }).join('');
  }

  function viewCourse() {
    return '<div class="h"><h1>コース</h1><button type="button" class="btn btn--s" data-act="course-edit" data-id="0">新しく追加</button></div>' +
      '<p class="lead">予約サイトにはこの並び順で表示されます。</p>' +
      DATA.courses.map(function (c) {
        return '<article class="card cs"><div><b>' + esc(c.name) + '</b><small>' + c.min + '分' + (c.desc ? '　' + esc(c.desc) : '') + '</small></div><strong class="num">￥' + yen(c.price) + '</strong>' +
          '<button type="button" class="btn btn--line btn--s" data-act="course-edit" data-id="' + c.id + '">編集</button></article>';
      }).join('');
  }

  function field(k, label, v, o) {
    o = o || {};
    if (o.type === 'textarea') return '<div class="f"><label for="f_' + k + '">' + label + '</label><textarea id="f_' + k + '" name="' + k + '">' + esc(v) + '</textarea>' + (o.hint ? '<small>' + o.hint + '</small>' : '') + '</div>';
    if (o.type === 'checkbox') return '<div class="f f--check"><label><input type="checkbox" name="' + k + '"' + (v ? ' checked' : '') + '>' + label + '</label></div>';
    return '<div class="f"><label for="f_' + k + '">' + label + '</label><input id="f_' + k + '" name="' + k + '" type="' + (o.type || 'text') + '" value="' + esc(v) + '"' +
      (o.type === 'number' ? ' inputmode="numeric" min="0"' : '') + (o.step ? ' step="' + o.step + '"' : '') + '>' + (o.hint ? '<small>' + o.hint + '</small>' : '') + '</div>';
  }

  function viewShop() {
    var s = DATA.shop, a = s.asOf.split(' ');
    return '<div class="h"><h1>店舗情報</h1><p>最終更新 ' + jp(a[0]) + ' ' + a[1] + '</p></div><form class="form" id="shopForm">' +
      '<h2>店名</h2>' + field('name', '店名（ページのタイトルなど）', s.name) +
      '<div class="two">' + field('brand', '屋号', s.brand) + field('kana', 'よみ', s.kana) + '</div>' +
      '<div class="two">' + field('branch', '店舗名', s.branch) + field('en', '英字表記', s.en) + '</div>' +
      '<h2>トップ写真</h2><div class="f f--photo"><img id="heroPrev" src="../' + esc(s.hero) + '" alt=""><div><input type="file" id="heroFile" accept="image/jpeg,image/png,image/webp"><small style="display:block;margin-top:6px;font-size:11.5px;color:var(--ink-3)">選ぶとすぐに差し替わります。縦長の写真がきれいに収まります。</small></div></div>' +
      '<h2>ご案内</h2>' + field('lead', '紹介文', s.lead, { type: 'textarea' }) +
      field('access', 'アクセス', s.access.join('\n'), { type: 'textarea', hint: '1行に1つずつ書いてください' }) +
      field('hours', '営業時間', s.hours) +
      field('pay', 'お支払い方法', s.pay.join('\n'), { type: 'textarea', hint: '1行に1つずつ書いてください' }) +
      field('tel', '電話番号', s.tel, { type: 'tel', hint: 'ハイフンなし。予約サイトの「電話する」ボタンに使われます' }) +
      field('recruit', '求人のひとこと', s.recruit) +
      '<h2>フリー（指名なし）</h2>' + field('freeHours', '表示する受付時間', s.freeHours) +
      '<div class="two">' + field('freeFrom', '選べる時間：開始', s.freeFrom, { hint: '例 10:00' }) + field('freeTo', '選べる時間：終了', s.freeTo, { hint: '翌6時は 30:00 と書きます' }) + '</div>' +
      field('freeNote', 'フリーの説明文', s.freeNote, { type: 'textarea' }) +
      '<button type="submit" class="btn" style="height:48px;width:100%">店舗情報を保存する</button></form>';
  }

  function viewEst() {
    var h = '<div class="h"><h1>エステ魂</h1></div><p class="lead">エステ魂の出勤表を読み込んで、この予約サイトの出勤と空き状況に反映します。エステ魂の内容は読むだけで、書き換えません。</p>';
    if (DEMO) return h + '<p class="empty">デモ表示では使えません。<br><small>お店のパソコンで <code>node server.js</code> を起動して開いた管理画面から設定してください。</small></p>';
    if (!EST) return h + '<p class="empty">読み込んでいます…</p>';
    var L = EST.last, st;
    if (EST.running) st = '<p class="est-st">いま取り込み中です…</p>';
    else if (!L) st = '<p class="est-st">まだ取り込んでいません。</p>';
    else {
      var t = new Date(L.at), when = (t.getMonth() + 1) + '/' + t.getDate() + ' ' + t.getHours() + ':' + pad(t.getMinutes()) + '（' + esc(L.reason) + '）';
      st = L.ok
        ? '<p class="est-st"><b class="ok">取り込みました</b>　' + when + '<br>今日から' + L.days + '日分・出勤 ' + L.shifts + '件' +
          (L.added && L.added.length ? '<br>新しく追加したセラピスト：' + L.added.map(esc).join('、') + '（年齢と写真は「セラピスト」で確認してください）' : '') + '</p>'
        : '<p class="est-st"><b class="ng">取り込めませんでした</b>　' + when + '<br>' + esc(L.error) + '</p>';
    }
    return h + '<div class="card">' + st + '</div><form class="form" id="estForm">' +
      '<h2>ログイン情報</h2>' +
      '<div class="f"><label for="f_estMail">メールアドレス</label><input id="f_estMail" name="mail" type="email" autocomplete="off" value="' + esc(EST.mail) + '"></div>' +
      '<div class="f"><label for="f_estPw">パスワード</label><input id="f_estPw" name="password" type="password" autocomplete="new-password" placeholder="' + (EST.hasPassword ? '保存済み（変えるときだけ入力）' : '') + '">' +
      '<small>このパソコンの中（data フォルダ）にだけ保存され、外には送られません。</small></div>' +
      '<div class="f"><span><label class="sw"><input type="checkbox" name="auto"' + (EST.auto ? ' checked' : '') + '><i></i>' + EST.every + '分ごとに自動で取り込む</label></span></div>' +
      '<div class="est-act"><button type="submit" class="btn"' + (EST.running ? ' disabled' : '') + '>保存して今すぐ取り込む</button>' +
      (EST.hasPassword ? '<button type="button" class="btn btn--line" data-act="est-sync"' + (EST.running ? ' disabled' : '') + '>今すぐ取り込む</button>' +
        '<button type="button" class="btn btn--danger" data-act="est-off">連携をやめる</button>' : '') + '</div></form>' +
      '<p class="note">・エステ魂のセラピストは、名前が同じ人と自動でつなぎます。いない人は新しく追加します。<br>' +
      '・つながったセラピストの出勤は、エステ魂の内容で上書きされます（時間・○×・満員）。エステ魂で ×・TEL の時間は、予約サイトで選べなくなります。<br>' +
      '・このサイトで「確定」にした予約の時間は、取り込んだ後も × のままです。<br>' +
      '・取り込みはこの管理画面のサーバー（node server.js）が動いている間だけ行われます。</p>';
  }
  function loadEst() {
    if (DEMO) return Promise.resolve();
    return api('GET', '/api/estama').then(function (j) { EST = j; if (ui.tab === 'est') render(); });
  }
  function estSync() {
    EST.running = true; render(); toast('エステ魂から取り込んでいます…');
    return api('POST', '/api/estama/sync').then(function (j) {
      DATA = j.data; toast('エステ魂から出勤を取り込みました');
    }).catch(fail).then(loadEst);
  }

  /* ---------- ダイアログ ---------- */
  var dlgSave = null, dlgDel = null;
  function openDlg(title, bodyHtml, o) {
    $('dlgTitle').textContent = title; $('dlgBody').innerHTML = bodyHtml;
    dlgSave = o.save; dlgDel = o.del || null;
    $('dlgFoot').innerHTML = (o.del ? '<button type="button" class="btn btn--danger" data-act="dlg-del">' + (o.delLabel || '削除') + '</button>' : '') +
      '<button type="submit" class="btn">' + (o.saveLabel || '保存する') + '</button>';
    $('dlg').showModal();
  }
  function closeDlg() { $('dlg').close(); }
  $('dlgForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var r; try { r = dlgSave(new FormData(ev.target)); } catch (e) { return fail(e); }
    Promise.resolve(r).then(function (ok) { if (ok !== false) closeDlg(); }).catch(fail);
  });

  // 写真は縦900pxまでに縮めてJPEGにする
  function shrink(file) {
    return new Promise(function (ok, ng) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return ng(new Error('画像は JPEG / PNG / WebP を選んでください'));
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 900 / img.height, 900 / img.width);
        var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = function () { URL.revokeObjectURL(url); ng(new Error('画像を読み込めませんでした')); };
      img.src = url;
    });
  }

  function editGirl(id) {
    var g = id ? girl(id) : { id: 0, name: '', age: '', new: true, img: '' };
    var photo = null;
    openDlg(id ? 'セラピストを編集' : 'セラピストを追加',
      '<div class="f f--photo"><img id="gPrev" src="' + (g.img ? '../' + esc(g.img) : '') + '" alt=""><div><span class="l" style="display:block;font-size:12.5px;font-weight:600;margin-bottom:5px">写真</span><input type="file" id="gFile" accept="image/jpeg,image/png,image/webp"></div></div>' +
      field('name', '名前', g.name) + field('age', '年齢', g.age, { type: 'number' }) + field('new', 'NEW（新人）マークを付ける', g.new, { type: 'checkbox' }), {
        save: function (fd) {
          var name = String(fd.get('name')).trim(), age = Number(fd.get('age'));
          if (!name) throw new Error('名前を入力してください');
          if (!(age > 0)) throw new Error('年齢を入力してください');
          if (!id && !photo) throw new Error('写真を選んでください');
          var newId = id || Math.max.apply(null, DATA.girls.map(function (x) { return x.id; }).concat([0])) + 1;
          var up = photo ? api('POST', '/api/photo', { id: newId, data: photo }) : Promise.resolve({ img: g.img });
          return up.then(function (r) {
            var rec = { id: newId, name: name, age: age, new: fd.get('new') === 'on', img: r.img };
            if (id) DATA.girls[DATA.girls.indexOf(g)] = rec; else DATA.girls.push(rec);
            return save(id ? '保存しました' : name + ' さんを追加しました');
          });
        },
        del: id ? function () {
          if (!confirm(g.name + ' さんを削除します。登録済みの出勤も一緒に消えます。よろしいですか？')) return false;
          DATA.girls = DATA.girls.filter(function (x) { return x.id !== id; });
          Object.keys(DATA.days).forEach(function (s) { DATA.days[s] = DATA.days[s].filter(function (e) { return e.id !== id; }); });
          return save('削除しました');
        } : null
      });
    $('gFile').addEventListener('change', function () {
      if (!this.files[0]) return;
      shrink(this.files[0]).then(function (d) { photo = d; $('gPrev').src = d; }).catch(fail);
    });
  }

  function editCourse(id) {
    var c = id ? DATA.courses.filter(function (x) { return x.id === id; })[0] : { id: 0, name: '', min: '', price: '', desc: '' };
    openDlg(id ? 'コースを編集' : 'コースを追加',
      field('name', 'コース名', c.name, { hint: '例 90min、泡100min' }) +
      '<div class="two">' + field('min', '時間（分）', c.min, { type: 'number', step: 10 }) + field('price', '料金（円）', c.price, { type: 'number', step: 100 }) + '</div>' +
      field('desc', '説明', c.desc, { type: 'textarea' }), {
        save: function (fd) {
          var rec = { id: id || Math.max.apply(null, DATA.courses.map(function (x) { return x.id; }).concat([0])) + 1,
            name: String(fd.get('name')).trim(), min: Number(fd.get('min')), price: Number(fd.get('price')), desc: String(fd.get('desc')) };
          if (!rec.name) throw new Error('コース名を入力してください');
          if (!(rec.min > 0)) throw new Error('時間（分）を入力してください');
          if (!(rec.price >= 0) || fd.get('price') === '') throw new Error('料金を入力してください');
          if (id) DATA.courses[DATA.courses.indexOf(c)] = rec; else DATA.courses.push(rec);
          DATA.courses.sort(function (a, b) { return a.min - b.min; });
          return save();
        },
        del: id ? function () {
          if (!confirm('「' + c.name + '」を削除します。よろしいですか？')) return false;
          DATA.courses = DATA.courses.filter(function (x) { return x.id !== id; });
          return save('削除しました');
        } : null
      });
  }

  function editSlots(id) {
    var e = DATA.days[ui.date].filter(function (x) { return x.id === id; })[0], g = girl(id);
    var set = {}; e.booked.forEach(function (t) { set[t] = 1; });
    var h = '<p class="lead" style="margin:0 0 12px">押した時間は予約サイトで選べなくなります（取り消し線の表示）。もう一度押すと元に戻ります。</p><div class="slots" id="slotGrid">';
    for (var m = Math.ceil(toMin(e.from) / 10) * 10; m < toMin(e.to); m += 10) {
      h += '<button type="button" class="num" data-t="' + hm(m) + '" aria-pressed="' + !!set[hm(m)] + '">' + hm(m) + '</button>';
    }
    openDlg(g.name + '　' + jp(ui.date), h + '</div>', {
      save: function () {
        e.booked = [].map.call(document.querySelectorAll('#slotGrid [aria-pressed="true"]'), function (b) { return b.dataset.t; });
        return save();
      }
    });
    $('slotGrid').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
    });
  }

  /* ---------- 操作 ---------- */
  $('tabs').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    ui.tab = b.dataset.tab; render(); window.scrollTo(0, 0);
    if (ui.tab === 'res') loadRes().catch(fail);
    if (ui.tab === 'est') loadEst().catch(fail);
    if ((ui.tab === 'shift' || ui.tab === 'girl') && !DEMO) {   // 自動取り込みの結果を見せるため最新を読む
      Promise.all([api('GET', '/api/data'), loadEst()]).then(function (r) { DATA = r[0]; if (!$('dlg').open) render(); }).catch(fail);
    }
  });

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]'); if (!b) return;
    var act = b.dataset.act, id = Number(b.dataset.id), v = b.dataset.v;
    if (act === 'filter') { ui.filter = v; render(); }
    else if (act === 'date') { ui.date = v; render(); }
    else if (act === 'dlg-close') closeDlg();
    else if (act === 'dlg-del') { Promise.resolve(dlgDel()).then(function (ok) { if (ok !== false) closeDlg(); }).catch(fail); }
    else if (act === 'girl-edit') editGirl(id);
    else if (act === 'est-sync') estSync();
    else if (act === 'est-off') {
      if (!confirm('エステ魂との連携をやめて、保存したメールアドレスとパスワードを消します。取り込み済みの出勤はそのまま残ります。よろしいですか？')) return;
      api('DELETE', '/api/estama').then(function (j) { EST = j; render(); toast('連携をやめました'); }).catch(fail);
    }
    else if (act === 'course-edit') editCourse(id);
    else if (act === 'slots') editSlots(id);
    else if (act === 'shift-del') {
      var g = girl(id);
      if (!confirm(jp(ui.date) + ' の ' + g.name + ' さんの出勤を外します。よろしいですか？')) return;
      DATA.days[ui.date] = DATA.days[ui.date].filter(function (e) { return e.id !== id; });
      save('出勤を外しました');
    }
    else if (act === 'shift-add') {
      var from = $('addFrom').value, to = $('addTo').value;
      if (!from || !to || toMin(to) <= toMin(from)) return toast('終了は開始より後の時間にしてください', true);
      (DATA.days[ui.date] = DATA.days[ui.date] || []).push({ id: Number($('addGirl').value), from: hm(toMin(from)).replace(/^(\d):/, '0$1:'), to: hm(toMin(to)).replace(/^(\d):/, '0$1:'), full: false, booked: [] });
      save('出勤を追加しました');
    }
    else if (act === 'res-status') {
      api('PATCH', '/api/reservations/' + b.dataset.id, { status: v }).then(function (r) {
        RES = r.reservations; badge();
        return api('GET', '/api/data').then(function (d) { DATA = d; render(); toast(r.note || (v === 'confirmed' ? '確定しました。その時間は予約サイトで選べなくなります' : '更新しました')); });
      }).catch(fail);
    }
    else if (act === 'res-del') {
      if (!confirm('この予約を削除します。元に戻せません。よろしいですか？')) return;
      api('DELETE', '/api/reservations/' + b.dataset.id).then(function (r) {
        RES = r.reservations; badge();
        return api('GET', '/api/data').then(function (d) { DATA = d; render(); toast('削除しました'); });
      }).catch(fail);
    }
  });

  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.id === 'dateAny' && t.value) { ui.date = t.value; render(); return; }
    if (t.id === 'heroFile' && t.files[0]) {
      shrink(t.files[0]).then(function (d) { return api('POST', '/api/photo', { kind: 'shop', data: d }); })
        .then(function (r) { DATA.shop.hero = r.img; return save('トップ写真を差し替えました'); }).catch(fail);
      return;
    }
    if (!t.dataset.chg) return;
    var e = DATA.days[ui.date].filter(function (x) { return x.id === Number(t.dataset.id); })[0];
    if (t.dataset.chg === 'full') { e.full = t.checked; save(t.checked ? '満員御礼にしました' : '受付中に戻しました'); return; }
    if (!t.value) return render();
    var val = t.value, from = t.dataset.chg === 'from' ? val : e.from, to = t.dataset.chg === 'to' ? val : e.to;
    if (toMin(to) <= toMin(from)) { toast('終了は開始より後の時間にしてください', true); return render(); }
    e[t.dataset.chg] = val;
    e.booked = e.booked.filter(function (b) { return toMin(b) >= toMin(from) && toMin(b) < toMin(to); });
    save('出勤時間を変更しました');
  });

  document.addEventListener('submit', function (ev) {
    if (ev.target.id === 'estForm') {
      ev.preventDefault();
      var ef = new FormData(ev.target);
      var body = { mail: String(ef.get('mail')).trim(), password: String(ef.get('password')), auto: ef.get('auto') === 'on' };
      if (!body.mail) return toast('メールアドレスを入力してください', true);
      if (!body.password && !EST.hasPassword) return toast('パスワードを入力してください', true);
      api('PUT', '/api/estama', body).then(function (j) { EST = j; return estSync(); }).catch(fail);
      return;
    }
    if (ev.target.id !== 'shopForm') return;
    ev.preventDefault();
    var fd = new FormData(ev.target), s = DATA.shop;
    var lines = function (k) { return String(fd.get(k)).split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
    var ft = String(fd.get('freeFrom')).trim(), tt = String(fd.get('freeTo')).trim();
    if (!/^\d{1,2}:\d{2}$/.test(ft) || !/^\d{1,2}:\d{2}$/.test(tt) || toMin(tt) <= toMin(ft)) return toast('フリーの選べる時間は 10:00 や 30:00 の形で、終了を開始より後にしてください', true);
    if (!/^0\d{9,10}$/.test(String(fd.get('tel')).trim())) return toast('電話番号をハイフンなしで入力してください', true);
    ['name', 'brand', 'kana', 'branch', 'en', 'lead', 'hours', 'tel', 'recruit', 'freeHours', 'freeNote'].forEach(function (k) { s[k] = String(fd.get(k)).trim(); });
    s.access = lines('access'); s.pay = lines('pay'); s.freeFrom = ft; s.freeTo = tt;
    save('店舗情報を保存しました');
  });

  /* ---------- 起動 ---------- */
  function start() {
    return Promise.all([api('GET', '/api/data'), api('GET', '/api/reservations')]).then(function (r) {
      DATA = r[0]; RES = r[1]; badge(); render();
      loadEst().catch(function () {});
      setInterval(function () { if (!$('dlg').open) loadRes(true).catch(function () {}); }, 30000);
    });
  }
  function startDemo() {
    DEMO = true;
    return new Promise(function (ok, ng) {
      var sc = document.createElement('script'); sc.src = '../js/data.js'; sc.onload = ok; sc.onerror = function () { ng(new Error('データを読み込めませんでした')); };
      document.head.appendChild(sc);
    }).then(function () {
      demoData = clone(window.DATA);
      if (localStorage.getItem(DEMO_KEY) === null) demoRes(sampleRes());   // 初めて開いたときは、見本の予約を入れておく
      var n = document.createElement('p'); n.className = 'demo';
      n.textContent = 'デモ表示です。ここでの変更は保存されず、予約サイトにも反映されません。予約タブには見本の予約と、このブラウザで予約サイトから入れた予約が表示されます。';
      document.body.insertBefore(n, $('tabs'));
      return start();
    });
  }
  fetch('/api/ping').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    .then(function (j) { return j && j.ok ? start() : startDemo(); })
    .catch(function (e) {
      $('view').innerHTML = '<p class="empty">管理画面を開けませんでした。<br><small>' + esc(e.message) + '</small></p>';
    });
})();
