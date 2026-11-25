(function () {
  'use strict';

  var D = window.DATA, S = D.shop;
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var FREE = 0;
  var DAYS_AHEAD = 14;
  var BANDS = [
    { key: 'day', label: '昼', from: 0, to: 15 * 60 },
    { key: 'eve', label: '夕方', from: 15 * 60, to: 19 * 60 },
    { key: 'night', label: '夜', from: 19 * 60, to: 24 * 60 },
    { key: 'late', label: '深夜', from: 24 * 60, to: 48 * 60 }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var yen = function (n) { return n.toLocaleString('ja-JP'); };
  var toMin = function (hm) { var p = hm.split(':'); return +p[0] * 60 + +p[1]; };
  var hm = function (m) { return Math.floor(m / 60) % 24 + ':' + pad(m % 60); };
  var hmLong = function (m) { return (m >= 1440 ? '翌' : '') + hm(m); };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var jp = function (s) { var d = parse(s); return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD[d.getDay()] + '）'; };
  var md = function (s) { var d = parse(s); return (d.getMonth() + 1) + '/' + d.getDate() + '(' + WD[d.getDay()] + ')'; };

  var today = iso(new Date());
  var dates = [];
  for (var i = 0; i < DAYS_AHEAD; i++) { var t = parse(today); t.setDate(t.getDate() + i); dates.push(iso(t)); }

  var girlById = {};
  D.girls.forEach(function (g) { girlById[g.id] = g; });
  var freeGirl = { id: FREE, name: 'フリー', age: 0, img: '' };

  function nowMin() { var n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
  function shiftsOn(date) { return D.days[date] || []; }
  function shiftOf(id, date) {
    if (id === FREE) return { id: FREE, from: S.freeFrom, to: S.freeTo, full: false, booked: [] };
    return shiftsOn(date).filter(function (e) { return e.id === id; })[0] || null;
  }
  // 10分刻みの枠。ok=false は受付不可（予約済み・過ぎた時間・満員）
  function slotsOf(id, date) {
    var e = shiftOf(id, date); if (!e) return [];
    var a = Math.ceil(toMin(e.from) / 10) * 10, b = toMin(e.to), out = [];
    var past = date === today ? nowMin() : -1;
    for (var m = a; m < b; m += 10) {
      out.push({ m: m, ok: !e.full && m > past && (e.booked || []).indexOf(hm(m)) < 0 });
    }
    return out;
  }
  function hasOpen(id, date) { return slotsOf(id, date).some(function (s) { return s.ok; }); }
  function courseOpen(c, id, date, start) {
    if (id === FREE) return true;
    var e = shiftOf(id, date); return !!e && start + c.min <= toMin(e.to);
  }
  function nextShift(id) {
    for (var i = 0; i < dates.length; i++) { if (shiftOf(id, dates[i]) && hasOpen(id, dates[i])) return dates[i]; }
    return null;
  }

  /* ---------- 店舗情報 ---------- */
  // 店名まわり：店舗情報（屋号・よみ・店舗名）から作る
  var fullName = S.brand + (S.kana ? '-' + S.kana + '-' : ' ') + S.branch;
  document.title = fullName + '｜ご予約';
  var md = document.querySelector('meta[name="description"]');
  if (md) md.setAttribute('content', fullName + 'のご予約ページ。出勤セラピストと空き時間を確認して、そのままご予約いただけます。');
  $('barBrand').textContent = S.brand;
  $('barSub').textContent = [S.kana, S.branch].filter(Boolean).join('　');
  $('footName').textContent = fullName;
  $('heroImg').alt = fullName;
  $('heroImg').src = S.hero;
  $('shopEn').textContent = S.en;
  $('shopBrand').textContent = S.brand + ' -' + S.kana + '-';
  $('shopBranch').textContent = S.branch;
  $('shopLead').textContent = S.lead;
  $('shopAccess').innerHTML = S.access.map(function (a) { return '<span>' + esc(a) + '</span>'; }).join('');
  $('shopHours').innerHTML = '<span class="num">' + esc(S.hours) + '</span>';
  $('shopPay').textContent = S.pay.join('・') + ' お支払い可能';
  $('shopRecruit').textContent = S.recruit;
  $('barTel').href = $('footTel').href = 'tel:' + S.tel;
  $('footTel').textContent = S.tel;
  $('footInfo').innerHTML = esc(S.access.join(' / ')) + '<br>営業時間 ' + esc(S.hours);
  (function () {
    var p = S.asOf.split(' '), d = parse(p[0]);
    $('footAsOf').textContent = '出勤・空き状況は ' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p[1] + ' 時点の内容です。';
  })();

  /* ---------- 一覧 ---------- */
  var state = { date: today };

  function renderDays() {
    $('days').innerHTML = dates.map(function (s) {
      var d = parse(s), w = d.getDay();
      var open = shiftsOn(s).some(function (e) { return hasOpen(e.id, s); });
      return '<button type="button" role="tab" class="day' + (w === 6 ? ' is-sat' : w === 0 ? ' is-sun' : '') + (open ? ' has-open' : '') +
        '" data-date="' + s + '" aria-selected="' + (s === state.date) + '" aria-label="' + jp(s) + '">' +
        '<span class="day__w">' + WD[w] + '</span><span class="day__d">' + d.getDate() + '</span>' +
        '<span class="day__m">' + (s === today ? '今日' : d.getDate() === 1 ? (d.getMonth() + 1) + '月' : '') + '</span></button>';
    }).join('');
    $('pickLabel').textContent = jp(state.date);
  }

  var chev = '<svg class="row__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  var freeThumb = '<span class="row__img row__img--free"><b>フリー</b><i>指名なし</i></span>';
  function nameHtml(g) {
    return (g.new ? '<span class="tag-new">NEW</span>' : '') + '<b>' + esc(g.name) + '</b>' + (g.age ? '<span>' + g.age + '歳</span>' : '');
  }

  function renderList() {
    var date = state.date, isToday = date === today;
    $('workTitle').textContent = isToday ? '本日の出勤' : md(date) + ' の出勤';
    var html = '<button type="button" class="row" data-girl="0">' + freeThumb +
      '<span><span class="row__name"><b>フリー</b><span>指名なし</span></span>' +
      '<span class="row__time"><small>店舗営業時間</small>' + esc(S.freeHours) + '</span>' +
      '<span class="row__desc">' + esc(S.freeNote) + '</span></span>' + chev + '</button>';

    var list = shiftsOn(date);
    html += list.map(function (e) {
      var g = girlById[e.id], open = hasOpen(e.id, date);
      var st = e.full ? ['is-full', '満員御礼'] : open ? ['is-ok', '受付中'] : ['is-full', '受付終了'];
      return '<button type="button" class="row' + (open ? '' : ' is-full') + '" data-girl="' + g.id + '">' +
        '<span class="row__img"><img src="' + g.img + '" alt="" loading="lazy" width="78" height="104"></span>' +
        '<span><span class="row__name">' + nameHtml(g) + '</span>' +
        '<span class="row__time"><small>' + (isToday ? '本日出勤' : '出勤時間') + '</small>' + e.from + '～' + e.to + '</span>' +
        '<span class="row__state ' + st[0] + '">' + st[1] + '</span></span>' + chev + '</button>';
    }).join('');
    if (!list.length) html += '<p class="rows__empty">この日の出勤はまだ登録されていません。フリーでのご予約は受け付けています。</p>';
    $('workList').innerHTML = html;

    var working = {}; list.forEach(function (e) { working[e.id] = 1; });
    $('restList').innerHTML = D.girls.filter(function (g) { return !working[g.id]; }).map(function (g) {
      var n = nextShift(g.id);
      return '<button type="button" class="cell" data-girl="' + g.id + '">' +
        '<span class="cell__img"><img src="' + g.img + '" alt="" loading="lazy" width="266" height="400">' + (g.new ? '<span class="tag-new">NEW</span>' : '') + '</span>' +
        '<span class="cell__name">' + esc(g.name) + (g.age ? '<span>' + g.age + '歳</span>' : '') + '</span>' +
        '<span class="cell__next' + (n ? ' is-set' : '') + '">' + (n ? '次回 ' + md(n) : '出勤予定 未定') + '</span></button>';
    }).join('');
  }

  $('days').addEventListener('click', function (ev) {
    var b = ev.target.closest('.day'); if (!b) return;
    state.date = b.dataset.date; renderDays(); renderList();
    var y = $('pick').offsetTop - 54;
    if (window.scrollY > y) window.scrollTo(0, y);
  });
  document.querySelector('.page').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-girl]'); if (b) openSheet(+b.dataset.girl);
  });

  /* ---------- 予約シート ---------- */
  var bk = null, lastFocus = null;
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem('danmitsu.customer') || '{}'); } catch (e) {}

  function openSheet(id) {
    var g = id === FREE ? freeGirl : girlById[id];
    var date = null;
    if (id === FREE) date = state.date;
    else if (shiftOf(id, state.date) && hasOpen(id, state.date)) date = state.date;
    else date = nextShift(id);
    bk = { girl: g, date: date, time: null, course: null, band: null, view: 'pick', tried: false,
      tel: saved.tel || '', name: saved.name || '', biko: '' };
    lastFocus = document.activeElement;
    renderSheet(true);
    $('sheet').classList.add('is-open'); $('sheet').setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    document.querySelector('.sheet__close').focus();
  }
  function closeSheet() {
    $('sheet').classList.remove('is-open'); $('sheet').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    bk = null;
  }

  function errors() {
    var e = {};
    if (!bk.tel) e.tel = '電話番号は入力必須です';
    else if (!/^0\d{9,10}$/.test(bk.tel)) e.tel = '電話番号をハイフンなしで入力して下さい';
    if (!bk.name.trim()) e.name = 'お名前は入力必須です';
    else if (bk.name.length > 30) e.name = 'お名前は30文字以内です';
    if (bk.biko.length > 1000) e.biko = '備考は1000文字以内です';
    return e;
  }
  function course() { return D.courses.filter(function (c) { return c.id === bk.course; })[0]; }

  function whoHtml() {
    var g = bk.girl;
    var thumb = g.id === FREE ? freeThumb : '<span class="who__img"><img src="' + g.img + '" alt=""></span>';
    var sub = g.id === FREE ? '店舗営業時間 ' + esc(S.freeHours) : '';
    if (g.id !== FREE && bk.date) { var e = shiftOf(g.id, bk.date); sub = md(bk.date) + '　' + e.from + '～' + e.to; }
    return '<div class="who">' + thumb + '<div><p class="who__name" id="sheetTitle">' + (g.new ? '<span class="tag-new" style="margin:0 8px 0 0;display:inline-block">NEW</span>' : '') +
      esc(g.name) + (g.age ? '<span>' + g.age + '歳</span>' : '') + '</p><p class="who__sub">' + sub + '</p></div></div>';
  }
  function stepHead(n, title, val) {
    return '<div class="step__h"><span class="step__n">' + n + '</span><span class="step__t">' + title + '</span>' + (val ? '<span class="step__v">' + val + '</span>' : '') + '</div>';
  }

  function pickHtml() {
    var g = bk.girl, h = whoHtml();

    // 1 日にち
    var chipDates = g.id === FREE ? dates : dates.filter(function (s) { return shiftOf(g.id, s); });
    h += '<section class="step">' + stepHead('01', '日にち', bk.date ? jp(bk.date) : '');
    if (!chipDates.length) {
      h += '<p class="step__msg">現在、出勤予定が登録されていません。<br>フリーでのご予約、またはお電話（' + esc(S.tel) + '）でお問い合わせください。</p></section>';
      return h;
    }
    h += '<div class="chips">' + chipDates.map(function (s) {
      var e = shiftOf(g.id, s), ok = hasOpen(g.id, s);
      var sub = g.id === FREE ? (s === today ? '今日' : WD[parse(s).getDay()] + '曜') : ok ? e.from + '～' + e.to : (e.full ? '満員御礼' : '受付終了');
      var d = parse(s);
      return '<button type="button" class="chip" data-date="' + s + '" aria-pressed="' + (s === bk.date) + '"' + (ok ? '' : ' disabled') + '><b>' +
        (d.getMonth() + 1) + '/' + d.getDate() + (g.id === FREE ? '' : '(' + WD[d.getDay()] + ')') + '</b><span>' + sub + '</span></button>';
    }).join('') + '</div></section>';
    if (!bk.date) {
      h += '<section class="step"><p class="step__msg">直近の出勤はすべて満員です。別のセラピスト、またはフリーでのご予約をご検討ください。</p></section>';
      return h;
    }

    // 2 時間
    var slots = slotsOf(g.id, bk.date);
    var bands = BANDS.filter(function (b) { return slots.some(function (s) { return s.m >= b.from && s.m < b.to; }); });
    if (!bk.band || !bands.some(function (b) { return b.key === bk.band; })) {
      var firstOk = slots.filter(function (s) { return s.ok; })[0];
      var hit = firstOk && bands.filter(function (b) { return firstOk.m >= b.from && firstOk.m < b.to; })[0];
      bk.band = (hit || bands[0]).key;
    }
    var band = BANDS.filter(function (b) { return b.key === bk.band; })[0];
    h += '<section class="step" id="stepTime">' + stepHead('02', '開始時間', bk.time != null ? hmLong(bk.time) + ' から' : '');
    if (bands.length > 1) {
      h += '<div class="bands">' + bands.map(function (b) {
        return '<button type="button" class="band" data-band="' + b.key + '" aria-pressed="' + (b.key === bk.band) + '">' + b.label + '</button>';
      }).join('') + '</div>';
    }
    var byHour = {};
    slots.forEach(function (s) { if (s.m >= band.from && s.m < band.to) (byHour[Math.floor(s.m / 60)] = byHour[Math.floor(s.m / 60)] || {})[s.m % 60] = s; });
    h += '<div class="hours">' + Object.keys(byHour).map(Number).sort(function (a, b) { return a - b; }).map(function (hr) {
      var cells = '';
      for (var q = 0; q < 60; q += 10) {
        var s = byHour[hr][q];
        cells += s ? '<button type="button" class="slot" data-time="' + s.m + '" aria-pressed="' + (s.m === bk.time) + '" aria-label="' + hmLong(s.m) + '"' + (s.ok ? '' : ' disabled') + '>:' + pad(q) + '</button>'
          : '<span class="slot is-none"></span>';
      }
      return '<div class="hour"><span class="hour__l">' + (hr >= 24 ? '<small>翌</small>' : '') + (hr % 24) + '時</span><div class="hour__s">' + cells + '</div></div>';
    }).join('') + '</div>';
    h += '<p class="legend">' + (g.id === FREE ? 'フリーは空き状況を確認のうえ、のちほどご連絡します。' : '取り消し線の時間は受付できません。') + '</p></section>';

    // 3 コース
    if (bk.time != null) {
      var c0 = course();
      h += '<section class="step" id="stepCourse">' + stepHead('03', 'コース', c0 ? c0.name : '');
      h += '<div class="courses">' + D.courses.map(function (c) {
        var ok = courseOpen(c, g.id, bk.date, bk.time), awa = c.name.indexOf('泡') === 0;
        return '<button type="button" class="course" data-course="' + c.id + '" aria-pressed="' + (c.id === bk.course) + '"' + (ok ? '' : ' disabled') + '>' +
          '<span class="course__r"></span><span class="course__n">' + c.min + '分' + (awa ? '<em>泡洗体付き</em>' : '') +
          '<span class="course__e">' + (ok ? hmLong(bk.time) + ' ～ ' + hmLong(bk.time + c.min) : '出勤時間内に収まりません') + '</span></span>' +
          '<span class="course__p">' + yen(c.price) + '<small>円</small></span></button>';
      }).join('') + '</div>';
      h += '<ul class="notes"><li>ご指名の場合1,000円追加になります。</li><li>泡コースは、通常コースにもっちり泡洗体がセットになったコースです。</li></ul></section>';
    }

    // 4 お客様情報
    if (bk.course) {
      var er = bk.tried ? errors() : {};
      h += '<section class="step" id="stepForm">' + stepHead('04', 'お客様情報', '') +
        '<div class="field' + (er.tel ? ' is-bad' : '') + '"><label for="fTel">電話番号<em>必須</em></label>' +
        '<input id="fTel" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="11" value="' + esc(bk.tel) + '">' +
        (er.tel ? '<p class="field__err">' + er.tel + '</p>' : '<p class="field__hint">ハイフンは入れずに入力してください</p>') + '</div>' +
        '<div class="field' + (er.name ? ' is-bad' : '') + '"><label for="fName">お名前<em>必須</em></label>' +
        '<input id="fName" type="text" autocomplete="name" maxlength="30" value="' + esc(bk.name) + '">' +
        (er.name ? '<p class="field__err">' + er.name + '</p>' : '<p class="field__hint">カタカナフルネームで入力してください</p>') + '</div>' +
        '<div class="field' + (er.biko ? ' is-bad' : '') + '"><label for="fBiko">備考</label>' +
        '<textarea id="fBiko" maxlength="1000">' + esc(bk.biko) + '</textarea>' +
        (er.biko ? '<p class="field__err">' + er.biko + '</p>' : '') + '</div></section>';
    }
    return h;
  }

  function billHtml() {
    var g = bk.girl, c = course();
    return '<dl class="bill">' +
      '<div><dt>セラピスト</dt><dd>' + esc(g.name) + (g.id !== FREE && g.age ? '（' + g.age + '）' : '') + '</dd></div>' +
      '<div><dt>予約日時</dt><dd>' + jp(bk.date) + ' ' + hmLong(bk.time) + '</dd></div>' +
      '<div><dt>コース</dt><dd>' + esc(c.name) + '<small>' + c.min + '分　￥' + yen(c.price) + '</small></dd></div>' +
      '<div><dt>電話番号</dt><dd>' + esc(bk.tel) + '</dd></div>' +
      '<div><dt>お名前</dt><dd>' + esc(bk.name) + '</dd></div>' +
      '<div><dt>備考</dt><dd>' + (bk.biko ? esc(bk.biko) : '<small>なし</small>') + '</dd></div></dl>';
  }
  function confirmHtml() {
    return '<div class="check"><p class="check__lead" id="sheetTitle">この内容で予約します。<br>よろしいですか？</p>' + billHtml() +
      '<ul class="cautions"><li>※不正予約や連続投稿が発覚した場合には記録し適切な対応をさせていただきます。</li>' +
      '<li>※指名料の追加や割引が発生する場合があります。</li>' +
      '<li>※キャンセルまたは変更がある場合はお店へ連絡してください。</li></ul></div>';
  }
  function doneHtml() {
    return '<div class="check"><div class="done__mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.500"/></svg></div>' +
      '<p class="check__lead" id="sheetTitle">以下の内容で仮予約が完了致しました。</p>' +
      '<p class="check__sub">店舗様からの連絡を受けてから本予約となります。</p>' + billHtml() +
      (window.RESERVE_ENDPOINT ? '' : '<p class="demo">現在は確認用の表示です。この予約内容は店舗へ送信されていません。お急ぎの場合はお電話（' + esc(S.tel) + '）でご連絡ください。</p>') +
      '</div>';
  }

  function footHtml() {
    if (bk.view === 'confirm') return '<button type="button" class="btn" id="btnSend">予約を確定する</button><button type="button" class="btn btn--line" id="btnEdit">内容を修正する</button>';
    if (bk.view === 'done') return '<button type="button" class="btn" data-close>閉じる</button>';
    if (!bk.date) return '<a class="btn" href="tel:' + S.tel + '">電話で問い合わせる</a>';
    var c = course(), parts = [md(bk.date)];
    if (bk.time != null) parts.push(hmLong(bk.time));
    if (c) parts.push(c.name + ' ￥' + yen(c.price));
    var next = bk.time == null ? '時間を選んでください' : !c ? 'コースを選んでください' : '';
    return '<p class="sum"><b>' + esc(bk.girl.name) + '</b>　' + parts.join('　') + '</p>' +
      '<button type="button" class="btn" id="btnNext"' + (next ? ' disabled' : '') + '>' + (next || '確認へ進む') + '</button>';
  }

  function renderSheet(resetScroll, scrollTo) {
    var body = $('sheetBody'), y = body.scrollTop;
    body.innerHTML = bk.view === 'confirm' ? confirmHtml() : bk.view === 'done' ? doneHtml() : pickHtml();
    $('sheetFoot').innerHTML = footHtml();
    $('sheetStep').textContent = bk.view === 'confirm' ? 'ご予約内容の確認' : bk.view === 'done' ? '仮予約完了' : 'ご予約';
    $('sheetBack').hidden = bk.view !== 'confirm';
    body.scrollTop = resetScroll ? 0 : y;
    if (scrollTo && $(scrollTo)) {
      var el = $(scrollTo);
      body.scrollTo({ top: el.offsetTop - body.offsetTop - 4, behavior: 'smooth' });
    }
  }

  $('sheet').addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.closest('[data-close]')) {
      var wasDone = bk && bk.view === 'done';
      closeSheet(); if (wasDone) window.scrollTo(0, 0);
      return;
    }
    if (!bk) return;
    var b;
    if ((b = t.closest('.chip'))) { bk.date = b.dataset.date; bk.time = null; bk.course = null; bk.band = null; renderSheet(false, 'stepTime'); }
    else if ((b = t.closest('.band'))) { bk.band = b.dataset.band; renderSheet(); }
    else if ((b = t.closest('.slot'))) {
      var m = +b.dataset.time;
      bk.time = bk.time === m ? null : m;
      var c = course();
      if (bk.time == null || (c && !courseOpen(c, bk.girl.id, bk.date, bk.time))) bk.course = null;
      renderSheet(false, bk.time != null && !bk.course ? 'stepCourse' : null);
    }
    else if ((b = t.closest('.course'))) {
      var id = +b.dataset.course; bk.course = bk.course === id ? null : id;
      renderSheet(false, bk.course ? 'stepForm' : null);
    }
    else if (t.id === 'btnNext') {
      bk.tried = true;
      var er = errors(), first = er.tel ? 'fTel' : er.name ? 'fName' : er.biko ? 'fBiko' : null;
      if (first) { renderSheet(false, 'stepForm'); $(first).focus({ preventScroll: true }); }
      else { bk.view = 'confirm'; renderSheet(true); }
    }
    else if (t.id === 'btnEdit' || t.id === 'sheetBack') { bk.view = 'pick'; renderSheet(false, 'stepForm'); }
    else if (t.id === 'btnSend') send(t);
  });

  $('sheet').addEventListener('input', function (ev) {
    if (!bk) return;
    var t = ev.target;
    if (t.id === 'fTel') {
      var v = t.value.replace(/[０-９]/g, function (s) { return String.fromCharCode(s.charCodeAt(0) - 65248); }).replace(/\D/g, '');
      if (v !== t.value) t.value = v;
      bk.tel = v;
    } else if (t.id === 'fName') bk.name = t.value;
    else if (t.id === 'fBiko') bk.biko = t.value;
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && bk) closeSheet(); });

  function send(btn) {
    var c = course();
    var payload = { girl_id: bk.girl.id, girl: bk.girl.name, date: bk.date, time: hm(bk.time), course_id: c.id, course: c.name,
      price: c.price, tel: bk.tel, name: bk.name.trim(), biko: bk.biko };
    var finish = function () {
      try { localStorage.setItem('danmitsu.customer', JSON.stringify({ tel: bk.tel, name: bk.name })); saved = { tel: bk.tel, name: bk.name }; } catch (e) {}
      bk.view = 'done'; renderSheet(true);
    };
    if (!window.RESERVE_ENDPOINT) {
      // サーバーのない場所（GitHub Pages など）：このブラウザの中にだけ控えて、管理画面のデモ表示で見られるようにする
      try {
        var key = 'danmitsu.demoRes', list = JSON.parse(localStorage.getItem(key) || '[]');
        list.push({ id: Date.now().toString(36), createdAt: new Date().toISOString(), status: 'new', girl_id: payload.girl_id, girl: payload.girl,
          age: bk.girl.age || 0, date: payload.date, time: payload.time, course_id: c.id, course: c.name, min: c.min, price: c.price,
          tel: payload.tel, name: payload.name, biko: payload.biko, blocked: [] });
        localStorage.setItem(key, JSON.stringify(list.slice(-30)));
      } catch (e) {}
      return finish();
    }
    btn.disabled = true; btn.textContent = '送信中…';
    fetch(window.RESERVE_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error || '');
          finish();
        });
      })
      .catch(function (e) {
        btn.disabled = false; btn.textContent = '予約を確定する';
        alert(e.message && e.message !== 'Failed to fetch' ? e.message : '予約に失敗しました。しばらく経ってから再度お試しください。');
      });
  }

  // server.js で開いているときだけ、予約を店舗（管理画面）へ送信する
  if (!window.RESERVE_ENDPOINT && location.protocol.indexOf('http') === 0) {
    fetch('api/ping').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.ok) window.RESERVE_ENDPOINT = 'api/reserve'; })
      .catch(function () {});
  }

  renderDays();
  renderList();
})();
