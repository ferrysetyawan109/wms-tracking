/* WMS Tracking - app publik + sales + manager. Tanpa framework, satu file.
 * Server: Apps Script doPost yang sama dengan WMS 2.0.
 *   tanpa login : {fn:'pub', args:[KEY, 'lacak'|'stok'|'info', {...}]}
 *   login PIN   : {fn:'loginPin', args:[email, pin]} lalu {fn:'rpc', args:[token, 'po.sales'|'ana.ringkas', {...}]}
 */
(function () {
  'use strict';
  var C = window.WMS_TRACK || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); };
  var fmt = function (n) { n = Number(n) || 0; return n.toLocaleString('id-ID', {maximumFractionDigits: 2}); };
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------- kode tracking: ?t=KODE di link, diingat di HP ---------- */
  var qs = new URLSearchParams(location.search), tq = String(qs.get('t') || '').trim();
  if (/^kode$/i.test(tq)) tq = '';   /* contoh di panduan, bukan kode asli */
  if (/^kode$/i.test(LS.get('wt_key') || '')) LS.del('wt_key');
  if (tq) LS.set('wt_key', tq);
  /* kode dipindah dari alamat ke penyimpanan HP: alamat jadi bersih dan tidak "nyangkut" ke kode lama */
  if (qs.has('t')) { try { qs.delete('t'); history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : '') + location.hash); } catch (e) {} }
  var KEY = tq || LS.get('wt_key') || C.KEY || '';

  /* ---------- server ---------- */
  var pendingReads = Object.create(null);
  function oneRead(key, factory) {
    if (pendingReads[key]) return pendingReads[key];
    var promise = factory(); pendingReads[key] = promise;
    var clear = function () { if (pendingReads[key] === promise) delete pendingReads[key]; };
    promise.then(clear, clear); return promise;
  }
  function call(fn, args) {
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(String(C.EXEC_URL || ''))) return Promise.reject(new Error('EXEC_URL belum diatur di config.js'));
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = setTimeout(function () { if (ctl) ctl.abort(); }, 45000);
    return fetch(C.EXEC_URL, {method: 'POST', redirect: 'follow', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify({fn: fn, args: args}), signal: ctl ? ctl.signal : undefined})
      .then(function (r) { return r.text(); })
      .then(function (t) { try { return JSON.parse(t); } catch (e) { throw new Error('Server tidak membalas dengan benar. Coba lagi sebentar.'); } },
            function (e) { throw new Error(e && e.name === 'AbortError' ? 'Server terlalu lama menjawab. Coba lagi.' : 'Tidak ada koneksi ke server. Cek internet lalu coba lagi.'); })
      .finally(function () { clearTimeout(tm); });
  }
  function pub(name, a) {
    if (!KEY) return Promise.reject(new Error('Link tracking belum lengkap. Buka app dari link yang dibagikan Admin gudang (berisi ?t=KODE).'));
    var req = function () { return call('pub', [KEY, name, a || {}]).then(function (r) { if (!r || !r.ok) throw new Error((r && r.error) || 'Gagal memuat'); return r.data; }); };
    return oneRead('pub:' + KEY + ':' + name + ':' + JSON.stringify(a || {}), req);
  }
  /* kode salah / kosong: tampilkan isian kode (tanpa harus buka link ulang) */
  function keyBox(msg) {
    return '<div class="card" style="max-width:520px;margin:0 auto"><div class="err" style="padding:4px 0">' + esc(msg) + '</div>' +
      '<form id="kf" class="srch"><input id="kv" autocomplete="off" placeholder="Kode tracking dari Admin gudang" aria-label="Kode tracking" style="background:#fff;color:#2b2218;border-color:#d6c8ad"><button class="btn">Simpan</button></form>' +
      '<div class="mut">Atau buka ulang link yang dibagikan (berisi ?t=KODE).</div></div>';
  }
  function bindKey(again) {
    var f = document.getElementById('kf'); if (!f) return;
    f.onsubmit = function (e) { e.preventDefault(); var v = document.getElementById('kv').value.trim(); if (!v) return; KEY = v; LS.set('wt_key', v); whsCache = null; LS.del('wt_whs'); again(); };
  }
  var sess = (function () { try { var s = JSON.parse(LS.get('wt_sess') || 'null'); return s && s.exp > Date.now() ? s : null; } catch (e) { return null; } })();
  function rpc(name, a) {
    if (!sess) return Promise.reject(new Error('Belum login'));
    var token = sess.token;
    var req = function () { return call('rpc', [token, name, a || {}]).then(function (r) {
      if (r && r.code === 'AUTH') { if (sess && sess.token === token) logoutLocal(); throw new Error('Sesi berakhir, silakan login lagi.'); }
      if (!r || !r.ok) throw new Error((r && r.error) || 'Gagal memuat');
      return r.data;
    }); };
    return /^(?:po\.sales|ana\.ringkas|own\.(?:harian|cabang|jam|ekspedisi|internal|demand)|notif\.list)$/.test(name)
      ? oneRead('rpc:' + token + ':' + name + ':' + JSON.stringify(a || {}), req) : req();
  }
  function logoutLocal() { if (sess) call('logout', [sess.token]).catch(function () {}); sess = null; LS.del('wt_sess'); CS.wipe(); paintWho(); paintNav(); }

  /* ---------- cache layar (tampil instan, lalu diperbarui dari server) ---------- */
  var CS = {
    get: function (k) { try { var o = JSON.parse(localStorage.getItem('wtc:' + k) || 'null'); return o && Date.now() - o.t < 864e5 ? o.d : null; } catch (e) { return null; } },
    set: function (k, d) {
      try { localStorage.setItem('wtc:' + k, JSON.stringify({t: Date.now(), d: d})); } catch (e) { CS.prune(10); try { localStorage.setItem('wtc:' + k, JSON.stringify({t: Date.now(), d: d})); } catch (e2) {} }
      if (Math.random() < 0.1) CS.prune(40);
    },
    prune: function (keep) {
      try { var ks = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('wtc:') === 0) { var t = 0; try { t = JSON.parse(localStorage.getItem(k)).t; } catch (e) {} ks.push([t, k]); } }
        ks.sort(function (a, b) { return b[0] - a[0]; }).slice(keep).forEach(function (x) { localStorage.removeItem(x[1]); }); } catch (e) {}
    },
    wipe: function () { CS.prune(0); }
  };

  /* ---------- toast ---------- */
  var tt; function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('on'); }, 2600); }

  /* ---------- menu ---------- */
  var IC = {
    lacak: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    stok: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/>',
    po: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    analisa: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    notif: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.5 20a1.8 1.8 0 0 0 3 0"/>'
  };
  var MENU = [['lacak', 'Lacak', 'Lacak Pesanan'], ['stok', 'Stok', 'Status Stok'], ['po', 'PO Sales', 'Monitoring PO'], ['analisa', 'Manager', 'Laporan Manager'], ['notif', 'Notif', 'Notifikasi']];
  var curView = '';
  function paintNav(v) {
    curView = v || curView; v = curView;
    var n = nUnread(), bd = function (k) { return k === 'notif' && n ? '<b class="bdg" aria-label="' + n + ' belum dibaca">' + (n > 99 ? '99+' : n) + '</b>' : ''; };
    $('#tabs').innerHTML = MENU.map(function (m) { return '<a href="#' + m[0] + '" class="' + (m[0] === v ? 'on' : '') + '"' + (m[0] === v ? ' aria-current="page"' : '') + '><span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true">' + IC[m[0]] + '</svg>' + bd(m[0]) + '</span>' + m[1] + '</a>'; }).join('');
    $('.sidenav').innerHTML = MENU.map(function (m) { return '<a href="#' + m[0] + '" class="' + (m[0] === v ? 'on' : '') + '">' + m[2] + bd(m[0]) + '</a>'; }).join('');
    try { if (navigator.setAppBadge) { if (n) navigator.setAppBadge(n); else navigator.clearAppBadge(); } } catch (e) {}
  }
  function paintWho() {
    var w = $('#who'); if (!w) return;
    w.innerHTML = sess ? esc(sess.user.name) + ' · ' + esc(roleName(sess.user.role)) + '<br><button type="button" id="lo">Keluar</button>' : 'Belum login · menu PO & Laporan Manager butuh login';
    var b = $('#lo'); if (b) b.onclick = function () { logoutLocal(); route(); };
  }
  function roleName(r) { return {MANAGER: 'Branch Manager', KOORDINATOR: 'Koordinator', SALES: 'Sales', SALES_ADMIN: 'Sales Admin', ADMIN_WH: 'Admin WH'}[r] || r; }

  var main = $('#main');
  function view(html) { main.innerHTML = html; }
  function skel(n) { var s = ''; for (var i = 0; i < (n || 2); i++) s += '<div class="sk"></div>'; return s; }

  /* ================= LACAK ================= */
  var STEP_LBL = ['Order diterima', 'Divalidasi', 'Disiapkan', 'Siap kirim', 'Dikirim', 'Diterima'];
  function lacakView() {
    var requestSerial = 0;
    var q = sessionStorage.getItem('wt_q') || qs.get('q') || '';
    view('<header class="hd"><h1>Lacak Pesanan</h1><form class="srch" id="f" role="search"><label for="q" class="sr" style="position:absolute;left:-9999px">Nomor atau nama</label>' +
      '<input id="q" enterkeyhint="search" autocomplete="off" placeholder="No PO, SO, DO, resi, atau nama customer" value="' + esc(q) + '"><button class="btn">Lacak</button></form>' +
      '<div class="sub">Bisa pakai No PO customer, No SO / DO, No PO beli, atau sebagian nama customer.</div></header><section class="body" id="r"></section>');
    $('#f').onsubmit = function (e) { e.preventDefault(); cari(); };
    if (q.length >= 3) cari(true); else $('#r').innerHTML = '<div class="empty">Ketik minimal 3 huruf / angka lalu tekan Lacak.</div>';
    function cari(auto) {
      var v = $('#q').value.trim(), requestId = ++requestSerial; sessionStorage.setItem('wt_q', v);
      if (v.length < 3) { $('#r').innerHTML = '<div class="empty">Ketik minimal 3 huruf / angka.</div>'; return; }
      var cached = CS.get('lacak:' + v.toLowerCase()); if (cached) drawLacak(cached); else $('#r').innerHTML = skel(2);
      if (!auto) $('#q').blur();
      pub('lacak', {q: v}).then(function (d) {
        if (requestId !== requestSerial || curView !== 'lacak') return;
        if (d.live_whs && d.live_whs.length) {
          d.updating = true; drawLacak(d);
          return pub('lacak2', {q: v, whs: d.live_whs}).then(function (l) { if (requestId !== requestSerial || curView !== 'lacak') return; if (l && l.rows && l.rows.length) { CS.set('lacak:' + v.toLowerCase(), l); drawLacak(l); } else { d.updating = false; drawLacak(d); } })
            .catch(function () { d.updating = false; drawLacak(d); });
        }
        CS.set('lacak:' + v.toLowerCase(), d); drawLacak(d);
      })
        .catch(function (e) { if (isKeyErr(e)) { $('#r').innerHTML = keyBox(e.message); bindKey(function () { cari(); }); return; } if (!cached) $('#r').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; else toast(e.message); });
    }
  }
  function isKeyErr(e) { return /Link tidak berlaku|Link tracking belum lengkap/i.test(String(e && e.message || '')); }
  function drawLacak(d) {
    var r = $('#r'); if (!r) return;
    if (d.error) { r.innerHTML = '<div class="err">' + esc(d.error) + '</div>'; return; }
    var rows = d.rows || [];
    var head = '<div class="meta"><span>' + (d.total ? fmt(d.total) + ' hasil untuk “' + esc(d.q) + '”' + (d.total > rows.length ? ' · tampil ' + rows.length : '') : '') + '</span><span>' + (d.snap ? 'status per ' + esc(String(d.snap).slice(11, 16)) + (d.updating ? ' · <b class="upd">memperbarui…</b>' : '') : d.now ? 'diperbarui ' + esc(String(d.now).slice(11, 16)) : '') + '</span></div>';
    var warn = d.ambigu && d.pesan ? '<div class="note">' + esc(d.pesan) + '</div>' : '';
    r.innerHTML = rows.length ? head + warn + rows.map(cardLacak).join('') : warn + '<div class="empty">Tidak ada hasil untuk “' + esc(d.q) + '”.<br>Coba nomor PO, SO, DO, atau sebagian nama customer.</div>';
  }
  function cardLacak(x) {
    var steps = x.steps && x.steps.length ? x.steps : STEP_LBL.map(function (l, i) { var st = Number(x.stage) || 0; return {label: l, done: i < st || (st === 5 && i === 5), now: i === st && st < 5, at: ''}; });
    var done = steps.filter(function (s) { return s.done; }).length, sel = steps.length && steps[steps.length - 1].done;
    var pill = x.hold ? '<span class="pill p-er">Tertahan</span>' : sel ? '<span class="pill p-ok">Diterima</span>' : '<span class="pill p-wa">' + esc(x.label || 'Diproses') + '</span>';
    var title = x.so_no ? 'SO ' + x.so_no : x.doc_no ? (x.kind || 'DO') + ' ' + x.doc_no : x.po ? 'PO ' + x.po : 'Pesanan';
    var sub = [x.doc_no && x.so_no ? 'DO ' + x.doc_no : '', x.po ? 'PO ' + x.po : '', x.wh || ''].filter(Boolean).join(' · ');
    var bar = '<div class="bar" style="grid-template-columns:repeat(' + steps.length + ',1fr)">' + steps.map(function (s) { return '<i class="' + (s.done ? 'd' : s.now ? 'n' : '') + '"></i>'; }).join('') + '</div>';
    var tl = '<ol class="tl">' + steps.map(function (s, i) {
      return '<li class="' + (s.done ? 'd' : s.now ? 'n' : '') + '"><div class="dot"><b></b>' + (i < steps.length - 1 ? '<i></i>' : '') + '</div><div class="tx"><span>' + esc(s.label) + '</span>' +
        (s.at ? '<span class="mut">' + esc(tgl(s.at)) + '</span>' : '') + (s.info ? '<span class="mut">' + esc(s.info) + '</span>' : '') + '</div></li>';
    }).join('') + '</ol>';
    var k = x.kirim, ship = k ? '<div class="ship"><b>' + esc(k.mode === 'INTERNAL' ? 'Kurir gudang' : (k.carrier || 'Ekspedisi')) + (k.resi ? ' · resi ' + esc(k.resi) : '') + '</b>' + (k.hari != null ? '<span class="mut">Lama perjalanan ' + esc(k.hari) + ' hari</span>' : '') + '</div>' : '';
    var rcv = x.received_by ? '<div class="mut">Diterima oleh ' + esc(x.received_by) + '</div>' : '';
    var ids = []; steps.forEach(function (s) { (s.foto || []).forEach(function (f) { if (ids.indexOf(f) < 0) ids.push(f); }); }); if (x.photo && ids.indexOf(x.photo) < 0) ids.push(x.photo);
    var ph = ids.length ? '<div class="ph">' + ids.slice(0, 10).map(function (id) { return '<a href="https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view" target="_blank" rel="noopener"><img loading="lazy" alt="Foto barang" src="https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w300"></a>'; }).join('') + '</div>' : '';
    return '<article class="card"><div class="row"><div><div class="t1">' + esc(title) + '</div><div>' + esc(x.customer || '') + '</div>' + (sub || x.sales ? '<div class="mut">' + esc([sub, x.sales ? 'Sales: ' + x.sales : ''].filter(Boolean).join(' · ')) + '</div>' : '') + '</div>' + pill + '</div>' +
      bar + tl + ship + rcv + ph + (x.arsip ? '<div class="mut">Dokumen lama (arsip)</div>' : '') + '</article>';
  }
  function tgl(s) { s = String(s || ''); var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s); if (!m) return s; var b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][Number(m[2]) - 1]; return Number(m[3]) + ' ' + b + ' ' + m[1] + (m[4] && m[4] + m[5] !== '0000' ? ' · ' + m[4] + ':' + m[5] : ''); }

  /* ================= STOK ================= */
  var whsCache = null;
  function getWhs() { if (whsCache) return Promise.resolve(whsCache); var c = LS.get('wt_whs'); if (c) { try { whsCache = JSON.parse(c); } catch (e) {} }
    var p = pub('info').then(function (d) { whsCache = d.whs || []; LS.set('wt_whs', JSON.stringify(whsCache)); return whsCache; }); return whsCache ? Promise.resolve(whsCache) : p; }
  var LV = {R: ['Ready', 'p-ok'], T: ['Terbatas', 'p-wa'], K: ['Kosong', 'p-er'], P: ['Dipesan', 'p-in']};
  /* Jangan samakan available/tersedia dengan Stock Today: sumber berbeda. */
  function stokTampil(w) {
    var v = w && w.stok_tampil;
    if (v == null || v === '') v = w && w.stock_today;
    return v !== undefined && v !== null && v !== '' && isFinite(Number(v)) ? Number(v) : null;
  }
  function levelStok(n, dipesan) { return n >= 10 ? 'R' : n > 0 ? 'T' : Number(dipesan) > 0 ? 'P' : 'K'; }
  function stokView() {
    var requestSerial = 0;
    var q = sessionStorage.getItem('wt_sq') || '', wh = sessionStorage.getItem('wt_swh') || 'ALL';
    view('<header class="hd"><h1>Status Stok</h1><form class="srch" id="f" role="search"><input id="q" enterkeyhint="search" autocomplete="off" placeholder="Kode atau nama barang" value="' + esc(q) + '" aria-label="Kode atau nama barang"><button class="btn">Cari</button></form><div class="chips" id="wc"></div></header><section class="body" id="r"></section>');
    var drawChips = function (list) { $('#wc').innerHTML = [{code: 'ALL', name: 'Semua gudang'}].concat(list || []).map(function (w) { return '<button type="button" class="chip' + (w.code === wh ? ' on' : '') + '" data-w="' + esc(w.code) + '">' + esc(w.code === 'ALL' ? w.name : w.code) + '</button>'; }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('#wc .chip'), function (b) { b.onclick = function () { wh = b.getAttribute('data-w'); sessionStorage.setItem('wt_swh', wh); drawChips(list); if ($('#q').value.trim().length >= 2) cari(); }; }); };
    drawChips(whsCache || []); getWhs().then(drawChips).catch(function () {});
    $('#f').onsubmit = function (e) { e.preventDefault(); $('#q').blur(); cari(); };
    if (q.length >= 2) cari(); else $('#r').innerHTML = '<div class="empty">Ketik kode atau nama barang, contoh: <b>respirator</b> atau <b>ALS-801N95</b>.</div>';
    function cari() {
      var v = $('#q').value.trim(), requestId = ++requestSerial; sessionStorage.setItem('wt_sq', v);
      if (v.length < 2) { $('#r').innerHTML = '<div class="empty">Ketik minimal 2 huruf.</div>'; return; }
      var ck = 'stok:' + wh + ':' + v.toLowerCase(), c = CS.get(ck); if (c) drawStok(c); else $('#r').innerHTML = skel(3);
      pub('stok', {q: v, wh: wh, sumber: 'STOCK_TODAY'}).then(function (d) { CS.set(ck, d); if (requestId === requestSerial && curView === 'stok') drawStok(d); }).catch(function (e) { if (isKeyErr(e)) { $('#r').innerHTML = keyBox(e.message); bindKey(cari); return; } $('#r').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
    }
  }
  function drawStok(d) {
    var r = $('#r'); if (!r) return; var rows = d.rows || [];
    var at = Object.keys(d.at || {}).map(function (k) { return d.at[k]; }).filter(Boolean).sort().pop() || '';
    var belumStockToday = false;
    rows.forEach(function (x) { (x.whs || []).forEach(function (w) { if (stokTampil(w) === null) belumStockToday = true; }); });
    r.innerHTML = rows.length ? '<div class="meta"><span>' + fmt(d.total) + ' barang' + (d.total > rows.length ? ' · tampil ' + rows.length : '') + '</span><span>Stok per ' + esc(tgl(at)) + '</span></div>' + rows.map(function (x) {
      var totalTampil = (x.whs || []).reduce(function (n, w) { var s = stokTampil(w); return n + (s === null ? Number(w.tersedia) || 0 : s); }, 0);
      var lv = LV[levelStok(totalTampil, x.ordered)] || LV.K;
      return '<article class="card"><div class="row"><div><div class="t2">' + esc(x.item) + '</div><div class="mut">' + esc(x.name) + '</div></div><div style="text-align:right"><span class="pill ' + lv[1] + '">' + lv[0] + '</span><div class="t2" style="margin-top:4px">' + fmt(totalTampil) + ' <small class="mut">' + esc(x.uom || '') + '</small></div></div></div>' +
        '<div class="whg">' + x.whs.map(function (w) { var s = stokTampil(w), n = s === null ? Number(w.tersedia) || 0 : s, l = LV[levelStok(n, w.dipesan)] || LV.K; return '<div class="' + l[1] + '"><span>' + esc(w.code) + '</span><b>' + fmt(n) + '</b><small>' + (s === null ? 'tersedia (belum Stock Today)' : 'Stock Today') + '</small></div>'; }).join('') + '</div>' +
        (x.ordered > 0 && totalTampil <= 0 ? '<div class="mut">Sedang dipesan ' + fmt(x.ordered) + ' ' + esc(x.uom || '') + '</div>' : '') + '</article>';
    }).join('') + '<p class="mut">' + (belumStockToday ? 'Sebagian angka masih tersedia (bukan Stock Today), karena backend TrackApi.gs belum mengirim stok_tampil. ' : 'Stock Tampil mengikuti Stock Today WMS. ') + 'Ready ≥ 10 · Terbatas 1–9 · Dipesan = sedang PO ke supplier.</p>'
      : '<div class="empty">Barang “' + esc(d.q) + '” tidak ditemukan.</div>';
  }

  /* ================= LOGIN ================= */
  function loginView(judul, ket) {
    view('<header class="hd"><h1>' + esc(judul) + '</h1><div class="sub">' + esc(ket) + '</div></header><section class="body"><form class="card login" id="lf">' +
      '<div class="fld"><label for="em">Email</label><input id="em" type="email" autocomplete="username" inputmode="email" value="' + esc(LS.get('wt_em') || '') + '" required></div>' +
      '<div class="fld"><label for="pn">PIN</label><input id="pn" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]*" required></div>' +
      '<button class="btn" id="lb">Masuk</button><div class="mut">Pakai email dan PIN yang sama dengan aplikasi WMS.</div></form></section>');
    $('#lf').onsubmit = function (e) {
      e.preventDefault(); var b = $('#lb'), em = $('#em').value.trim(); b.disabled = true; b.textContent = 'Memeriksa…';
      call('loginPin', [em, $('#pn').value]).then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.error) || 'Login gagal');
        sess = {token: r.data.token, user: r.data.user, exp: Date.now() + (Number(r.data.ttl) || 21600) * 1000 - 60000};
        LS.set('wt_sess', JSON.stringify(sess)); LS.set('wt_em', em); paintWho(); route(); notifFetch(true);
      }).catch(function (er) { toast(er.message); b.disabled = false; b.textContent = 'Masuk'; });
    };
  }

  /* ================= PO SALES ================= */
  var po = {mode: 'buka', wh: 'ALL', sales: '', q: ''}, poRequestId = 0;
  function poView() {
    if (!sess) return loginView('Monitoring PO', 'Login dengan akun WMS (akun sales gudang / manager).');
    var u = sess.user, mgr = u.role === 'MANAGER' || u.role === 'KOORDINATOR';
    view('<header class="hd"><h1>Monitoring PO</h1><div class="sub">' + esc(u.name) + ' · ' + esc(roleName(u.role)) + '</div>' +
      '<form class="srch" id="f" role="search"><input id="q" enterkeyhint="search" placeholder="Cari PO, SO, customer, barang" aria-label="Cari PO" value="' + esc(po.q) + '"><button class="btn">Cari</button></form>' +
      '<div class="chips" id="wc"></div><div class="srch"><label for="ss" style="position:absolute;left:-9999px">Nama sales</label><select id="ss" class="chip" style="height:44px;min-width:0;flex:1;border-radius:12px"><option value="">Semua sales</option></select></div></header>' +
      '<section class="body"><div class="tiles" id="tl">' + skel(1) + '</div><div class="chips" id="mc"></div><div id="r"></div></section>');
    var modes = [['buka', 'Open'], ['urgent', 'Urgent'], ['kurang', 'Kurang'], ['selesai', 'Selesai']];
    var drawModes = function () { $('#mc').innerHTML = modes.map(function (m) { return '<button type="button" class="chip' + (m[0] === po.mode ? ' on' : '') + '" data-m="' + m[0] + '">' + m[1] + '</button>'; }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('#mc .chip'), function (b) { b.onclick = function () { po.mode = b.getAttribute('data-m'); drawModes(); load(); }; }); };
    drawModes(); $('#f').onsubmit = function (e) { e.preventDefault(); $('#q').blur(); load(); };
    $('#ss').onchange = function () { po.sales = this.value; load(); };
    load();
    function load() {
      po.q = $('#q').value.trim(); var args = {mode: po.mode, q: po.q, wh: po.wh, sales: po.sales}, key = 'po:' + JSON.stringify(args), c = CS.get(key);
      var requestId = ++poRequestId;
      if (c) draw(c); else $('#r').innerHTML = skel(3);
      rpc('po.sales', args).then(function (d) { CS.set(key, d); if (requestId === poRequestId && curView === 'po') draw(d); })
        .catch(function (e) { if (!sess) return route(); if (!c) $('#r').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; else toast(e.message); });
    }
    function draw(d) {
      var whs = d.whs || [];
      $('#wc').innerHTML = whs.length > 1 ? ['ALL'].concat(whs).map(function (w) { return '<button type="button" class="chip' + (w === po.wh ? ' on' : '') + '" data-w="' + esc(w) + '">' + (w === 'ALL' ? 'Semua gudang' : esc(w)) + '</button>'; }).join('') : (whs[0] ? '<span class="chip on">' + esc(whs[0]) + '</span>' : '');
      Array.prototype.forEach.call(document.querySelectorAll('#wc .chip[data-w]'), function (b) { b.onclick = function () { po.wh = b.getAttribute('data-w'); po.sales = ''; load(); }; });
      var sl = d.sales_list || [], cur = po.sales;
      $('#ss').parentNode.hidden = !!d.saya; if (d.saya) { po.sales = ''; $('.hd .sub').textContent = u.name + ' · PO milik ' + d.saya[0]; }
      $('#ss').innerHTML = '<option value="">Semua sales</option>' + sl.map(function (n) { return '<option' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
      var K = d.ringkas || {};
      $('#tl').innerHTML = [['buka', 'PO OPEN', K.buka, ''], ['urgent', 'URGENT > 14 HARI', K.urgent, 'r'], ['kurang', 'BARANG KURANG', K.kurang, 'y'], ['selesai', 'SELESAI 14 HARI', K.selesai, 'b']].map(function (t) {
        return '<button type="button" class="tile ' + t[3] + '" data-m="' + t[0] + '"><span>' + t[1] + '</span><b>' + fmt(t[2]) + '</b></button>'; }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('#tl .tile'), function (b) { b.onclick = function () { po.mode = b.getAttribute('data-m'); drawModes(); load(); }; });
      var rows = d.rows || [];
      $('#r').innerHTML = rows.length ? '<div class="meta"><span>' + fmt(d.total) + ' PO' + (po.sales ? ' · ' + esc(po.sales) : '') + '</span><span>' + esc(String(d.now || '').slice(11, 16)) + '</span></div>' + rows.map(function (p) {
        var bar = '<div class="bar" style="grid-template-columns:repeat(8,1fr)">' + [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return '<i class="' + (i < p.stage ? 'd' : i === p.stage ? 'n' : '') + '"></i>'; }).join('') + '</div>';
        return '<article class="card"><div class="row"><div><div class="t2">PO ' + esc(p.po_no) + '</div><div>' + esc(p.customer || '') + '</div><div class="mut">' + esc(['SO ' + (p.so_no || '-'), p.wh, p.sales || ''].filter(Boolean).join(' · ')) + '</div></div>' +
          '<span class="pill ' + (p.urgent ? 'p-er' : 'p-mu') + '">' + fmt(p.umur) + ' hr' + (p.urgent ? ' · urgent' : '') + '</span></div>' + bar +
          '<div class="meta"><span>' + esc(p.kata || '') + (p.eta ? ' · est. ' + esc(tgl(p.eta)) : '') + '</span><span>' + fmt(p.rcv) + ' / ' + fmt(p.qty) + ' diterima</span></div>' +
          (p.items && p.items.length ? '<details><summary class="mut">' + p.n_item + ' barang</summary>' + p.items.map(function (i) { return '<div class="meta"><span>' + esc(i.item) + ' · ' + esc(i.name || '') + '</span><span>' + fmt(i.rcv) + '/' + fmt(i.qty) + '</span></div>'; }).join('') + '</details>' : '') + '</article>';
      }).join('') : '<div class="empty">Tidak ada PO di daftar ini.</div>';
    }
  }

  /* ================= ANALISA ================= */
  var ana = {wh: 'ALL', days: 90, list: 'dead', sec: 'harian'};
  function anaView() {
    if (!sess) return loginView('Laporan Manager', 'Khusus Branch Manager / Director. Login dengan akun WMS.');
    var u = sess.user; if (u.role !== 'MANAGER' && u.role !== 'KOORDINATOR') { view('<header class="hd"><h1>Laporan Manager</h1></header><section class="body"><div class="empty">Menu ini khusus Branch Manager / Director.</div></section>'); return; }
    view('<header class="hd"><h1>Laporan Manager</h1><div class="sub">Analisa barang · pergerakan barang keluar per gudang dari Ledger + Stock Today, dihitung otomatis tiap jam.</div><div class="chips" id="wc"></div><div class="chips" id="pc"></div></header>' +
      '<section class="body" id="r">' + skel(3) + '</section>');
    load();
    function chips(d) {
      var whs = ['ALL'].concat(d.whs || []);
      $('#wc').innerHTML = whs.map(function (w) { return '<button type="button" class="chip' + (w === ana.wh ? ' on' : '') + '" data-w="' + esc(w) + '">' + (w === 'ALL' ? 'Semua gudang' : esc(w)) + '</button>'; }).join('');
      $('#pc').innerHTML = [30, 90, 180].map(function (n) { return '<button type="button" class="chip' + (n === ana.days ? ' on' : '') + '" data-d="' + n + '">' + n + ' hari</button>'; }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('#wc .chip'), function (b) { b.onclick = function () { ana.wh = b.getAttribute('data-w'); load(); }; });
      Array.prototype.forEach.call(document.querySelectorAll('#pc .chip'), function (b) { b.onclick = function () { ana.days = Number(b.getAttribute('data-d')); load(); }; });
    }
    function load() {
      var key = 'ana:' + ana.wh + ':' + ana.days, c = CS.get(key);
      if (c) draw(c); else { $('#r').innerHTML = skel(3); }
      rpc('ana.ringkas', {wh: ana.wh, days: ana.days}).then(function (d) { CS.set(key, d); draw(d); })
        .catch(function (e) { if (!sess) return route(); if (!c) $('#r').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; else toast(e.message); });
    }
    function draw(d) {
      chips(d); var all = d.wh === 'ALL';
      var maxI = (d.top_item[0] || [0, 1])[1] || 1, maxC = (d.top_cust[0] || [0, 1])[1] || 1;
      var warn = d.hist_days < d.days ? '<div class="note">Riwayat barang keluar di sistem baru ' + fmt(d.hist_days) + ' hari, lebih pendek dari periode ' + d.days + ' hari. Dead stock bisa terlihat lebih banyak dari kenyataan sampai riwayatnya cukup.</div>' : '';
      var L = {dead: ['Dead stock', d.dead_list], slow: ['Slow moving', d.slow_list], fast: ['Fast moving', d.fast_list]}, cur = L[ana.list];
      var th = ana.list === 'dead' ? '<th>KODE</th><th>NAMA</th>' + (all ? '<th>GUDANG</th>' : '') + '<th class="ra">STOK</th><th>KELUAR TERAKHIR</th><th class="ra">TANPA GERAK</th>'
        : '<th>KODE</th><th>NAMA</th>' + (all ? '<th>GUDANG</th>' : '') + '<th class="ra">DOK KELUAR</th><th class="ra">QTY KELUAR</th><th class="ra">STOK</th>';
      var tr = (cur[1] || []).slice(0, 100).map(function (x) {
        return ana.list === 'dead' ? '<tr><td><b>' + esc(x[0]) + '</b></td><td>' + esc(x[4] || '') + '</td>' + (all ? '<td>' + esc(x[5] || '') + '</td>' : '') + '<td class="ra"><b>' + fmt(x[1]) + '</b></td><td class="mut">' + (x[2] ? esc(tgl(x[2])) : 'belum pernah') + '</td><td class="ra"><span class="pill p-er">' + fmt(x[3]) + ' hari</span></td></tr>'
          : '<tr><td><b>' + esc(x[0]) + '</b></td><td>' + esc(x[4] || '') + '</td>' + (all ? '<td>' + esc(x[5] || '') + '</td>' : '') + '<td class="ra">' + fmt(x[1]) + '</td><td class="ra"><b>' + fmt(x[2]) + '</b></td><td class="ra">' + fmt(x[3]) + '</td></tr>';
      }).join('');
      $('#r').innerHTML = warn + '<div class="tiles">' +
        '<div class="tile"><span>FAST MOVING</span><b>' + fmt(d.fast) + '</b><small>keluar ≥ 8× dalam ' + d.days + ' hari</small></div>' +
        '<div class="tile y"><span>SLOW MOVING</span><b>' + fmt(d.slow) + '</b><small>keluar 1–7×</small></div>' +
        '<div class="tile r"><span>DEAD STOCK</span><b>' + fmt(d.dead) + '</b><small>ada stok, 0× keluar</small></div>' +
        '<div class="tile b"><span>QTY DI DEAD STOCK</span><b>' + fmt(d.dead_qty) + '</b><small>dari ' + fmt(d.aktif) + ' kode aktif</small></div></div>' +
        '<div class="grid2"><section class="card"><div class="row"><h2 class="t1" style="margin:0">Top 10 barang keluar</h2><span class="mut">qty</span></div>' +
        (d.top_item.length ? d.top_item.map(function (x, i) { return '<div class="rank"><span class="n">' + (i + 1) + '</span><div style="min-width:0"><div class="nm">' + esc(x[0]) + (x[3] ? ' · <span class="mut">' + esc(x[3]) + '</span>' : '') + '</div><div class="tr"><i style="width:' + Math.max(3, Math.round(x[1] / maxI * 100)) + '%"></i></div></div><span class="v">' + fmt(x[1]) + '</span></div>'; }).join('') : '<div class="empty">Belum ada barang keluar di periode ini.</div>') +
        '</section><section class="card"><div class="row"><h2 class="t1" style="margin:0">Top 10 customer</h2><span class="mut">jumlah DO</span></div>' +
        (d.top_cust.length ? d.top_cust.map(function (x, i) { return '<div class="rank c"><span class="n">' + (i + 1) + '</span><div style="min-width:0"><div class="nm">' + esc(x[0]) + '</div><div class="tr"><i style="width:' + Math.max(3, Math.round(x[1] / maxC * 100)) + '%"></i></div></div><span class="v">' + fmt(x[1]) + ' DO</span></div>'; }).join('') : '<div class="empty">Belum ada DO di periode ini.</div>') +
        '</section></div>' +
        '<section class="card"><div class="row" style="flex-wrap:wrap"><h2 class="t1" style="margin:0">Daftar ' + esc(cur[0].toLowerCase()) + '</h2><div class="chips" id="lc">' +
        ['dead', 'slow', 'fast'].map(function (k) { return '<button type="button" class="chip' + (k === ana.list ? ' on' : '') + '" data-l="' + k + '">' + L[k][0] + '</button>'; }).join('') +
        '<button type="button" class="chip" id="csv">Unduh CSV</button></div></div><div class="tbl"><table><thead><tr>' + th + '</tr></thead><tbody>' + (tr || '<tr><td colspan="7" class="mut">Kosong</td></tr>') + '</tbody></table></div></section>' +
        '<p class="mut">Data dihitung ' + esc(tgl(d.at)) + '. Fast ≥ 8 dokumen keluar, slow 1–7, dead = ada stok tapi tidak keluar sama sekali dalam periode.</p>';
      Array.prototype.forEach.call(document.querySelectorAll('#lc .chip[data-l]'), function (b) { b.onclick = function () { ana.list = b.getAttribute('data-l'); draw(d); }; });
      $('#csv').onclick = function () {
        var head = ana.list === 'dead' ? ['kode', 'nama', 'gudang', 'stok', 'keluar_terakhir', 'hari_tanpa_gerak'] : ['kode', 'nama', 'gudang', 'dokumen_keluar', 'qty_keluar', 'stok'];
        var lines = [head.join(',')].concat((cur[1] || []).map(function (x) { var v = ana.list === 'dead' ? [x[0], x[4], x[5] || d.wh, x[1], x[2], x[3]] : [x[0], x[4], x[5] || d.wh, x[1], x[2], x[3]]; return v.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }));
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], {type: 'text/csv'})); a.download = 'analisa_' + ana.list + '_' + d.wh + '_' + d.days + 'hari.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      };
    }
  }


  /* ================= NOTIFIKASI (tahap 1: lonceng di dalam app) ================= */
  /* Status baca disimpan per HP + per akun: akun sales yang dipakai bersama tidak saling menghapus. */
  var NT = {PO: ['PO datang', 'p-ok'], KIRIM: ['Dikirim', 'p-in'], TERIMA: ['Diterima', 'p-ok'], SIAP: ['Siap kirim', 'p-wa']};
  var nf = {t: 'ALL', wh: 'ALL'}, nBusy = false, nLast = 0, nErr = '';
  function nUid() { return sess ? String(sess.user.user_id || sess.user.email || sess.user.name || '') : ''; }
  function nGet(k, d) { if (!sess) return d; try { return JSON.parse(LS.get(k + nUid()) || 'null') || d; } catch (e) { return d; } }
  function nSet(k, v) { if (sess) LS.set(k + nUid(), JSON.stringify(v)); }
  function nUnread() { var d = nGet('wt_ntf:', null), rd = nGet('wt_ntf_read:', {}); if (!d || !d.items) return 0; return d.items.filter(function (x) { return !rd[x.id]; }).length; }
  function nTime(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || '')); if (!m) return tgl(s);
    var t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime(), d = (Date.now() - t) / 60000;
    if (d < 1) return 'baru saja'; if (d < 60) return Math.round(d) + ' mnt lalu'; if (d < 1440) return Math.round(d / 60) + ' jam lalu'; return tgl(s);
  }
  function notifFetch(force) {
    if (!sess || nBusy || (!force && Date.now() - nLast < 120000)) return Promise.resolve(null);
    nBusy = true;
    return rpc('notif.list', {sales: LS.get('wt_ntf_sales') || ''}).then(function (d) {
      nLast = Date.now();
      var rd = nGet('wt_ntf_read:', null), first = !rd, keep = {}, day = Date.now() - 86400000;
      rd = rd || {};
      (d.items || []).forEach(function (x) {
        if (first) { var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(x.at || ''); if (m && new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() < day) rd[x.id] = 1; }
      });
      var ids = Object.keys(rd); if (ids.length > 800) { var now = {}; (d.items || []).forEach(function (x) { now[x.id] = 1; }); ids.forEach(function (k) { if (now[k]) keep[k] = 1; }); rd = keep; }
      nSet('wt_ntf_read:', rd); nSet('wt_ntf:', d); paintNav();
      if (curView === 'notif' && V.notif.redraw) V.notif.redraw(d);
      return d;
    }).catch(function (e) { nErr = e && e.message || ''; return null; }).then(function (d) { nBusy = false; return d; });
  }
  function notifView() {
    if (!sess) return loginView('Notifikasi', 'Login dengan akun WMS (akun sales gudang / manager) untuk melihat notifikasi.');
    var u = sess.user;
    view('<header class="hd"><h1>Notifikasi</h1><div class="sub" id="ns">' + esc(u.name) + ' · ' + esc(roleName(u.role)) + '</div>' +
      '<div class="srch" id="nsw" hidden><label for="nss" style="position:absolute;left:-9999px">Nama sales</label><select id="nss" class="chip" style="height:44px;min-width:0;flex:1;border-radius:12px"></select></div>' +
      '<div class="chips" id="nwc"></div><div class="chips" id="ntc"></div></header>' +
      '<section class="body"><div class="row"><span class="mut" id="nm"></span><button type="button" class="chip" id="nrd">Tandai semua dibaca</button></div><div id="r">' + skel(3) + '</div></section>');
    var opened = nGet('wt_ntf_read:', {}), d0 = nGet('wt_ntf:', null);
    $('#nrd').onclick = function () { var d = nGet('wt_ntf:', null); if (!d) return; var rd = {}; d.items.forEach(function (x) { rd[x.id] = 1; }); nSet('wt_ntf_read:', rd); opened = rd; paintNav(); draw(d); };
    $('#nss').onchange = function () { LS.set('wt_ntf_sales', this.value); $('#r').innerHTML = skel(3); notifFetch(true); };
    function draw(d) {
      if (!d) return;
      var whs = d.whs || [], sl = d.sales_list || [], cur = LS.get('wt_ntf_sales') || '';
      $('#nsw').hidden = !sl.length || !!d.saya; if (d.saya) $('#ns').textContent = u.name + ' · notifikasi milik ' + d.saya[0];
      $('#nss').innerHTML = '<option value="">Semua sales</option>' + sl.map(function (n) { return '<option' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
      $('#nwc').innerHTML = whs.length > 1 ? ['ALL'].concat(whs).map(function (w) { return '<button type="button" class="chip' + (w === nf.wh ? ' on' : '') + '" data-w="' + esc(w) + '">' + (w === 'ALL' ? 'Semua gudang' : esc(w)) + '</button>'; }).join('') : '';
      var cnt = {ALL: d.items.length}; d.items.forEach(function (x) { if (nf.wh === 'ALL' || x.wh === nf.wh) cnt[x.t] = (cnt[x.t] || 0) + 1; });
      $('#ntc').innerHTML = [['ALL', 'Semua']].concat(Object.keys(NT).map(function (k) { return [k, NT[k][0]]; })).map(function (t) { return '<button type="button" class="chip' + (t[0] === nf.t ? ' on' : '') + '" data-t="' + t[0] + '">' + t[1] + (t[0] !== 'ALL' && cnt[t[0]] ? ' · ' + cnt[t[0]] : '') + '</button>'; }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('#nwc .chip'), function (b) { b.onclick = function () { nf.wh = b.getAttribute('data-w'); draw(d); }; });
      Array.prototype.forEach.call(document.querySelectorAll('#ntc .chip'), function (b) { b.onclick = function () { nf.t = b.getAttribute('data-t'); draw(d); }; });
      var rows = d.items.filter(function (x) { return (nf.t === 'ALL' || x.t === nf.t) && (nf.wh === 'ALL' || x.wh === nf.wh); });
      $('#nm').textContent = rows.length + ' notifikasi · ' + (d.hari || 7) + ' hari terakhir · ' + String(d.now || '').slice(11, 16);
      $('#r').innerHTML = rows.length ? rows.map(function (x, i) {
        var t = NT[x.t] || ['Info', 'p-mu'], baru = !opened[x.id];
        return '<button type="button" class="card nt' + (baru ? ' new' : '') + '" data-i="' + i + '"><div class="row"><span class="pill ' + t[1] + '">' + t[0] + '</span><span class="mut">' + esc(x.wh) + ' · ' + esc(nTime(x.at)) + '</span></div>' +
          '<div class="nt-t">' + (baru ? '<i class="ndot" aria-label="baru"></i>' : '') + esc(x.title) + '</div><div class="mut">' + esc(x.text) + '</div>' + (x.sales ? '<div class="mut">Sales: ' + esc(x.sales) + '</div>' : '') + '</button>';
      }).join('') : '<div class="empty">Belum ada notifikasi' + (nf.t !== 'ALL' || nf.wh !== 'ALL' ? ' untuk saringan ini' : '') + '.</div>';
      Array.prototype.forEach.call(document.querySelectorAll('#r .nt'), function (b) { b.onclick = function () { var x = rows[Number(b.getAttribute('data-i'))]; buka(x); }; });
      /* yang sudah tampil dianggap terbaca (titik "baru" tetap terlihat sampai menu dibuka lagi) */
      var rd = nGet('wt_ntf_read:', {}); d.items.forEach(function (x) { rd[x.id] = 1; }); nSet('wt_ntf_read:', rd); paintNav();
    }
    function buka(x) {
      if (x.go === 'po') { po.q = x.ref; po.mode = x.full ? 'selesai' : 'buka'; po.wh = 'ALL'; location.hash = '#po'; return; }
      sessionStorage.setItem('wt_q', x.ref || x.so || ''); location.hash = '#lacak';
    }
    notifView.redraw = draw;
    if (d0) draw(d0);
    notifFetch(true).then(function (d) { if (!d && !d0) $('#r').innerHTML = '<div class="err">' + esc(nErr || 'Notifikasi belum bisa dimuat. Cek internet lalu buka lagi menu ini.') + '</div>'; });
  }

  /* ================= LAPORAN OWNER (AnaOwner.gs) =================
     Enam laporan tambahan untuk Branch Manager / Director. Ditaruh sebagai bagian dari
     menu Analisa, BUKAN menu baru: #tabs itu grid 4-5 kolom tetap di app.css, jadi menu
     ke-6 akan turun ke baris kedua dan merusak tab bawah.
     Server: AnaOwner.gs — own.harian / own.cabang / own.jam / own.ekspedisi /
     own.internal / own.demand, semuanya izin 'report' dan baca saja. */
  var ASEC = [['harian', 'Harian'], ['cabang', 'Cabang'], ['jam', 'Jam'],
               ['eks', 'Ekspedisi'], ['intl', 'Internal'], ['demand', 'Demand'], ['barang', 'Barang']];
  var OWN = {
    harian: {fn: 'own.harian', judul: 'Rekap Harian', ket: 'Satu hari penuh dihitung langsung dari tabel DOC, lalu disandingkan dengan angka Laporan Harian.', tgl: 1},
    cabang: {fn: 'own.cabang', judul: 'DO per Cabang', ket: 'Jumlah DO tiap cabang, satu baris per tanggal.', hari: [7, 14, 30, 60]},
    jam: {fn: 'own.jam', judul: 'Throughput per Jam', ket: 'Dari input DO sampai penugasan, lalu dikirim dan diterima.', tgl: 1},
    eks: {fn: 'own.ekspedisi', judul: 'Pemakaian Ekspedisi', ket: 'Berapa banyak kiriman lewat ekspedisi luar, dan ke ekspedisi mana.', hari: [7, 30, 90, 180, 365]},
    intl: {fn: 'own.internal', judul: 'Kiriman Internal', ket: 'Tugas driver sendiri: siapa, berapa lama, dan mana yang belum ditugaskan.', hari: [1, 7, 14, 30]},
    demand: {fn: 'own.demand', judul: 'Kebutuhan Barang', ket: 'Pemakaian per bulan, stok sekarang, dan tahan berapa bulan.', bulan: [3, 6, 12, 24]}
  };
  var own = {tgl: '', hari: 0, bulan: 6, wh: 'ALL', rinci: ''}, ownRedraw = null;

  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function hariIni() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function jjam(j) { return p2(j) + ':00'; }
  function mnt(m) { m = Math.round(Number(m) || 0); return m < 60 ? m + ' mnt' : Math.floor(m / 60) + ' j ' + p2(m % 60) + ' m'; }
  function oTiles(a) {
    return '<div class="tiles">' + a.filter(Boolean).map(function (t) {
      return '<div class="tile' + (t[3] ? ' ' + t[3] : '') + '"><span>' + esc(t[0]) + '</span><b>' + esc(t[1]) + '</b>' +
        (t[2] ? '<small>' + esc(t[2]) + '</small>' : '') + '</div>'; }).join('') + '</div>';
  }
  function oTab(head, rows, min) {
    return '<div class="tbl"><table' + (min ? ' style="min-width:' + min + 'px"' : '') + '><thead><tr>' +
      head.map(function (x) { return '<th' + (x[1] ? ' class="ra"' : '') + '>' + esc(x[0]) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + (rows.length ? rows.join('') :
        '<tr><td colspan="' + head.length + '" class="mut">Kosong</td></tr>') + '</tbody></table></div>';
  }
  function oCard(judul, isi, kanan) {
    return '<section class="card"><div class="row" style="flex-wrap:wrap"><h2 class="t1" style="margin:0">' + esc(judul) + '</h2>' +
      (kanan ? '<span class="mut">' + esc(kanan) + '</span>' : '') + '</div>' + isi + '</section>';
  }
  function oBar(pct) {
    return '<div class="tr" style="height:8px;border-radius:4px;background:#efe7d6;min-width:54px"><i style="display:block;height:8px;border-radius:4px;background:var(--ok);width:' +
      Math.max(2, Math.min(100, Math.round(pct))) + '%"></i></div>';
  }
  function oPil(t, k) { return '<span class="pill ' + k + '">' + esc(t) + '</span>'; }
  function oArah(v) { var n = Math.round(Number(v) || 0); return oPil((n > 0 ? '+' : '') + n + '%', n > 25 ? 'p-ok' : n < -25 ? 'p-er' : 'p-mu'); }
  function oTahan(v) { return v >= 99 ? '<span class="mut">lama</span>' : oPil(fmt(v) + ' bln', v < 1 ? 'p-er' : v < 2 ? 'p-wa' : 'p-ok'); }

  function anaNav(cur) {
    return '<div class="chips" id="asec" style="margin:8px 0 2px">' + ASEC.map(function (s) {
      return '<button type="button" class="chip' + (s[0] === cur ? ' on' : '') + '" data-s="' + s[0] + '">' + s[1] + '</button>';
    }).join('') + '</div>';
  }
  function anaBind() {
    Array.prototype.forEach.call(document.querySelectorAll('#asec .chip'), function (b) {
      b.onclick = function () { ana.sec = b.getAttribute('data-s'); own.rinci = ''; anaRoute(); window.scrollTo(0, 0); };
    });
  }
  /* pintu masuk menu Analisa: bagian "Barang" tetap layar lama (anaView) tanpa diubah */
  function anaRoute() {
    if (!sess) return loginView('Laporan Manager', 'Khusus Branch Manager / Director. Login dengan akun WMS.');
    var u = sess.user;
    if (u.role !== 'MANAGER' && u.role !== 'KOORDINATOR') {
      view('<header class="hd"><h1>Laporan Manager</h1></header><section class="body"><div class="empty">Menu ini khusus Branch Manager / Director.</div></section>');
      return;
    }
    if (!ana.sec || ana.sec === 'barang') {
      anaView();
      var h1 = $('#main .hd h1'); if (h1) h1.insertAdjacentHTML('afterend', anaNav('barang'));
      anaBind(); return;
    }
    ownSec();
  }

  function ownSec() {
    var k = ana.sec, cfg = OWN[k];
    if (!cfg) { ana.sec = 'barang'; return anaRoute(); }
    if (cfg.tgl && !own.tgl) own.tgl = hariIni();
    if (cfg.hari && cfg.hari.indexOf(own.hari) < 0) own.hari = cfg.hari[1] || cfg.hari[0];
    view('<header class="hd"><h1>Laporan Manager</h1><div class="sub">' + esc(cfg.judul) + '</div>' + anaNav(k) +
      '<div class="sub">' + esc(cfg.ket) + '</div><div class="chips" id="of"></div><div class="chips" id="ow"></div></header>' +
      '<section class="body" id="r">' + skel(3) + '</section>');
    anaBind();
    load();

    function args() {
      var a = {wh: own.wh};
      if (cfg.tgl) a.tgl = own.tgl;
      if (cfg.hari) a.hari = own.hari;
      if (cfg.bulan) a.bulan = own.bulan;
      return a;
    }
    function filters(d) {
      var f = '';
      if (cfg.tgl) f = '<label for="od" style="position:absolute;left:-9999px">Tanggal</label><input type="date" id="od" class="chip" style="height:36px" value="' + esc(own.tgl) + '" max="' + hariIni() + '">';
      if (cfg.hari) f = cfg.hari.map(function (n) { return '<button type="button" class="chip' + (n === own.hari ? ' on' : '') + '" data-h="' + n + '">' + n + ' hari</button>'; }).join('');
      if (cfg.bulan) f = cfg.bulan.map(function (n) { return '<button type="button" class="chip' + (n === own.bulan ? ' on' : '') + '" data-b="' + n + '">' + n + ' bulan</button>'; }).join('');
      $('#of').innerHTML = f;
      var whs = ['ALL'].concat(d.whs || []);
      $('#ow').innerHTML = (d.whs || []).length > 1 ? whs.map(function (w) {
        return '<button type="button" class="chip' + (w === own.wh ? ' on' : '') + '" data-w="' + esc(w) + '">' +
          (w === 'ALL' ? 'Semua gudang' : esc(w)) + '</button>'; }).join('') : '';
      var od = $('#od'); if (od) od.onchange = function () { own.tgl = od.value; own.rinci = ''; load(); };
      Array.prototype.forEach.call(document.querySelectorAll('#of .chip[data-h]'), function (b) { b.onclick = function () { own.hari = Number(b.getAttribute('data-h')); load(); }; });
      Array.prototype.forEach.call(document.querySelectorAll('#of .chip[data-b]'), function (b) { b.onclick = function () { own.bulan = Number(b.getAttribute('data-b')); own.rinci = ''; load(); }; });
      Array.prototype.forEach.call(document.querySelectorAll('#ow .chip'), function (b) { b.onclick = function () { own.wh = b.getAttribute('data-w'); own.rinci = ''; load(); }; });
    }
    function load() {
      var a = args(), key = 'own:' + k + ':' + JSON.stringify(a), c = CS.get(key);
      if (c) draw(c); else $('#r').innerHTML = skel(3);
      rpc(cfg.fn, a).then(function (d) { CS.set(key, d); draw(d); })
        .catch(function (e) { if (!sess) return route(); if (!c) $('#r').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; else toast(e.message); });
    }
    function draw(d) {
      filters(d);
      ownRedraw = function () { draw(d); };
      $('#r').innerHTML = k === 'harian' ? drawHarian(d) : k === 'cabang' ? drawCabang(d) :
        k === 'jam' ? drawJam(d) : k === 'eks' ? drawEks(d) : k === 'intl' ? drawIntl(d) : drawDemand(d);
      if (k === 'demand') bindDemand(d);
    }
  }

  /* --- 1. rekap harian + pemeriksaan apakah Laporan Harian menangkap semuanya --- */
  function drawHarian(d) {
    var s = d.semua;
    var out = oTiles([
      ['DO', fmt(s.do.n), fmt(s.do.qty) + ' qty'],
      ['DO SELESAI', fmt(s.do.selesai), fmt(s.do.dikirim) + ' dikirim · ' + fmt(s.do.baru) + ' baru'],
      ['IT KELUAR', fmt(s.it.n), fmt(s.it.qty) + ' qty', 'b'],
      ['GR', fmt(s.gr.n), fmt(s.gr.vendor_n) + ' vendor · ' + fmt(s.gr.antar_n) + ' antar gudang'],
      ['DOKUMEN LAIN', fmt(s.lain_n), 'ADJ / DAMAGE / RETURN', 'y'],
      ['VOID', fmt(s.void_n), 'tidak dihitung', 'y'],
      ['TOTAL DOKUMEN', fmt(s.total_dok), 'non-VOID', 'b']]);
    out += '<div class="row" style="margin:10px 0;align-items:center"><span class="mut">' + esc(tgl(d.tgl)) + '</span>' +
      (d.cocok ? oPil('Semua gudang cocok', 'p-ok') : oPil((d.beda || []).length + ' gudang ada selisih', 'p-er')) + '</div>';
    (d.per_gudang || []).forEach(function (g) {
      var b = g.banding, isi;
      var judul = (d.whs || []).length > 1 ? 'Pemeriksaan · ' + g.wh : 'Pemeriksaan';
      if (!b || !b.ada) {
        isi = '<div class="note">' + (b && b.gagal ? 'Laporan Harian gagal dipanggil: ' + esc(b.gagal) :
          'Report.gs tidak ada di gudang ini, jadi angka di atas tidak bisa disandingkan. Angkanya sendiri dihitung langsung dari tabel DOC.') + '</div>';
      } else {
        var br = [['DO', g.do.n, b.do_count, b.selisih_do],
                  ['DO + IT keluar', g.do.n + g.it_keluar.n, b.do_count, b.selisih_do_it],
                  ['GR (semua)', g.gr.n, b.gr_count, b.selisih_gr],
                  ['GR vendor saja', g.gr.vendor_n, b.gr_count, b.selisih_gr_vendor],
                  ['Qty keluar', g.do.qty, b.qty_keluar, b.selisih_qty]];
        isi = '<div style="margin-bottom:8px">' + (!b.selisih_do && !b.selisih_gr ? oPil('COCOK', 'p-ok') : oPil('ADA SELISIH', 'p-er')) + '</div>' +
          oTab([['Yang dihitung'], ['Dari tabel DOC', 1], ['Laporan Harian', 1], ['Selisih', 1]],
            br.map(function (x) {
              return '<tr><td>' + esc(x[0]) + '</td><td class="ra">' + fmt(x[1]) + '</td><td class="ra">' + fmt(x[2]) + '</td><td class="ra">' +
                (x[3] ? oPil((x[3] > 0 ? '+' : '') + fmt(x[3]), 'p-er') : '<span class="mut">0</span>') + '</td></tr>'; }), 520) +
          (g.sebab_dugaan || []).map(function (t) { return '<div class="note" style="margin-top:8px">⚠ ' + esc(t) + '</div>'; }).join('') +
          '<div class="mut" style="margin-top:8px">Kolom kiri dihitung dari baris DOC bertanggal ' + esc(tgl(g.tgl)) +
          ', VOID tidak ikut. Kalau dua kolom beda, yang kiri yang benar — daftarnya di bawah dan bisa dihitung sendiri.</div>';
      }
      out += oCard(judul, isi);
      var dok = (g.dok || []).map(function (x) {
        return '<tr><td class="mut">' + (x.jam >= 0 ? jjam(x.jam) : '–') + '</td><td>' +
          oPil(x.type, x.type === 'DO' ? 'p-in' : x.type === 'GR' ? 'p-ok' : x.type === 'IT' ? 'p-wa' : 'p-mu') +
          '</td><td><b>' + esc(x.doc_no) + '</b>' + (x.so_no ? '<div class="mut">SO ' + esc(x.so_no) + '</div>' : '') +
          '</td><td>' + esc(x.party || '–') + (x.antar_wh ? '<div class="mut">dari gudang lain</div>' : '') +
          '</td><td class="ra">' + fmt(x.qty) + '</td><td class="mut">' + esc(x.status) + '</td></tr>';
      });
      out += oCard('Daftar dokumen', oTab([['Jam'], ['Tipe'], ['No dokumen'], ['Pihak'], ['Qty', 1], ['Status']], dok, 620) +
        ((g.void_dok || []).length ? '<div class="mut" style="margin-top:8px">VOID, tidak dihitung: ' +
          esc(g.void_dok.map(function (x) { return x.type + ' ' + x.doc_no; }).join(', ')) + '</div>' : ''),
        (g.dok || []).length + ' dokumen');
    });
    return out;
  }

  /* --- 2. DO per cabang --- */
  function drawCabang(d) {
    var dd = d.semua.do, jml = 0;
    (d.kels || []).forEach(function (kk) { jml += dd[kk]; });
    var out = oTiles([
      ['DO', fmt(dd.n), fmt(dd.qty) + ' qty'], ['SELESAI', fmt(dd.selesai), ''],
      ['DIKIRIM', fmt(dd.dikirim), '', 'b'], ['MASIH BARU', fmt(dd.baru), '', 'y'],
      ['DALAM PROSES', fmt(dd.proses), '', 'y'], ['DO BALIK', fmt(dd.balik), '', dd.balik ? 'r' : ''],
      ['STATUS TAK DIKENAL', fmt(dd.lain), '', dd.lain ? 'r' : ''],
      ['IT KELUAR', fmt(d.semua.it.n), fmt(d.semua.it.qty) + ' qty', 'b']]);
    out += '<div class="' + (jml === dd.n ? 'mut' : 'note') + '" style="margin:10px 0">Rekonsiliasi: ' + fmt(dd.n) + ' DO = ' +
      fmt(dd.baru) + ' baru + ' + fmt(dd.proses) + ' proses + ' + fmt(dd.dikirim) + ' dikirim + ' + fmt(dd.selesai) +
      ' selesai + ' + fmt(dd.balik) + ' balik + ' + fmt(dd.lain) + ' lain = ' + fmt(jml) +
      (jml === dd.n ? ' ✓ cocok' : ' ✗ TIDAK COCOK, laporkan ini') + '</div>';
    var whs = d.whs || [];
    out += oCard('Per tanggal', oTab([['Tanggal'], ['Total DO', 1]].concat(whs.map(function (w) { return [w, 1]; })),
      (d.harian || []).map(function (b) {
        return '<tr><td>' + esc(tgl(b.tgl)) + '</td><td class="ra"><b>' + fmt(b.total) + '</b></td>' +
          whs.map(function (w) { var c = b.wh[w] || {n: 0, selesai: 0};
            return '<td class="ra">' + fmt(c.n) + '<div class="mut">selesai ' + fmt(c.selesai) + '</div></td>'; }).join('') + '</tr>';
      }), 320 + whs.length * 100));
    out += oCard('Ringkasan per cabang', oTab([['Cabang'], ['DO', 1], ['Qty', 1], ['IT keluar', 1], ['Hari aktif', 1]],
      (d.cabang || []).map(function (x) {
        return '<tr><td><b>' + esc(x.wh) + '</b><div class="mut">' + esc(x.nama) + '</div></td><td class="ra">' + fmt(x.do.n) +
          '</td><td class="ra">' + fmt(x.qty) + '</td><td class="ra">' + fmt(x.it.n) + '</td><td class="ra">' + fmt(x.hari_aktif) + '</td></tr>';
      })));
    return out;
  }

  /* --- 3. throughput per jam --- */
  function drawJam(d) {
    var puncak = (d.jam || []).reduce(function (a, b) { return b.input > a.input ? b : a; }, {input: 0, jam: 0});
    var out = oTiles([
      ['DO DIINPUT', fmt(d.total_do), ''],
      ['SUDAH DITUGASKAN', fmt(d.lead.n), ''],
      ['BELUM DITUGASKAN', fmt(d.tanpa_tugas), '', d.tanpa_tugas ? 'y' : ''],
      ['JAM TERSIBUK', puncak.input ? jjam(puncak.jam) : '–', puncak.input ? fmt(puncak.input) + ' DO diinput' : '', 'b'],
      ['INPUT KE PENUGASAN', d.lead.n ? mnt(d.lead.median) : '–', 'median'],
      ['PALING LAMBAT', d.lead.n ? mnt(d.lead.maks) : '–', 'p90 ' + (d.lead.n ? mnt(d.lead.p90) : '–')],
      ['LEWAT ' + d.batas_lambat + ' MENIT', fmt((d.lambat || []).length), '', (d.lambat || []).length ? 'r' : '']]);
    out += oCard('Per jam', oTab([['Jam'], ['DO diinput', 1], ['Ditugaskan', 1], ['Dikirim', 1], ['Diterima', 1]],
      (d.jam || []).filter(function (j) { return j.input || j.tugas || j.kirim || j.terima; }).map(function (j) {
        return '<tr><td><b>' + jjam(j.jam) + '</b></td><td class="ra">' + fmt(j.input) + '</td><td class="ra">' + fmt(j.tugas) +
          '</td><td class="ra">' + fmt(j.kirim) + '</td><td class="ra">' + fmt(j.terima) + '</td></tr>';
      })), esc(tgl(d.tgl)));
    if ((d.lambat || []).length) {
      out += oCard('Lama menunggu penugasan', oTab([['No DO'], ['Customer'], ['Diinput'], ['Ditugaskan'], ['Menunggu', 1]],
        d.lambat.map(function (x) {
          return '<tr><td><b>' + esc(x.doc_no) + '</b><div class="mut">' + esc(x.wh) + (x.so_no ? ' · SO ' + esc(x.so_no) : '') + '</div></td><td>' +
            esc(x.party || '–') + '</td><td class="mut">' + esc(String(x.input).slice(11, 16)) + '</td><td class="mut">' +
            esc(String(x.tugas).slice(11, 16)) + '</td><td class="ra"><b>' + esc(mnt(x.menit)) + '</b></td></tr>';
        }), 620));
    }
    out += '<p class="mut">Jam penugasan untuk kiriman internal diambil dari DRIVER_TASK (planned_at), untuk ekspedisi dari saat manifest dibuat. DRIVER_TASK belum punya kolom waktu pembuatan, jadi angka internal adalah pendekatan.</p>';
    return out;
  }

  /* --- 4. pemakaian ekspedisi --- */
  function drawEks(d) {
    var s = d.semua;
    var out = oTiles([
      ['TOTAL DO', fmt(s.n), ''],
      ['LEWAT EKSPEDISI', fmt(s.ext), s.pct_ext + '% dari semua DO', 'b'],
      ['KURIR SENDIRI', fmt(s.int), s.pct_int + '%'],
      ['BELUM DITENTUKAN', fmt(s.blm), '', s.blm ? 'y' : ''],
      ['QTY LEWAT EKSPEDISI', fmt(s.qty_ext), 'dari ' + fmt(s.qty) + ' qty'],
      ['KOLI LEWAT EKSPEDISI', fmt(s.koli_ext), ''],
      ['NAMA EKSPEDISI', fmt(d.jumlah_carrier), d.jumlah_carrier > 12 ? 'terlalu banyak, perlu disatukan' : '', d.jumlah_carrier > 12 ? 'y' : '']]);
    out += oCard('Per ekspedisi', oTab([['Ekspedisi'], ['DO', 1], ['Qty', 1], ['Koli', 1], ['Porsi', 1]],
      (d.carrier || []).map(function (c) {
        return '<tr><td><b>' + esc(c.nama) + '</b>' + ((c.wh || []).length > 1 ? '<div class="mut">' + esc(c.wh.join(', ')) + '</div>' : '') +
          '</td><td class="ra">' + fmt(c.n) + '</td><td class="ra">' + fmt(c.qty) + '</td><td class="ra">' + fmt(c.koli) +
          '</td><td class="ra">' + (s.ext ? Math.round(c.n * 1000 / s.ext) / 10 + '%' : '–') + '</td></tr>';
      })));
    if ((d.bulanan || []).length > 1) {
      out += oCard('Per bulan', oTab([['Bulan'], ['Ekspedisi', 1], ['Kurir sendiri', 1], ['Belum', 1], ['Porsi ekspedisi', 1]],
        d.bulanan.map(function (b) { var t = b.ext + b.int + b.blm;
          return '<tr><td><b>' + esc(b.bln) + '</b></td><td class="ra">' + fmt(b.ext) + '</td><td class="ra">' + fmt(b.int) +
            '</td><td class="ra">' + fmt(b.blm) + '</td><td class="ra">' + (t ? Math.round(b.ext * 1000 / t) / 10 + '%' : '–') + '</td></tr>';
        }), 560));
    }
    if ((d.per_gudang || []).length > 1) {
      out += oCard('Per cabang', oTab([['Cabang'], ['DO', 1], ['Ekspedisi', 1], ['Kurir sendiri', 1], ['Porsi', 1]],
        d.per_gudang.map(function (x) {
          return '<tr><td><b>' + esc(x.wh) + '</b><div class="mut">' + esc(x.nama) + '</div></td><td class="ra">' + fmt(x.n) +
            '</td><td class="ra">' + fmt(x.ext) + '</td><td class="ra">' + fmt(x.int) + '</td><td class="ra"><b>' + x.pct_ext + '%</b></td></tr>';
        })));
    }
    return out;
  }

  /* --- 5. kiriman internal --- */
  function drawIntl(d) {
    var s = d.semua;
    var out = oTiles([
      ['TUGAS DRIVER', fmt(s.tugas), ''],
      ['SELESAI', fmt(s.selesai), s.tugas ? Math.round(s.selesai * 1000 / s.tugas) / 10 + '%' : ''],
      ['SEDANG JALAN', fmt(s.jalan), '', 'b'],
      ['BELUM MULAI', fmt(s.belum), '', s.belum ? 'y' : ''],
      ['QTY DIANTAR', fmt(s.qty), ''],
      ['JARAK', fmt(s.km) + ' km', ''],
      ['DO INTERNAL', fmt(s.do_int), ''],
      ['BELUM DITUGASKAN', fmt(s.do_tanpa_tugas), '', s.do_tanpa_tugas ? 'r' : '']]);
    if (s.do_tanpa_tugas) out += '<div class="note" style="margin:10px 0">Ada ' + fmt(s.do_tanpa_tugas) +
      ' DO internal yang belum punya penugasan driver dan belum diterima. Inilah kiriman yang biasanya terlupa.</div>';
    out += oCard('Per driver', oTab([['Driver'], ['Tugas', 1], ['Selesai', 1], ['Lama antar', 1], ['Qty', 1], ['Km', 1]],
      (d.driver || []).map(function (x) {
        return '<tr><td><b>' + esc(x.nama) + '</b>' + ((x.wh || []).length > 1 ? '<div class="mut">' + esc(x.wh.join(', ')) + '</div>' : '') +
          '</td><td class="ra">' + fmt(x.tugas) + '</td><td class="ra">' + fmt(x.selesai) + '<div class="mut">' + x.pct_selesai +
          '%</div></td><td class="ra">' + (x.lama_median ? esc(mnt(x.lama_median)) : '–') + '</td><td class="ra">' + fmt(x.qty) +
          '</td><td class="ra">' + fmt(x.km) + '</td></tr>';
      }), 620));
    if ((d.do_tanpa_tugas || []).length) {
      out += oCard('DO internal belum ditugaskan', oTab([['No DO'], ['Tanggal'], ['Customer'], ['Qty', 1], ['Status']],
        d.do_tanpa_tugas.map(function (x) {
          return '<tr><td><b>' + esc(x.doc_no) + '</b><div class="mut">' + esc(x.wh) + '</div></td><td class="mut">' + esc(tgl(x.tgl)) +
            '</td><td>' + esc(x.party || '–') + '</td><td class="ra">' + fmt(x.qty) + '</td><td class="mut">' + esc(x.status) + '</td></tr>';
        }), 560), d.do_tanpa_tugas.length + ' DO');
    }
    if ((d.sedang_jalan || []).length) {
      out += oCard('Sedang jalan', oTab([['Driver'], ['Tujuan'], ['Qty', 1], ['Mulai']],
        d.sedang_jalan.map(function (x) {
          return '<tr><td><b>' + esc(x.driver) + '</b><div class="mut">' + esc(x.wh) + '</div></td><td>' + esc(x.party || x.ref || '–') +
            '</td><td class="ra">' + fmt(x.qty) + '</td><td class="mut">' + esc(String(x.mulai).slice(11, 16)) + '</td></tr>';
        })));
    }
    return out;
  }

  /* --- 6. kebutuhan barang & demand bulanan --- */
  function drawDemand(d) {
    var db = d.demand_bulanan || [];
    var rata = db.length ? Math.round(db.reduce(function (t, x) { return t + x.qty; }, 0) / db.length) : 0;
    var maxB = db.reduce(function (m, x) { return Math.max(m, x.qty); }, 0) || 1;
    var akhir = db.length ? db[db.length - 1] : null;
    var out = oTiles([
      ['BARANG BERGERAK', fmt(d.n_item), ''],
      ['KELUAR BULAN TERAKHIR', fmt(akhir ? akhir.qty : 0), akhir ? akhir.bln : ''],
      ['RATA PER BULAN', fmt(rata), ''],
      ['PERLU DIBELI', fmt(d.jumlah_perlu_beli), 'stok tahan < ' + d.tahan_min + ' bulan', d.jumlah_perlu_beli ? 'r' : ''],
      ['PERMINTAAN NAIK', fmt((d.naik || []).length), 'naik >25%', 'b'],
      ['PERMINTAAN TURUN', fmt((d.turun || []).length), 'turun >25%', 'y']]);
    out += oCard('Demand per bulan', oTab([['Bulan'], ['Qty keluar', 1], ['']],
      db.map(function (b) {
        return '<tr><td><b>' + esc(b.bln) + '</b></td><td class="ra">' + fmt(b.qty) + '</td><td>' + oBar(b.qty * 100 / maxB) + '</td></tr>';
      })));
    if ((d.perlu_beli || []).length) {
      out += oCard('Perlu dibeli', oTab([['Barang'], ['Rata/bulan', 1], ['Stok', 1], ['Tahan', 1], ['Saran beli', 1]],
        d.perlu_beli.map(function (x) {
          return '<tr><td><b>' + esc(x.item) + '</b><div class="mut">' + esc(x.nama || '–') + '</div></td><td class="ra">' + fmt(x.rata_bulan) +
            '</td><td class="ra">' + fmt(x.stok) + (x.pesanan_buka ? '<div class="mut">pesanan ' + fmt(x.pesanan_buka) + '</div>' : '') +
            '</td><td class="ra">' + oTahan(x.tahan_bulan) + '</td><td class="ra"><b>' + fmt(x.saran_qty) + '</b>' +
            (x.uom ? '<div class="mut">' + esc(x.uom) + '</div>' : '') + '</td></tr>';
        }), 620), 'target stok ' + d.target_bulan + ' bulan');
    }
    /* kolom tabel ini TETAP berapa pun rentang bulannya; rincian per bulan dibuka terpisah */
    var top = (d.top_keluar || []).slice(0, 50);
    out += oCard('Barang keluar terbanyak',
      oTab([['Barang'], ['Total', 1], ['Rata/bulan', 1], ['Bln terakhir', 1], ['Arah', 1], ['Stok', 1], ['Tahan', 1], ['']],
        top.map(function (x, i) {
          return '<tr><td><b>' + esc(x.item) + '</b><div class="mut">' + esc(x.nama || '–') + '</div></td><td class="ra"><b>' + fmt(x.total) +
            '</b></td><td class="ra">' + fmt(x.rata_bulan) + '</td><td class="ra">' + fmt(x.bulan_terakhir) + '</td><td class="ra">' +
            (x.bulan_awal ? oArah(x.arah) : '<span class="mut">–</span>') + '</td><td class="ra">' + fmt(x.stok) + '</td><td class="ra">' +
            oTahan(x.tahan_bulan) + '</td><td><button type="button" class="chip odr" data-i="' + i + '">Rinci</button></td></tr>';
        }), 820), (d.bulan || []).length + ' bulan');
    var r = null;
    if (own.rinci) { top.forEach(function (x) { if (x.item === own.rinci) r = x; }); }
    if (r) {
      var mx = (d.bulan || []).reduce(function (m, b) { return Math.max(m, r.bln[b] || 0); }, 0) || 1;
      out += oCard('Rincian per bulan · ' + r.item + (r.nama ? ' · ' + r.nama : ''),
        oTab([['Bulan'], ['Qty keluar', 1], ['']], (d.bulan || []).map(function (b) {
          return '<tr><td>' + esc(b) + '</td><td class="ra">' + fmt(r.bln[b] || 0) + '</td><td>' + oBar((r.bln[b] || 0) * 100 / mx) + '</td></tr>';
        })) +
        '<div class="mut" style="margin-top:8px">Stok ' + fmt(r.stok) + ' · tahan ' +
        (r.tahan_bulan >= 99 ? 'lama' : fmt(r.tahan_bulan) + ' bulan') +
        (r.pesanan_buka ? ' · pesanan terbuka ' + fmt(r.pesanan_buka) : '') + '</div>' +
        '<button type="button" class="chip" id="odx" style="margin-top:8px">Tutup rincian</button>');
    }
    out += '<p class="mut">Demand dari LEDGER qty keluar, hanya tipe DO dan IT. DAMAGE, ADJ, dan RETURN tidak dihitung sebagai permintaan pasar. Saran beli = rata-rata per bulan × ' +
      d.target_bulan + ' − stok + pesanan terbuka.</p>';
    return out;
  }
  function bindDemand(d) {
    var top = (d.top_keluar || []).slice(0, 50);
    Array.prototype.forEach.call(document.querySelectorAll('#r .odr'), function (b) {
      b.onclick = function () { var x = top[Number(b.getAttribute('data-i'))]; own.rinci = x ? x.item : ''; if (ownRedraw) ownRedraw(); };
    });
    var xb = $('#odx');
    if (xb) xb.onclick = function () { own.rinci = ''; if (ownRedraw) ownRedraw(); };
  }

  /* ---------- router ---------- */
  var V = {lacak: lacakView, stok: stokView, po: poView, analisa: anaRoute, notif: notifView};
  function route() {
    var v = (location.hash || '').replace('#', '') || LS.get('wt_view') || 'lacak'; if (!V[v]) v = 'lacak';
    LS.set('wt_view', v); paintNav(v); V[v](); window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  paintWho(); route();
  if (KEY) getWhs().catch(function () {});
  /* cek notifikasi: saat app dibuka, saat kembali ke app, dan tiap 5 menit selama app terbuka */
  notifFetch(true);
  /* Monitoring PO dipanggil saat menunya dibuka; tidak membebani halaman publik. */
  setInterval(function () { if (document.visibilityState === 'visible') notifFetch(true); }, 300000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') notifFetch(false); });
  /* Sinkron otomatis hanya pada layar yang sedang dibuka dan terlihat; tanpa pindah halaman. */
  var wtLastRefresh = Date.now();
  function wtRefreshAktif() {
    var v = curView, ms = v === 'analisa' ? 300000 : 90000;
    if (document.visibilityState !== 'visible' || Date.now() - wtLastRefresh < ms) return;
    if (v !== 'lacak' && v !== 'stok' && v !== 'po' && v !== 'analisa') return;
    if ((v === 'po' || v === 'analisa') && !sess) return;
    if (v === 'lacak' && String(sessionStorage.getItem('wt_q') || '').length < 3) return;
    if (v === 'stok' && String(sessionStorage.getItem('wt_sq') || '').length < 2) return;
    if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    wtLastRefresh = Date.now(); V[v]();
  }
  setInterval(wtRefreshAktif, 30000);
  document.addEventListener('visibilitychange', wtRefreshAktif);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
