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
    return call('pub', [KEY, name, a || {}]).then(function (r) { if (!r || !r.ok) throw new Error((r && r.error) || 'Gagal memuat'); return r.data; });
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
    return call('rpc', [sess.token, name, a || {}]).then(function (r) {
      if (r && r.code === 'AUTH') { logoutLocal(); throw new Error('Sesi berakhir, silakan login lagi.'); }
      if (!r || !r.ok) throw new Error((r && r.error) || 'Gagal memuat');
      return r.data;
    });
  }
  function logoutLocal() { if (sess) call('logout', [sess.token]).catch(function () {}); sess = null; LS.del('wt_sess'); paintWho(); paintNav(); }

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
  var MENU = [['lacak', 'Lacak', 'Lacak Pesanan'], ['stok', 'Stok', 'Status Stok'], ['po', 'PO Sales', 'Monitoring PO'], ['analisa', 'Analisa', 'Analisa Barang'], ['notif', 'Notif', 'Notifikasi']];
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
    w.innerHTML = sess ? esc(sess.user.name) + ' · ' + esc(roleName(sess.user.role)) + '<br><button type="button" id="lo">Keluar</button>' : 'Belum login · menu PO & Analisa butuh login';
    var b = $('#lo'); if (b) b.onclick = function () { logoutLocal(); route(); };
  }
  function roleName(r) { return {MANAGER: 'Branch Manager', KOORDINATOR: 'Koordinator', SALES: 'Sales', SALES_ADMIN: 'Sales Admin', ADMIN_WH: 'Admin WH'}[r] || r; }

  var main = $('#main');
  function view(html) { main.innerHTML = html; }
  function skel(n) { var s = ''; for (var i = 0; i < (n || 2); i++) s += '<div class="sk"></div>'; return s; }

  /* ================= LACAK ================= */
  var STEP_LBL = ['Order diterima', 'Divalidasi', 'Disiapkan', 'Siap kirim', 'Dikirim', 'Diterima'];
  function lacakView() {
    var q = sessionStorage.getItem('wt_q') || qs.get('q') || '';
    view('<header class="hd"><h1>Lacak Pesanan</h1><form class="srch" id="f" role="search"><label for="q" class="sr" style="position:absolute;left:-9999px">Nomor atau nama</label>' +
      '<input id="q" enterkeyhint="search" autocomplete="off" placeholder="No PO, SO, DO, resi, atau nama customer" value="' + esc(q) + '"><button class="btn">Lacak</button></form>' +
      '<div class="sub">Bisa pakai No PO customer, No SO / DO, No PO beli, atau sebagian nama customer.</div></header><section class="body" id="r"></section>');
    $('#f').onsubmit = function (e) { e.preventDefault(); cari(); };
    if (q.length >= 3) cari(true); else $('#r').innerHTML = '<div class="empty">Ketik minimal 3 huruf / angka lalu tekan Lacak.</div>';
    function cari(auto) {
      var v = $('#q').value.trim(); sessionStorage.setItem('wt_q', v);
      if (v.length < 3) { $('#r').innerHTML = '<div class="empty">Ketik minimal 3 huruf / angka.</div>'; return; }
      var cached = sessionStorage.getItem('wt_lacak:' + v); if (cached) { try { drawLacak(JSON.parse(cached)); } catch (e) {} } else $('#r').innerHTML = skel(2);
      if (!auto) $('#q').blur();
      pub('lacak', {q: v}).then(function (d) { sessionStorage.setItem('wt_lacak:' + v, JSON.stringify(d)); drawLacak(d); })
        .catch(function (e) { if (isKeyErr(e)) { $('#r').innerHTML = keyBox(e.message); bindKey(function () { cari(); }); return; } if (!cached) $('#r').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; else toast(e.message); });
    }
  }
  function isKeyErr(e) { return /Link tidak berlaku|Link tracking belum lengkap/i.test(String(e && e.message || '')); }
  function drawLacak(d) {
    var r = $('#r'); if (!r) return;
    if (d.error) { r.innerHTML = '<div class="err">' + esc(d.error) + '</div>'; return; }
    var rows = d.rows || [];
    var head = '<div class="meta"><span>' + (d.total ? fmt(d.total) + ' hasil untuk “' + esc(d.q) + '”' + (d.total > rows.length ? ' · tampil ' + rows.length : '') : '') + '</span><span>' + (d.now ? 'diperbarui ' + esc(String(d.now).slice(11, 16)) : '') + '</span></div>';
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
  function stokView() {
    var q = sessionStorage.getItem('wt_sq') || '', wh = sessionStorage.getItem('wt_swh') || 'ALL';
    view('<header class="hd"><h1>Status Stok</h1><form class="srch" id="f" role="search"><input id="q" enterkeyhint="search" autocomplete="off" placeholder="Kode atau nama barang" value="' + esc(q) + '" aria-label="Kode atau nama barang"><button class="btn">Cari</button></form><div class="chips" id="wc"></div></header><section class="body" id="r"></section>');
    var drawChips = function (list) { $('#wc').innerHTML = [{code: 'ALL', name: 'Semua gudang'}].concat(list || []).map(function (w) { return '<button type="button" class="chip' + (w.code === wh ? ' on' : '') + '" data-w="' + esc(w.code) + '">' + esc(w.code === 'ALL' ? w.name : w.code) + '</button>'; }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('#wc .chip'), function (b) { b.onclick = function () { wh = b.getAttribute('data-w'); sessionStorage.setItem('wt_swh', wh); drawChips(list); if ($('#q').value.trim().length >= 2) cari(); }; }); };
    drawChips(whsCache || []); getWhs().then(drawChips).catch(function () {});
    $('#f').onsubmit = function (e) { e.preventDefault(); $('#q').blur(); cari(); };
    if (q.length >= 2) cari(); else $('#r').innerHTML = '<div class="empty">Ketik kode atau nama barang, contoh: <b>respirator</b> atau <b>ALS-801N95</b>.</div>';
    function cari() {
      var v = $('#q').value.trim(); sessionStorage.setItem('wt_sq', v);
      if (v.length < 2) { $('#r').innerHTML = '<div class="empty">Ketik minimal 2 huruf.</div>'; return; }
      $('#r').innerHTML = skel(3);
      pub('stok', {q: v, wh: wh}).then(drawStok).catch(function (e) { if (isKeyErr(e)) { $('#r').innerHTML = keyBox(e.message); bindKey(cari); return; } $('#r').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
    }
  }
  function drawStok(d) {
    var r = $('#r'); if (!r) return; var rows = d.rows || [];
    var at = Object.keys(d.at || {}).map(function (k) { return d.at[k]; }).filter(Boolean).sort().pop() || '';
    r.innerHTML = rows.length ? '<div class="meta"><span>' + fmt(d.total) + ' barang' + (d.total > rows.length ? ' · tampil ' + rows.length : '') + '</span><span>Stok per ' + esc(tgl(at)) + '</span></div>' + rows.map(function (x) {
      var lv = LV[x.lvl] || LV.K;
      return '<article class="card"><div class="row"><div><div class="t2">' + esc(x.item) + '</div><div class="mut">' + esc(x.name) + '</div></div><div style="text-align:right"><span class="pill ' + lv[1] + '">' + lv[0] + '</span><div class="t2" style="margin-top:4px">' + fmt(x.total) + ' <small class="mut">' + esc(x.uom || '') + '</small></div></div></div>' +
        '<div class="whg">' + x.whs.map(function (w) { var l = LV[w.lvl] || LV.K; return '<div class="' + l[1] + '"><span>' + esc(w.code) + '</span><b>' + fmt(w.tersedia) + '</b><small>' + (w.dipesan ? 'dipesan ' + fmt(w.dipesan) : l[0]) + '</small></div>'; }).join('') + '</div>' +
        (x.ordered > 0 && x.total <= 0 ? '<div class="mut">Sedang dipesan ' + fmt(x.ordered) + ' ' + esc(x.uom || '') + '</div>' : '') + '</article>';
    }).join('') + '<p class="mut">Angka = qty tersedia (stok dikurangi yang sudah dipesan SO lain). Ready ≥ 10 · Terbatas 1–9 · Dipesan = sedang PO ke supplier.</p>'
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
  var po = {mode: 'buka', wh: 'ALL', sales: '', q: ''};
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
      po.q = $('#q').value.trim(); var args = {mode: po.mode, q: po.q, wh: po.wh, sales: po.sales}, key = 'wt_po:' + JSON.stringify(args), c = sessionStorage.getItem(key);
      if (c) { try { draw(JSON.parse(c)); } catch (e) {} } else $('#r').innerHTML = skel(3);
      rpc('po.sales', args).then(function (d) { sessionStorage.setItem(key, JSON.stringify(d)); draw(d); })
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
  var ana = {wh: 'ALL', days: 90, list: 'dead'};
  function anaView() {
    if (!sess) return loginView('Analisa Barang', 'Khusus Branch Manager / Director. Login dengan akun WMS.');
    var u = sess.user; if (u.role !== 'MANAGER' && u.role !== 'KOORDINATOR') { view('<header class="hd"><h1>Analisa Barang</h1></header><section class="body"><div class="empty">Menu ini khusus Branch Manager / Director.</div></section>'); return; }
    view('<header class="hd"><h1>Analisa Barang</h1><div class="sub">Pergerakan barang keluar per gudang dari Ledger + Stock Today, dihitung otomatis tiap jam.</div><div class="chips" id="wc"></div><div class="chips" id="pc"></div></header>' +
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
      var key = 'wt_ana:' + ana.wh + ':' + ana.days, c = sessionStorage.getItem(key);
      if (c) { try { draw(JSON.parse(c)); } catch (e) {} } else { $('#r').innerHTML = skel(3); }
      rpc('ana.ringkas', {wh: ana.wh, days: ana.days}).then(function (d) { sessionStorage.setItem(key, JSON.stringify(d)); draw(d); })
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
          '<div class="nt-t">' + (baru ? '<i class="dot" aria-label="baru"></i>' : '') + esc(x.title) + '</div><div class="mut">' + esc(x.text) + '</div>' + (x.sales ? '<div class="mut">Sales: ' + esc(x.sales) + '</div>' : '') + '</button>';
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

  /* ---------- router ---------- */
  var V = {lacak: lacakView, stok: stokView, po: poView, analisa: anaView, notif: notifView};
  function route() {
    var v = (location.hash || '').replace('#', '') || LS.get('wt_view') || 'lacak'; if (!V[v]) v = 'lacak';
    LS.set('wt_view', v); paintNav(v); V[v](); window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  paintWho(); route();
  if (KEY) getWhs().catch(function () {});
  /* cek notifikasi: saat app dibuka, saat kembali ke app, dan tiap 5 menit selama app terbuka */
  notifFetch(true);
  setInterval(function () { if (document.visibilityState === 'visible') notifFetch(true); }, 300000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') notifFetch(false); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
