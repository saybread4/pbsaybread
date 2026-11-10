/* PB SAY BREAD - menu "Stok & Order DCF" (administrator).  Semua satuan CTN.
   Stok DC = stok Takaki (data ED) + inbound tiba - outbound PB per tanggal.  Rata-rata outbound = 4 minggu terakhir dari histori PB web (arsip_pb_item).
   DSI = stok / SPD (sales: tabel sales).  Order Takaki: total PO = kapasitas kendaraan (tronton/jumbo/build-up), diisi per item menyamakan DSI.
   Tabel Supabase: dcf_item, dcf_stok_batch, dcf_inbound (tiba / on going), dcf_po, dcf_po_line (hanya admin). */
(function () {
  'use strict';
  const iso = d => d.toISOString().slice(0, 10);
  const pd = s => new Date(s + 'T00:00:00Z');
  const addD = (s, n) => iso(new Date(pd(s).getTime() + n * 864e5));
  const dow = s => pd(s).getUTCDay();
  const monOf = s => addD(s, -((dow(s) + 6) % 7));
  const todayJ = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const MONL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const DAYN = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const dd = s => String(pd(s).getUTCDate()).padStart(2, '0');
  const fd = s => s ? dd(s) + ' ' + MON[pd(s).getUTCMonth()] : '';
  const fdl = s => s ? pd(s).getUTCDate() + ' ' + MONL[pd(s).getUTCMonth()] : '';
  const fdd = s => s ? DAYN[dow(s)] + ' ' + fd(s) : '';
  const rng = (a, b) => dd(a) + '-' + dd(b);
  const n0 = v => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  const n1 = v => Number(v || 0).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dsx = v => (v == null || !isFinite(v)) ? '-' : n0(v);
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const Q = (s, r) => (r || document).querySelector(s);
  const sbc = () => window.PBAPI.sb;
  const gTok = () => (typeof TOKEN !== 'undefined' ? TOKEN : null), gD = () => (typeof D !== 'undefined' ? D : null);
  const msg = (m, err) => { if (window.toast) window.toast(m, err); else alert(m); };
  const must = r => { if (r.error) throw new Error(r.error.message); return r.data; };
  const VEH = ['TRONTON', 'JUMBO', 'BUILT-UP'];

  const X = { tab: 'stok', ready: false, items: [], batches: [], inb: [], spdQ: {}, pbw: {}, cfg: { target: 30, round: 0.5, inboundDari: '2026-11-07', lead: 2, kend: { TRONTON: 1518, JUMBO: 1782, 'BUILT-UP': 2178 } },
    snap: null, today: todayJ(), outDay: {}, known: {}, weekTot: {}, warn: [], po: null, rows: [], pos: [], tibaTgl: null, extraOn: [], extraAr: [] };

  // ---------------- data ----------------
  const apiOut = w => new Promise(ok => window.PBAPI.call('getOutbound', [gTok(), false, w], r => ok(r), () => ok(null)));
  async function loadAll() {
    const s = sbc(), C = X.cfg;
    must(await s.from('settings').select('key,value').in('key', ['dcf_target_dsi', 'dcf_round_pct', 'dcf_inbound_dari', 'dcf_kendaraan', 'dcf_lead_tiba'])).forEach(r => {
      if (r.key === 'dcf_target_dsi') C.target = Number(r.value) || 30; if (r.key === 'dcf_round_pct') C.round = Number(r.value);
      if (r.key === 'dcf_inbound_dari') C.inboundDari = String(r.value); if (r.key === 'dcf_lead_tiba') C.lead = Number(r.value);
      if (r.key === 'dcf_kendaraan' && r.value && typeof r.value === 'object') C.kend = r.value;
    });
    X.today = todayJ(); if (!X.tibaTgl) X.tibaTgl = X.today;
    const [it, bt, ib, sq, pw, cu, nx] = await Promise.all([
      s.from('dcf_item').select('*').order('urut'), s.from('dcf_stok_batch').select('*').order('tgl_exp').limit(5000),
      s.from('dcf_inbound').select('*').gte('tgl', addD(C.inboundDari, -1)).order('tgl').limit(5000), s.rpc('dcf_sales_qpd'), s.rpc('dcf_pb_minggu'), apiOut('cur'), apiOut('next')]);
    X.items = must(it); X.batches = must(bt); X.inb = must(ib);
    X.spdQ = {}; must(sq).forEach(r => X.spdQ[r.plu] = Number(r.qpd) || 0);
    X.pbw = {}; must(pw).forEach(r => (X.pbw[r.plu] || (X.pbw[r.plu] = {}))[r.minggu] = Number(r.qty) || 0);
    X.snap = X.batches.length ? X.batches.reduce((m, b) => b.tgl_data > m ? b.tgl_data : m, '0000') : null;
    X.outDay = {}; X.known = {}; X.weekTot = {}; X.warn = [];
    [['cur', cu], ['next', nx]].forEach(([w, r]) => {
      if (!r || r.missing || !r.dates || !r.dates.length) { X.warn.push('Outbound minggu ' + (w === 'cur' ? 'berjalan' : 'depan') + ' belum tersedia di web: dihitung dengan rata-rata 4 minggu.'); return; }
      const wk = monOf(r.dates[0]); X.known[wk] = 1;
      (r.items || []).forEach(i => {
        const m = X.outDay[i.plu] || (X.outDay[i.plu] = {});
        r.dates.forEach((d, k) => { m[d] = (m[d] || 0) + (Number(i.pb[k]) || 0); });
        (X.weekTot[i.plu] || (X.weekTot[i.plu] = {}))[wk] = Number(i.tot) || (i.pb || []).reduce((a, b) => a + (Number(b) || 0), 0);
      });
    });
    X.ready = true;
  }

  // ---------------- perhitungan stok ----------------
  const nextWk = () => addD(monOf(X.today), 7);
  function build() {
    const nw = nextWk(), t1 = addD(X.today, 1);
    X.rows = X.items.map(it => {
      const pc = String(it.plu_cust || '').trim(), bs = X.batches.filter(b => String(b.plu_cust).trim() === pc);
      const r = { it, plu: it.plu_dc, s0: bs.reduce((a, b) => a + Number(b.stok || 0), 0), bs, arr: {}, ong: {}, ongRaw: {} };
      X.inb.forEach(x => {
        if (x.plu_dc !== it.plu_dc) return; const q = Number(x.qty) || 0;
        if (x.tiba) { const d = x.tgl_tiba || x.tgl; r.arr[d] = (r.arr[d] || 0) + q; }
        else { r.ongRaw[x.tgl] = (r.ongRaw[x.tgl] || 0) + q; const d = x.tgl < t1 ? t1 : x.tgl; r.ong[d] = (r.ong[d] || 0) + q; }
      });
      const w = Object.assign({}, X.pbw[it.plu_dc] || {}), ov = X.weekTot[it.plu_dc] || {}; Object.keys(ov).forEach(k => { if (w[k] == null) w[k] = ov[k]; });
      r.wk = Object.keys(w).filter(k => k <= nw).sort().slice(-4).map(k => [k, w[k]]);
      r.avg = r.wk.length ? r.wk.reduce((a, b) => a + b[1], 0) / r.wk.length : 0;
      r.spd = (X.spdQ[it.plu_dc] || 0) / (Number(it.frc) || 1);
      return r;
    });
    return X.rows;
  }
  function outOn(r, d) { const wk = monOf(d); if (X.known[wk]) return (X.outDay[r.plu] || {})[d] || 0; return dow(d) === 0 ? 0 : r.avg / 6; }
  function sim(r, endISO, future, clamp) {
    if (!X.snap) return { at: {}, end: 0, min: 0 };
    let s = r.s0; Object.keys(r.arr).forEach(d => { if (d >= X.cfg.inboundDari && d <= X.snap) s += r.arr[d]; });
    const at = {}; at[X.snap] = s; let min = s;
    for (let d = addD(X.snap, 1); d <= endISO; d = addD(d, 1)) {
      s += r.arr[d] || 0; if (future) s += r.ong[d] || 0; s -= outOn(r, d);
      if (s < min) min = s; if (clamp && s < 0) s = 0; at[d] = s;
    }
    return { at, end: endISO < X.snap ? at[X.snap] : s, min };
  }
  function stokRow(r) {
    const cur = monOf(X.today), eowC = addD(cur, 5), nxt = addD(cur, 7), eowN = addD(cur, 12), snap = X.snap || X.today;
    r.dArr = []; for (let d = X.cfg.inboundDari; d <= X.today; d = addD(d, 1)) r.dArr.push(d);
    r.pbRest = 0; for (let d = addD(snap, 1); d <= eowC; d = addD(d, 1)) r.pbRest += outOn(r, d);
    r.sisa = Math.max(0, r.s0 - r.pbRest);
    r.inbArr = r.dArr.reduce((t, d) => t + (r.arr[d] || 0), 0);
    r.ttl = (r.sisa + r.inbArr) < 1 ? 0 : r.sisa + r.inbArr;
    r.outbN = 0; for (let d = nxt; d <= eowN; d = addD(d, 1)) r.outbN += outOn(r, d);
    r.akh = r.ttl - r.outbN;
    r.now = sim(r, X.today < snap ? snap : X.today, false).end;
    r.ongo = Object.keys(r.ongRaw).reduce((t, d) => t + r.ongRaw[d], 0);
    r.stkAkh = Math.max(0, r.akh) + r.ongo; r.estPb = 2 * r.avg; r.sisaStk = Math.round(Math.max(0, r.stkAkh - r.estPb));
    r.dsiA = r.spd > 0 ? Math.max(0, r.now) / r.spd : null; r.dsiB = r.spd > 0 ? r.stkAkh / r.spd : null;
    // ED per bulan (FEFO)
    const b = r.bs.filter(x => Number(x.stok) > 0 && x.tgl_exp).sort((x, y) => x.tgl_exp < y.tgl_exp ? -1 : 1);
    r.edB = {}; b.forEach(x => { const k = x.tgl_exp.slice(0, 7); r.edB[k] = (r.edB[k] || 0) + Number(x.stok); });
    r.edRisk = b.filter(x => (pd(x.tgl_exp) - pd(X.today)) / 864e5 <= 30).reduce((t, x) => t + Number(x.stok), 0);
    r.edNear = b[0] ? { exp: b[0].tgl_exp, hari: Math.round((pd(b[0].tgl_exp) - pd(X.today)) / 864e5) } : null;
    return r;
  }
  function edMonths() {
    const set = new Set(); X.rows.forEach(r => r.it.aktif && Object.keys(r.edB).forEach(k => set.add(k)));
    const m = [...set].sort(); return m.slice(0, 3);
  }
  function edBuckets(r, months) {
    const base = months.map(k => r.edB[k] || 0), rest = Object.keys(r.edB).filter(k => !months.includes(k)).reduce((t, k) => t + r.edB[k], 0); base.push(rest);
    const after = base.slice(); let c = r.pbRest + r.outbN;
    for (let i = 0; i < after.length && c > 0; i++) { const t = Math.min(after[i], c); after[i] -= t; c -= t; }
    after[after.length - 1] += r.inbArr; return { base, after };
  }

  // ---------------- order ----------------
  const cap = v => Number(X.cfg.kend[v]) || 0;
  const newDate = (p, from) => { let d = from; const used = p.pos.map(x => x.date); while (dow(d) === 0 || used.includes(d)) d = addD(d, 1); return d; };
  function etaOf(date) { return addD(date, X.cfg.lead); }
  function acuanOf(p) { return p.acuan || (p.pos.length ? p.pos.map(x => etaOf(x.date)).sort().pop() : addD(X.today, 21)); }
  function calcOrder() {
    const p = X.po, T = acuanOf(p), first = p.pos.length ? p.pos.map(x => x.date).sort()[0] : addD(X.today, 14);
    X.rows.forEach(r => {
      stokRow(r);
      const sT = sim(r, T, true, true), sM = sim(r, addD(etaOf(first), -1), true, true);
      r.P = Number(r.it.pallet_ctn) || 77; r.tgt = r.it.target_dsi != null ? Number(r.it.target_dsi) : X.cfg.target;
      r.stockT = sT.end; r.minPre = sM.min; r.dsiT = r.spd > 0 ? sT.end / r.spd : null;
      r.need = r.it.aktif && r.spd > 0 ? Math.max(0, r.tgt * r.spd - sT.end) : 0;
    });
    p.recTot = X.rows.reduce((t, r) => t + r.need, 0);
  }
  function suggestPOs() {
    const p = X.po, rec = p.recTot, caps = VEH.map(cap);
    let best = null;
    if (rec > 0) for (let n = 1; n <= 6; n++) {
      const tot = k => { let s = 0, x = k; for (let i = 0; i < n; i++) { s += caps[x % 3]; x = Math.floor(x / 3); } return s; };
      for (let k = 0; k < Math.pow(3, n); k++) { const s = tot(k); if (s >= rec && (!best || s < best.s || (s === best.s && n < best.n))) best = { s, n, k }; }
      if (best) break;
    }
    if (!best) best = { n: rec > 0 ? 6 : 1, k: rec > 0 ? 3 ** 6 - 1 : 0 };
    const pos = []; let d = addD(monOf(X.today), 14), x = best.k;
    for (let i = 0; i < best.n; i++) { d = newDate({ pos }, d); pos.push({ date: d, veh: VEH[x % 3] }); x = Math.floor(x / 3); d = addD(d, 1); }
    pos.sort((a, b) => a.date < b.date ? -1 : 1); p.pos = pos;
  }
  // water-filling: samakan DSI antar item sampai total = kapasitas, lalu bulatkan pallet & pecah ke tiap PO
  function allocate() {
    const p = X.po, caps = p.pos.map(o => cap(o.veh)), C = caps.reduce((a, b) => a + b, 0), R = X.rows.filter(r => r.it.aktif && r.spd > 0);
    p.cells = {}; p.manual = {}; X.rows.forEach(r => { p.cells[r.plu] = {}; });
    if (!C || !R.length) return;
    const need = L => R.reduce((t, r) => t + Math.max(0, L * r.spd - r.stockT), 0); let lo = 0, hi = 1e4;
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (need(m) < C) lo = m; else hi = m; }
    const q = R.map(r => Math.max(0, hi * r.spd - r.stockT));
    const t = R.map((r, i) => { const pal = Math.floor(q[i] / r.P), rem = q[i] - pal * r.P; return pal * r.P + (pal > 0 && rem >= X.cfg.round * r.P ? r.P : Math.ceil(rem - 1e-9)); });
    const dsiA = i => (R[i].stockT + t[i]) / R[i].spd, big = R.map((r, i) => i).filter(i => q[i] >= R[i].P), cand = big.length ? big : R.map((r, i) => i); let diff = C - t.reduce((a, b) => a + b, 0);
    for (let g = 0; g < 20000 && diff !== 0; g++) {
      let bi = -1;
      if (diff > 0) { for (const i of cand) if (bi < 0 || dsiA(i) < dsiA(bi)) bi = i; const a = Math.min(R[bi].P, diff); t[bi] += a; diff -= a; }
      else { for (const i of cand) if (t[i] > 0 && (bi < 0 || dsiA(i) > dsiA(bi))) bi = i; if (bi < 0) break; const a = Math.min(R[bi].P, -diff, t[bi]); t[bi] -= a; diff += a; }
    }
    const K = caps.length, x = R.map((r, i) => caps.map(c => t[i] * c / C)), f = R.map((r, i) => caps.map((c, k) => Math.floor(x[i][k] / r.P) * r.P));
    const rk = caps.map((c, k) => c - R.reduce((s, r, i) => s + f[i][k], 0)), si = R.map((r, i) => t[i] - f[i].reduce((a, b) => a + b, 0));
    for (let guard = 0; guard < 5000; guard++) {
      let bi = -1, bk = -1, bs = -1e9;
      for (let i = 0; i < R.length; i++) if (si[i] > 0) for (let k = 0; k < K; k++) if (rk[k] > 0) { const sc = x[i][k] - f[i][k]; if (sc > bs) { bs = sc; bi = i; bk = k; } }
      if (bi < 0) break; const a = Math.min(R[bi].P, si[bi], rk[bk]); f[bi][bk] += a; si[bi] -= a; rk[bk] -= a;
    }
    R.forEach((r, i) => { caps.forEach((c, k) => { p.cells[r.plu][k] = f[i][k]; }); });
  }
  const cellQ = (r, k) => Number(((X.po.cells[r.plu] || {})[k])) || 0;
  const totQ = r => X.po.pos.reduce((t, o, k) => t + cellQ(r, k), 0);
  function initPO() { X.po = { id: null, tgl_po: X.today, acuan: null, pos: [], cells: {}, manual: {}, catatan: '', recTot: 0 }; calcOrder(); suggestPOs(); calcOrder(); allocate(); }
  const palTxt = (q, P) => { const a = Math.floor(q / P), b = q - a * P; return q ? (a ? a + ' plt' : '') + (a && b ? ' + ' : '') + (b ? n0(b) + ' ctn' : '') : '-'; };

  // ---------------- tampilan ----------------
  const TH = 'padding:4px 7px;font-size:11px;white-space:nowrap;position:sticky;top:0;z-index:2;color:#1e1b4b;border:1px solid #d7dbea;text-align:center';
  const TH2 = 'padding:4px 7px;font-size:11px;white-space:nowrap;position:sticky;top:24px;z-index:2;color:#1e1b4b;border:1px solid #d7dbea;text-align:center';
  const TD = 'padding:3px 7px;border-bottom:1px solid #edf0f8;white-space:nowrap;font-size:12.5px;text-align:right';
  const TDL = 'padding:3px 7px;border-bottom:1px solid #edf0f8;white-space:nowrap;font-size:12.5px;position:sticky;left:0;background:inherit;z-index:1';
  const BG = { y: '#fff200', b: '#bfe6f7', g: '#d9f2d9', o: '#fde7d3', p: '#e3e0fb', gr: '#eceff6' };
  const root = () => Q('#vDcf');
  function shell() {
    const tabs = [['stok', 'Monitoring Stok'], ['order', 'Order Takaki (PO)'], ['inb', 'PO On Going / Tiba'], ['data', 'Data & Pengaturan']];
    root().innerHTML = '<div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 style="margin:0;color:var(--br)">Stok &amp; Order DCF</h3><span id="dcfSub" class="note" style="padding:0"></span><span style="flex:1"></span>'
      + '<span id="dcfSeg" style="display:inline-flex;gap:4px;flex-wrap:wrap">' + tabs.map(t => '<button class="b ' + (X.tab === t[0] ? 'p' : 's') + '" data-t="' + t[0] + '">' + t[1] + '</button>').join('') + '</span><button class="b s" id="dcfRl">Muat ulang</button></div><div id="dcfWarn"></div></div><div id="dcfBody"></div>';
    Q('#dcfSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; X.tab = b.dataset.t; shell(); paint(); };
    Q('#dcfRl').onclick = () => start(true);
  }
  function paint() {
    if (!X.ready) return;
    build(); X.rows.forEach(stokRow);
    Q('#dcfSub').textContent = X.snap ? 'Stok Takaki ' + fdd(X.snap) + ' · hari ini ' + fdd(X.today) + ' · satuan CTN' : 'Belum ada data stok Takaki — unggah di tab Data & Pengaturan';
    Q('#dcfWarn').innerHTML = X.warn.map(w => '<div class="note wn" style="padding-top:6px">' + w + '</div>').join('');
    ({ stok: paintStok, order: paintOrder, inb: paintInb, data: paintData })[X.tab]();
  }
  const kpi = (l, v, s, c) => '<div class="kpi"><small>' + l + '</small><b' + (c ? ' style="color:' + c + '"' : '') + '>' + v + '</b><span>' + (s || '') + '</span></div>';
  const th = (t, bg, extra, st) => '<th style="' + (st || TH) + ';background:' + bg + (extra || '') + '">' + t + '</th>';

  // ===== Monitoring Stok (mengikuti sheet STOK DCF) =====
  function paintStok() {
    const R = X.rows.filter(r => r.it.aktif), cur = monOf(X.today), eowC = addD(cur, 5), nxt = addD(cur, 7), eowN = addD(cur, 12), snap = X.snap || X.today, months = edMonths();
    const dOn = [...new Set([...Object.keys(R.reduce((m, r) => Object.assign(m, r.ongRaw), {})), ...X.extraOn])].sort();
    const dA = R.length ? R[0].dArr : [], wkAll = [...new Set(R.flatMap(r => r.wk.map(w => w[0])))].sort().slice(-4);
    const sum = f => R.reduce((t, r) => t + (f(r) || 0), 0);
    const neg = R.filter(r => r.now < 0).length, ed = sum(r => r.edRisk);
    const lab = months.map(k => 'EXP ' + MON[Number(k.slice(5, 7)) - 1].toUpperCase()).concat(['LAIN']);
    let h = '<div class="card" style="margin-top:12px"><div class="kpis">' + kpi('Stok DC hari ini', n0(sum(r => r.now)), 'ctn · item aktif') + kpi('PO on going', n0(sum(r => r.ongo)), 'ctn belum ditandai tiba') + kpi('Item stok minus', neg, 'PB tidak terpenuhi', neg ? '#b91c1c' : '#15803d') + kpi('ED ≤ 30 hari', n0(ed), 'ctn mendekati kadaluarsa', ed ? '#b45309' : '#15803d') + '</div>'
      + '<div class="note" style="padding:0 0 6px">Susunan kolom sama dengan Excel <b>STOK DCF</b>. <b>STOK DC HARI INI</b> = stok Takaki (' + fd(snap) + ') + inbound tiba − PB per tanggal. Minggu berjalan & depan memakai PB web, sesudahnya rata-rata 4 minggu terakhir. Klik baris untuk detail ED.</div>'
      + '<div style="overflow:auto;max-height:72vh"><table id="stT" style="border-collapse:collapse"><thead><tr>'
      + th('PLU DC', BG.gr, ';left:0;z-index:4;min-width:72px') .replace('<th ', '<th rowspan="2" ') + th('DESCRIPTION', BG.gr, ';left:72px;z-index:4').replace('<th ', '<th rowspan="2" ')
      + th('STOK DCF ' + fd(snap), BG.y, '', TH).replace('<th ', '<th colspan="' + (4 + dA.length) + '" ')
      + th('STOK DC<br>HARI INI', BG.g, ';font-weight:bold', TH).replace('<th ', '<th rowspan="2" ')
      + th('STOK AKH TGL ' + fd(eowN), BG.y, '', TH).replace('<th ', '<th colspan="2" ')
      + th('ED STOK TAKAKI ' + fd(snap), BG.o, '', TH).replace('<th ', '<th colspan="' + lab.length + '" ')
      + th('ED STOK AKH TGL ' + fd(eowN), BG.o, '', TH).replace('<th ', '<th colspan="' + lab.length + '" ')
      + th('REKAP OUTBOUND PER WEEK (PB WEB)', BG.b, '', TH).replace('<th ', '<th colspan="' + (wkAll.length + 1) + '" ')
      + th('DSI (STOK ÷ SPD SALES)', BG.p, '', TH).replace('<th ', '<th colspan="3" ')
      + th('PO ON GOING (BELUM TIBA)', BG.g, '', TH).replace('<th ', '<th colspan="' + (dOn.length + 4) + '" ') + '</tr><tr>'
      + th('QTY STK', BG.y, '', TH2) + th('PB<br>' + rng(addD(snap, 1), eowC), BG.y, '', TH2) + th('SISA<br>STOK', BG.y, '', TH2)
      + dA.map(d => th('INBOUND<br>' + fd(d), BG.y, '', TH2)).join('') + th('TTL STOK<br>' + fd(eowC), BG.y, '', TH2)
      + th('OUTB<br>' + rng(nxt, eowN), BG.y, '', TH2) + th('STOK AKH<br>' + fd(eowN), BG.y, '', TH2)
      + lab.map(l => th(l, BG.o, '', TH2)).join('') + lab.map(l => th(l, BG.o, '', TH2)).join('')
      + wkAll.map(w => th(rng(w, addD(w, 5)) + (w > cur ? '<br>(plan)' : ''), BG.b, '', TH2)).join('') + th('AVG PB', BG.b, '', TH2)
      + th('SPD<br>SALES', BG.p, '', TH2) + th('DSI<br>AWAL', BG.p, '', TH2) + th('DSI<br>AKHIR', BG.p, '', TH2)
      + dOn.map(d => th(fd(d), BG.g, '', TH2)).join('') + th('TOTAL', BG.g, '', TH2) + th('STK AKH', BG.g, '', TH2) + th('EST PB<br>2 MGG', BG.g, '', TH2) + th('SISA STK', BG.g, '', TH2) + '</tr></thead><tbody>';
    const red = v => v < 0 ? ';color:#b91c1c;font-weight:bold' : '', T = [];
    R.forEach((r, n) => {
      const eb = edBuckets(r, months), bg = n % 2 ? '#fafbff' : '#fff';
      const wv = wkAll.map(w => (r.wk.find(x => x[0] === w) || [0, null])[1]);
      h += '<tr data-p="' + r.plu + '" style="background:' + bg + ';cursor:pointer"><td style="' + TDL + ';text-align:left">' + r.plu + '</td><td style="' + TDL + ';left:72px"><b>' + E(r.it.nama_po || r.it.deskripsi) + '</b></td>'
        + '<td style="' + TD + '">' + n0(r.s0) + '</td><td style="' + TD + '">' + n0(r.pbRest) + '</td><td style="' + TD + '">' + n0(r.sisa) + '</td>'
        + r.dArr.map(d => '<td style="' + TD + '">' + (r.arr[d] ? n0(r.arr[d]) : '-') + '</td>').join('')
        + '<td style="' + TD + '">' + n0(r.ttl) + '</td>'
        + '<td style="' + TD + ';background:' + BG.g + ';font-weight:bold' + red(r.now) + '">' + n0(r.now) + '</td>'
        + '<td style="' + TD + '">' + n0(r.outbN) + '</td><td style="' + TD + red(r.akh) + '">' + n0(r.akh) + '</td>'
        + eb.base.map(v => '<td style="' + TD + '">' + (v ? n0(v) : '-') + '</td>').join('') + eb.after.map(v => '<td style="' + TD + '">' + (v ? n0(v) : '-') + '</td>').join('')
        + wv.map(v => '<td style="' + TD + '">' + (v == null ? '-' : n0(v)) + '</td>').join('') + '<td style="' + TD + ';font-weight:bold">' + n0(r.avg) + '</td>'
        + '<td style="' + TD + '">' + n0(r.spd) + '</td><td style="' + TD + (r.dsiA != null && r.dsiA < 14 ? ';color:#b91c1c;font-weight:bold' : '') + '">' + dsx(r.dsiA) + '</td><td style="' + TD + '">' + dsx(r.dsiB) + '</td>'
        + dOn.map(d => '<td style="' + TD + (d < X.today ? ';color:#b91c1c' : '') + '">' + (r.ongRaw[d] ? n0(r.ongRaw[d]) : '-') + '</td>').join('')
        + '<td style="' + TD + '">' + (r.ongo ? n0(r.ongo) : '-') + '</td><td style="' + TD + '">' + n0(r.stkAkh) + '</td><td style="' + TD + '">' + n0(r.estPb) + '</td><td style="' + TD + '">' + n0(r.sisaStk) + '</td></tr>';
    });
    // Grand Total
    const tt = (v, b) => '<td style="' + TD + ';font-weight:bold;background:#eef0fb">' + (b ? v : n0(v)) + '</td>', ebs = R.map(r => edBuckets(r, months));
    h += '<tr><td style="' + TDL + ';background:#eef0fb;font-weight:bold" colspan="2">Grand Total</td>' + tt(sum(r => r.s0)) + tt(sum(r => r.pbRest)) + tt(sum(r => r.sisa))
      + dA.map(d => tt(sum(r => r.arr[d]))).join('') + tt(sum(r => r.ttl)) + tt(sum(r => r.now)) + tt(sum(r => r.outbN)) + tt(sum(r => r.akh))
      + lab.map((l, i) => tt(ebs.reduce((t, e) => t + e.base[i], 0))).join('') + lab.map((l, i) => tt(ebs.reduce((t, e) => t + e.after[i], 0))).join('')
      + wkAll.map(w => tt(sum(r => (r.wk.find(x => x[0] === w) || [0, 0])[1]))).join('') + tt(sum(r => r.avg)) + tt(sum(r => r.spd)) + tt('', 1) + tt('', 1)
      + dOn.map(d => tt(sum(r => r.ongRaw[d]))).join('') + tt(sum(r => r.ongo)) + tt(sum(r => r.stkAkh)) + tt(sum(r => r.estPb)) + tt(sum(r => r.sisaStk)) + '</tr>';
    Q('#dcfBody').innerHTML = h + '</tbody></table></div></div>';
    Q('#stT tbody').onclick = e => { const tr = e.target.closest('tr[data-p]'); if (tr) showED(tr.dataset.p); };
  }
  function showED(plu) {
    const r = X.rows.find(x => x.plu === plu); if (!r) return;
    const b = r.bs.filter(x => Number(x.stok) > 0).sort((x, y) => (x.tgl_exp || '') < (y.tgl_exp || '') ? -1 : 1);
    const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = '<div style="background:#fff;border-radius:14px;padding:16px;max-width:520px;width:100%;max-height:80vh;overflow:auto"><div style="display:flex;justify-content:space-between;align-items:center"><b>' + E(r.it.deskripsi) + '</b><button class="b s">Tutup</button></div><div class="note" style="padding:4px 0 8px">Outbound mingguan (PB web): ' + (r.wk.map(w => rng(w[0], addD(w[0], 5)) + ' = ' + n0(w[1])).join(' · ') || '-') + '<br>SPD sales ' + n1(r.spd) + ' ctn/hari</div><table style="border-collapse:collapse;width:100%"><thead><tr><th style="' + TH + '">INBOUND</th><th style="' + TH + '">EXP</th><th style="' + TH + '">SISA HARI</th><th style="' + TH + '">STOK</th></tr></thead><tbody>'
      + (b.map(x => { const h = Math.round((pd(x.tgl_exp) - pd(X.today)) / 864e5); return '<tr><td style="' + TD + ';text-align:center">' + fd(x.tgl_inbound) + '</td><td style="' + TD + '">' + fd(x.tgl_exp) + '</td><td style="' + TD + (h <= 30 ? ';color:#b45309;font-weight:bold' : '') + '">' + h + '</td><td style="' + TD + '">' + n0(x.stok) + '</td></tr>'; }).join('') || '<tr><td colspan="4" class="note">Tidak ada batch.</td></tr>') + '</tbody></table></div>';
    document.body.appendChild(ov); ov.onclick = e => { if (e.target === ov || e.target.tagName === 'BUTTON') ov.remove(); };
  }

  // ===== Order Takaki (mengikuti sheet PO TAKAKI) =====
  function paintOrder() {
    if (!X.po) initPO(); else calcOrder();
    const p = X.po, rows = X.rows.filter(r => r.it.aktif), T = acuanOf(p), n = p.pos.length;
    let h = '<div class="card" style="margin-top:12px"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">'
      + '<div><label class="k">Tanggal PO</label><input type="date" class="in" id="poT" value="' + p.tgl_po + '" style="width:150px"></div>'
      + '<div><label class="k">Acuan stok & DSI (tgl)</label><input type="date" class="in" id="poA" value="' + T + '" style="width:150px"></div>'
      + '<div><label class="k">Target DSI (hari)</label><input type="number" class="in" id="poD" value="' + X.cfg.target + '" style="width:90px"></div>'
      + '<div><label class="k">Tiba (hari setelah kirim)</label><input type="number" class="in" id="poL" value="' + X.cfg.lead + '" style="width:90px"></div>'
      + '<button class="b s" id="poAdd">+ PO</button><button class="b p" id="poAuto">Susun otomatis</button></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' + p.pos.map((o, k) => '<div style="border:1px solid var(--bd);border-radius:10px;padding:6px 8px;display:flex;gap:6px;align-items:center;font-size:12px"><b>PO ' + (k + 1) + '</b> kirim <input type="date" class="in" data-pd="' + k + '" value="' + o.date + '" style="width:140px;padding:3px 5px"> <select class="in" data-pv="' + k + '" style="width:auto;padding:3px 5px">' + VEH.map(v => '<option' + (v === o.veh ? ' selected' : '') + '>' + v + '</option>').join('') + '</select><span class="note" style="padding:0">tiba ±' + fd(etaOf(o.date)) + '</span><button class="b s" data-px="' + k + '" style="padding:2px 7px">×</button></div>').join('') + '</div>'
      + '<div class="kpis" id="poK" style="margin-top:10px"></div>'
      + '<div class="note" style="padding:0 0 6px">Total tiap PO disesuaikan <b>kapasitas kendaraan</b>. Isi per item dihitung agar DSI antar item sama (stok est. ' + fd(T) + ' ÷ SPD sales), minimal target ' + X.cfg.target + ' hari, dibulatkan pallet (' + (rows[0] ? rows[0].P : 77) + ' ctn). Kolom CTN bisa diedit manual.</div>'
      + '<div style="overflow:auto;max-height:68vh"><table id="poTb" style="border-collapse:collapse"><thead><tr>'
      + th('PLU_DC', '#fff', ';left:0;z-index:4;min-width:72px').replace('<th ', '<th rowspan="2" ') + th('DESCRIPTION', '#fff', ';left:72px;z-index:4').replace('<th ', '<th rowspan="2" ') + th('FRC', '#fff').replace('<th ', '<th rowspan="2" ')
      + th('EST. STOCK<br>AKHIR DCF<br>' + fd(T), BG.y, ';font-weight:bold').replace('<th ', '<th rowspan="2" ') + th('SPD<br>CTN', BG.b).replace('<th ', '<th rowspan="2" ') + th('REKO-<br>MENDASI', BG.p).replace('<th ', '<th rowspan="2" ')
      + p.pos.map((o, k) => th('PO ' + (k + 1) + ' (kirim ' + fdl(o.date) + ')<br><span style="font-weight:normal">' + o.veh + ' · ' + n0(cap(o.veh)) + ' ctn</span>', BG.y).replace('<th ', '<th colspan="3" ')).join('')
      + th('DSI DCF', BG.y).replace('<th ', '<th colspan="2" ') + '</tr><tr>'
      + p.pos.map(() => th('PALLET', BG.y, '', TH2) + th('CTN', BG.y, '', TH2) + th('PCS', BG.y, '', TH2)).join('') + th('AWAL', BG.y, '', TH2) + th('AKHIR', BG.y, '', TH2) + '</tr></thead><tbody>';
    rows.forEach((r, i) => {
      h += '<tr data-p="' + r.plu + '" style="background:#fff"><td style="' + TDL + ';text-align:left;min-width:72px;' + (r.it.sorot ? 'background:' + BG.y : '') + '">' + r.plu + '</td><td style="' + TDL + ';left:72px;' + (r.it.sorot ? 'background:' + BG.y : '') + '">' + E(r.it.nama_po || r.it.deskripsi) + '<div class="ct" style="font-size:10.5px;white-space:normal"></div></td>'
        + '<td style="' + TD + '">' + r.it.frc + '</td><td style="' + TD + (r.stockT <= 0 ? ';color:#b91c1c;font-weight:bold' : '') + '">' + n0(r.stockT) + '</td><td style="' + TD + ';background:' + BG.b + '">' + n0(r.spd) + '</td><td style="' + TD + ';color:#4338ca">' + (r.need ? n0(r.need) : '-') + '</td>'
        + p.pos.map((o, k) => '<td class="pl' + k + '" style="' + TD + '"></td><td style="' + TD + ';padding:2px 3px"><input type="number" min="0" class="in" data-c="' + k + '" value="' + (cellQ(r, k) || '') + '" style="width:64px;text-align:right;padding:3px 5px"></td><td class="pc' + k + '" style="' + TD + '"></td>').join('')
        + '<td class="da" style="' + TD + '"></td><td class="db" style="' + TD + '"></td></tr>';
    });
    h += '</tbody><tfoot id="poFoot"></tfoot></table></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><input class="in" id="poN" placeholder="Catatan PO (opsional)" value="' + E(p.catatan) + '" style="max-width:320px"><button class="b p" id="poSv">Simpan PO</button><button class="b s" id="poXl">Unduh Excel PO Takaki</button></div><div id="poHist" style="margin-top:14px"></div></div>';
    Q('#dcfBody').innerHTML = h;
    const B = Q('#dcfBody'); B.querySelectorAll('tr[data-p]').forEach(refreshRow); refreshFoot();
    B.onchange = e => {
      const t = e.target, d = t.dataset;
      if (d.c != null) { const tr = t.closest('tr'), pl = tr.dataset.p; (p.cells[pl] || (p.cells[pl] = {}))[d.c] = Number(t.value) || 0; p.manual[pl] = true; refreshRow(tr); refreshFoot(); }
      else if (d.pd != null) { const v = t.value; if (!v || p.pos.some((o, k) => k !== Number(d.pd) && o.date === v)) { msg('Tanggal kirim harus unik', true); paintOrder(); return; } p.pos[d.pd].date = v; paintOrder(); }
      else if (d.pv != null) { p.pos[d.pv].veh = t.value; allocate(); paintOrder(); }
      else if (t.id === 'poT') p.tgl_po = t.value; else if (t.id === 'poN') p.catatan = t.value;
      else if (t.id === 'poA') { p.acuan = t.value || null; calcOrder(); allocate(); paintOrder(); }
      else if (t.id === 'poD') { const v = Number(t.value); if (v > 0) { X.cfg.target = v; sbc().from('settings').upsert({ key: 'dcf_target_dsi', value: v }).then(() => { }); calcOrder(); suggestPOs(); calcOrder(); allocate(); paintOrder(); } }
      else if (t.id === 'poL') { const v = Number(t.value); if (v >= 0 && v < 15) { X.cfg.lead = v; sbc().from('settings').upsert({ key: 'dcf_lead_tiba', value: v }).then(() => { }); p.acuan = null; calcOrder(); allocate(); paintOrder(); } }
    };
    B.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'poAdd') { const last = p.pos.map(o => o.date).sort().pop() || addD(monOf(X.today), 14); p.pos.push({ date: newDate(p, addD(last, 1)), veh: 'TRONTON' }); p.acuan = null; calcOrder(); allocate(); paintOrder(); }
      else if (b.id === 'poAuto') { p.acuan = null; calcOrder(); suggestPOs(); calcOrder(); allocate(); paintOrder(); msg('PO disusun ulang sesuai kebutuhan & kapasitas'); }
      else if (b.dataset.px != null) { p.pos.splice(Number(b.dataset.px), 1); p.acuan = null; calcOrder(); allocate(); paintOrder(); }
      else if (b.id === 'poSv') savePO(); else if (b.id === 'poXl') exportXlsx();
    };
    loadPOList();
  }
  function refreshRow(tr) {
    const r = X.rows.find(x => x.plu === tr.dataset.p), p = X.po, q = totQ(r);
    p.pos.forEach((o, k) => { const c = cellQ(r, k); Q('.pl' + k, tr).textContent = c ? n1(c / r.P) : '-'; Q('.pc' + k, tr).textContent = c ? n0(c * r.it.frc) : '-'; });
    Q('.da', tr).textContent = r.spd > 0 ? n0(r.stockT / r.spd) : '-'; Q('.db', tr).textContent = r.spd > 0 ? n0((r.stockT + q) / r.spd) : '-';
    const c = []; if (r.minPre < 0) c.push('<span style="color:#b91c1c">⚠ stok habis sebelum PO tiba</span>'); if (r.edRisk) c.push('<span style="color:#b45309">ED ≤30hr: ' + n0(r.edRisk) + '</span>'); Q('.ct', tr).innerHTML = c.join(' · ');
  }
  function refreshFoot() {
    const p = X.po, rows = X.rows.filter(r => r.it.aktif), n = p.pos.length, qk = p.pos.map((o, k) => rows.reduce((t, r) => t + cellQ(r, k), 0));
    const sT = rows.reduce((t, r) => t + r.stockT, 0), sS = rows.reduce((t, r) => t + r.spd, 0), qa = qk.reduce((a, b) => a + b, 0), val = rows.reduce((t, r) => t + totQ(r) * r.it.frc * r.it.hpp, 0);
    const td = (v, bg, w) => '<td style="' + TD + ';font-weight:bold;background:' + (bg || '#fff') + (w || '') + '">' + v + '</td>';
    let f = '<tr><td style="' + TDL + ';font-weight:bold" colspan="3">Grand Total</td>' + td(n0(sT), BG.y) + td(n0(sS), BG.b) + td(n0(p.recTot), BG.p)
      + qk.map((q, k) => td(n1(q / 77), BG.y) + td(n0(q), BG.y) + td(n0(rows.reduce((t, r) => t + cellQ(r, k) * r.it.frc, 0)), '#fff')).join('') + td(sS ? n0(sT / sS) : '-', BG.y) + td(sS ? n0((sT + qa) / sS) : '-', BG.y) + '</tr>';
    f += '<tr><td colspan="3" style="' + TD + ';text-align:center">AVERAGE STOCK DCF</td><td style="' + TD + ';font-weight:bold">' + n0(rows.length ? sT / rows.length : 0) + ' CTN</td></tr>';
    f += '<tr><td colspan="6" style="' + TD + ';text-align:left;font-weight:bold;padding-top:12px">Tonase Kendaraan :</td>' + p.pos.map(() => '<td colspan="3"></td>').join('') + '</tr>';
    VEH.forEach(v => { f += '<tr><td colspan="3" style="' + TD + ';background:' + BG.o + ';font-weight:bold">' + n0(cap(v)) + ' &nbsp; ' + v + '</td><td colspan="3" style="' + TD + '"></td>' + p.pos.map((o, k) => '<td colspan="3" style="' + TD + ';text-align:center;' + (o.veh === v ? 'font-weight:bold;font-size:14px' : 'color:#94a3b8') + '">' + n0(cap(v)) + '</td>').join('') + '</tr>'; });
    f += '<tr><td colspan="6" style="' + TD + ';text-align:left">Total PO vs kapasitas:</td>' + p.pos.map((o, k) => { const c = cap(o.veh), d = qk[k] - c, ok = d === 0; return '<td colspan="3" style="' + TD + ';text-align:center;font-weight:bold;color:' + (ok ? '#15803d' : d > 0 ? '#b91c1c' : '#b45309') + '">' + (ok ? '✓ penuh' : d > 0 ? 'lebih ' + n0(d) : 'kurang ' + n0(-d)) + '</td>'; }).join('') + '</tr>';
    Q('#poFoot').innerHTML = f;
    const low = rows.filter(r => r.minPre < 0).length;
    Q('#poK').innerHTML = kpi('Kebutuhan (target DSI ' + X.cfg.target + ')', n0(p.recTot), 'ctn') + kpi('Total PO diisi', n0(qa), 'ctn · ' + n1(qa / 77) + ' pallet · kapasitas ' + n0(p.pos.reduce((t, o) => t + cap(o.veh), 0))) + kpi('Nilai PO', 'Rp ' + n0(val), 'HPP inc PPN') + kpi('Item berisiko habis', low, 'sebelum PO tiba', low ? '#b91c1c' : '#15803d');
  }
  async function savePO() {
    const p = X.po, s = sbc(), b = Q('#poSv'); if (!p.pos.length) { msg('Belum ada PO (tambahkan kendaraan)', true); return; } b.disabled = true;
    try {
      const head = { tgl_po: p.tgl_po, kirim_mulai: p.pos.map(o => o.date).sort()[0], kirim_selesai: p.pos.map(o => o.date).sort().pop(), target_dsi: X.cfg.target, tgl_kirim: p.pos.map(o => o.date), kendaraan: p.pos.map(o => o.veh), tgl_acuan: acuanOf(p), catatan: p.catatan || null, dibuat_oleh: ((gD() || {}).user || {}).name || null };
      let id = p.id;
      if (id) must(await s.from('dcf_po').update(head).eq('id', id)); else { id = must(await s.from('dcf_po').insert(head).select('id').single()).id; p.id = id; }
      must(await s.from('dcf_po_line').delete().eq('po_id', id));
      const lines = []; X.rows.forEach(r => p.pos.forEach((o, k) => { const q = cellQ(r, k); if (q > 0) lines.push({ po_id: id, plu_dc: r.plu, tgl_kirim: o.date, qty: q }); }));
      if (lines.length) must(await s.from('dcf_po_line').insert(lines));
      msg('PO tersimpan (' + lines.length + ' baris)'); loadPOList();
    } catch (e) { msg('Gagal menyimpan PO: ' + e.message, true); }
    b.disabled = false;
  }
  async function loadPOList() {
    const h = Q('#poHist'); if (!h) return;
    try {
      X.pos = must(await sbc().from('dcf_po').select('*').order('id', { ascending: false }).limit(15));
      h.innerHTML = '<b style="color:var(--br)">PO tersimpan</b>' + (X.pos.length ? '<div style="overflow:auto"><table style="border-collapse:collapse;width:100%;margin-top:6px"><tbody>' + X.pos.map(o => '<tr><td style="' + TD + ';text-align:left">#' + o.id + ' · PO ' + fd(o.tgl_po) + '</td><td style="' + TD + ';text-align:left">kirim ' + (o.tgl_kirim || []).map(fd).join(', ') + '</td><td style="' + TD + ';text-align:left">' + E(o.status) + (o.catatan ? ' · ' + E(o.catatan) : '') + '</td><td style="' + TD + '"><button class="b s" data-o="open" data-i="' + o.id + '">Buka</button> <button class="b s" data-o="ong" data-i="' + o.id + '">Jadikan PO on going</button> <button class="b s" data-o="del" data-i="' + o.id + '">Hapus</button></td></tr>').join('') + '</tbody></table></div>' : '<div class="note">Belum ada.</div>');
      h.onclick = e => { const b = e.target.closest('button[data-o]'); if (b) poAct(b.dataset.o, Number(b.dataset.i)); };
    } catch (e) { h.innerHTML = '<div class="note wn">' + E(e.message) + '</div>'; }
  }
  async function poAct(a, id) {
    const s = sbc(), o = X.pos.find(x => x.id === id); if (!o) return;
    try {
      if (a === 'open') {
        const ls = must(await s.from('dcf_po_line').select('*').eq('po_id', id)), dates = o.tgl_kirim || [], cells = {};
        X.rows.forEach(r => cells[r.plu] = {}); ls.forEach(l => { const k = dates.indexOf(l.tgl_kirim); if (k >= 0 && cells[l.plu_dc]) cells[l.plu_dc][k] = Number(l.qty); });
        X.po = { id, tgl_po: o.tgl_po, acuan: o.tgl_acuan, pos: dates.map((d, k) => ({ date: d, veh: (o.kendaraan || [])[k] || 'TRONTON' })), cells, manual: {}, catatan: o.catatan || '', recTot: 0 }; paintOrder(); msg('PO #' + id + ' dibuka');
      } else if (a === 'ong') {
        pbDo('Jadikan PO #' + id + ' sebagai PO on going?\nBarang dianggap tiba ' + X.cfg.lead + ' hari setelah tanggal kirim; Anda menandai tiba di tab "PO On Going / Tiba".', async () => {
          const ls = must(await s.from('dcf_po_line').select('*').eq('po_id', id));
          must(await s.from('dcf_inbound').delete().eq('po_id', id));
          if (ls.length) must(await s.from('dcf_inbound').insert(ls.map(l => ({ tgl: etaOf(l.tgl_kirim), plu_dc: l.plu_dc, qty: l.qty, sumber: 'PO', po_id: id, tiba: false }))));
          must(await s.from('dcf_po').update({ status: 'ON GOING' }).eq('id', id)); msg('PO #' + id + ' masuk PO on going'); await start(true);
        });
      } else if (a === 'del') {
        pbDo('Hapus PO #' + id + '? Inbound dari PO ini ikut dihapus.', async () => { must(await s.from('dcf_inbound').delete().eq('po_id', id)); must(await s.from('dcf_po').delete().eq('id', id)); if (X.po && X.po.id === id) X.po.id = null; msg('PO dihapus'); await start(true); });
      }
    } catch (e) { msg(e.message, true); }
  }
  function pbDo(text, fn) { if (window.pbConfirm) window.pbConfirm(text, () => fn().catch(e => msg(e.message, true))); else if (confirm(text)) fn().catch(e => msg(e.message, true)); }

  // ===== PO On Going / Tiba =====
  function paintInb() {
    const R = X.rows.filter(r => r.it.aktif);
    const dOn = [...new Set([...X.inb.filter(x => !x.tiba).map(x => x.tgl), ...X.extraOn])].sort();
    const dAr = [...new Set([...X.inb.filter(x => x.tiba).map(x => x.tgl_tiba || x.tgl), ...X.extraAr])].filter(d => d >= X.cfg.inboundDari).sort();
    const mat = (title, note, ds, ongoing) => '<div class="card" style="margin-top:12px"><h3 style="margin:0 0 4px;color:var(--br)">' + title + '</h3><div class="note" style="padding:0 0 6px">' + note + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:6px"><div><label class="k">Tambah kolom tanggal</label><input type="date" class="in" data-add="' + (ongoing ? 'on' : 'ar') + '" style="width:150px"></div>'
      + (ongoing ? '<div><label class="k">Tanggal tiba (untuk tombol Tiba)</label><input type="date" class="in" id="ibT" value="' + X.tibaTgl + '" style="width:150px"></div>' : '') + '</div>'
      + '<div style="overflow:auto;max-height:50vh"><table style="border-collapse:collapse"><thead><tr><th style="' + TH + ';background:' + BG.gr + ';left:0;z-index:4">DESCRIPTION</th>'
      + ds.map(d => '<th style="' + TH + ';background:' + (ongoing ? BG.g : BG.y) + '">' + fdd(d) + (ongoing ? (d < X.today ? '<div style="color:#b91c1c;font-size:10px">terlambat</div>' : '') + '<br><button class="b s" data-tiba="' + d + '" style="padding:2px 8px;font-size:11px">Tandai tiba</button>' : '') + '</th>').join('') + '</tr></thead><tbody>'
      + R.map((r, n) => '<tr data-p="' + r.plu + '" style="background:' + (n % 2 ? '#fafbff' : '#fff') + '"><td style="' + TDL + '"><b>' + E(r.it.nama_po || r.it.deskripsi) + '</b></td>' + ds.map(d => { const v = ongoing ? r.ongRaw[d] : r.arr[d]; return '<td style="' + TD + ';padding:2px 3px"><input type="number" min="0" class="in" data-d="' + d + '" data-on="' + (ongoing ? 1 : 0) + '" value="' + (v || '') + '" style="width:70px;text-align:right;padding:3px 5px"></td>'; }).join('') + '</tr>').join('')
      + '</tbody></table></div></div>';
    Q('#dcfBody').innerHTML = mat('PO On Going (belum tiba)', 'Estimasi tiba = tanggal kirim + ' + X.cfg.lead + ' hari. Ikut menghitung proyeksi stok & rekomendasi order, tapi belum menambah stok DC. Klik <b>Tandai tiba</b> bila barang sudah sampai.', dOn, true)
      + mat('Sudah Tiba (inbound)', 'Inbound yang sudah diterima — menambah stok DC sejak ' + fd(X.cfg.inboundDari) + '. Isi qty dalam CTN.', dAr, false);
    const B = Q('#dcfBody');
    B.onchange = async e => {
      const t = e.target; if (t.dataset.add) { if (t.value) { (t.dataset.add === 'on' ? X.extraOn : X.extraAr).push(t.value); paintInb(); } return; }
      if (t.id === 'ibT') { X.tibaTgl = t.value || X.today; return; }
      if (!t.dataset.d) return; const plu = t.closest('tr').dataset.p, d = t.dataset.d, on = t.dataset.on === '1', q = Number(t.value) || 0;
      try {
        const tb = !on, col = tb ? 'tgl_tiba' : 'tgl';
        const rows = X.inb.filter(x => x.plu_dc === plu && !!x.tiba === tb && (tb ? (x.tgl_tiba || x.tgl) : x.tgl) === d).map(x => x.id);
        if (rows.length) must(await sbc().from('dcf_inbound').delete().in('id', rows));
        if (q > 0) must(await sbc().from('dcf_inbound').insert({ tgl: d, tgl_tiba: tb ? d : null, plu_dc: plu, qty: q, sumber: 'MANUAL', tiba: tb }));
        msg('Tersimpan'); await reloadInb();
      } catch (er) { msg('Gagal menyimpan: ' + er.message, true); }
    };
    B.onclick = async e => {
      const b = e.target.closest('button[data-tiba]'); if (!b) return; const d = b.dataset.tiba, tg = X.tibaTgl || X.today;
      pbDo('Tandai semua kiriman tanggal ' + fd(d) + ' sebagai TIBA pada ' + fd(tg) + '?', async () => {
        must(await sbc().from('dcf_inbound').update({ tiba: true, tgl_tiba: tg }).eq('tiba', false).eq('tgl', d));
        const ids = [...new Set(X.inb.filter(x => !x.tiba && x.tgl === d && x.po_id).map(x => x.po_id))];
        for (const id of ids) { const left = must(await sbc().from('dcf_inbound').select('id').eq('po_id', id).eq('tiba', false)); if (!left.length) await sbc().from('dcf_po').update({ status: 'TIBA' }).eq('id', id); }
        msg('Ditandai tiba'); await reloadInb();
      });
    };
  }
  async function reloadInb() { X.inb = must(await sbc().from('dcf_inbound').select('*').gte('tgl', addD(X.cfg.inboundDari, -1)).order('tgl').limit(5000)); paint(); }

  // ===== Data & Pengaturan =====
  function paintData() {
    let h = '<div class="card" style="margin-top:12px"><h3 style="margin:0 0 6px;color:var(--br)">Unggah stok Takaki</h3><div class="note" style="padding:0 0 8px">Pilih file <b>Monitoring Stock Takaki DCF SBY (.xlsx)</b>. Yang dibaca hanya sheet <b>data ED</b> (tanggal di B2, PLU_CUST kolom A, stok kolom C, inbound kolom J, ED kolom K). Data stok lama diganti.</div>'
      + '<input type="file" id="dcfF" accept=".xlsx"> <span id="dcfFs" class="note"></span><div class="note" style="padding:8px 0 0">Data saat ini: ' + (X.snap ? n0(X.batches.length) + ' batch per ' + fdd(X.snap) : 'kosong') + '</div></div>'
      + '<div class="card" style="margin-top:12px"><h3 style="margin:0 0 6px;color:var(--br)">Pengaturan</h3><div style="display:flex;gap:12px;flex-wrap:wrap">'
      + '<div><label class="k">Target DSI global (hari)</label><input type="number" class="in" id="cfT" value="' + X.cfg.target + '" style="width:110px"></div>'
      + '<div><label class="k">Sisa ≥ x% pallet dibulatkan naik</label><input type="number" class="in" id="cfR" value="' + Math.round(X.cfg.round * 100) + '" style="width:110px"></div>'
      + '<div><label class="k">Tiba (hari setelah kirim)</label><input type="number" class="in" id="cfL" value="' + X.cfg.lead + '" style="width:110px"></div>'
      + '<div><label class="k">Hitung inbound sejak</label><input type="date" class="in" id="cfI" value="' + X.cfg.inboundDari + '" style="width:150px"></div>'
      + VEH.map(v => '<div><label class="k">Kapasitas ' + v + ' (ctn)</label><input type="number" class="in" data-kv="' + v + '" value="' + cap(v) + '" style="width:110px"></div>').join('') + '</div></div>'
      + '<div class="card" style="margin-top:12px"><h3 style="margin:0 0 6px;color:var(--br)">Master item DCF</h3><div class="note" style="padding:0 0 6px">Nama PO dipakai di Excel PO Takaki. Target DSI kosong = target global. HPP per pcs (inc PPN). Sorot = diberi warna kuning di Excel PO. Item non-aktif tidak ikut stok & order.</div><div style="overflow:auto"><table style="border-collapse:collapse"><thead><tr>'
      + ['ITEM', 'PLU DC', 'NAMA DI PO', 'PLU PO', 'PLU CUST', 'FRC', 'HPP', 'CTN/PALLET', 'TARGET DSI', 'SOROT', 'AKTIF'].map(t => '<th style="' + TH + ';background:' + BG.gr + '">' + t + '</th>').join('') + '</tr></thead><tbody>'
      + X.items.map((i, n) => '<tr data-p="' + i.plu_dc + '" style="background:' + (n % 2 ? '#fafbff' : '#fff') + '"><td style="' + TD + ';text-align:left"><b>' + E(i.deskripsi) + '</b></td><td style="' + TD + '">' + i.plu_dc + '</td>'
        + ['nama_po', 'plu_po', 'plu_cust'].map(k => '<td style="' + TD + '"><input class="in" data-k="' + k + '" value="' + E(i[k] || '') + '" style="width:150px"></td>').join('')
        + ['frc', 'hpp', 'pallet_ctn', 'target_dsi'].map(k => '<td style="' + TD + '"><input type="number" class="in" data-k="' + k + '" value="' + (i[k] == null ? '' : i[k]) + '" style="width:80px;text-align:right"></td>').join('')
        + ['sorot', 'aktif'].map(k => '<td style="' + TD + '"><input type="checkbox" data-k="' + k + '"' + (i[k] ? ' checked' : '') + '></td>').join('') + '</tr>').join('') + '</tbody></table></div></div>';
    Q('#dcfBody').innerHTML = h; Q('#dcfF').onchange = e => uploadXlsx(e.target.files[0]);
    const setCfg = (key, val, f) => sbc().from('settings').upsert({ key, value: val }).then(r => { if (r.error) msg('Gagal menyimpan pengaturan', true); else { f(); msg('Pengaturan disimpan'); X.po = null; } });
    Q('#cfT').onchange = e => { const v = Number(e.target.value); if (v > 0) setCfg('dcf_target_dsi', v, () => X.cfg.target = v); };
    Q('#cfR').onchange = e => { const v = Number(e.target.value) / 100; if (v >= 0 && v <= 1) setCfg('dcf_round_pct', v, () => X.cfg.round = v); };
    Q('#cfL').onchange = e => { const v = Number(e.target.value); if (v >= 0 && v < 15) setCfg('dcf_lead_tiba', v, () => X.cfg.lead = v); };
    Q('#cfI').onchange = e => { if (e.target.value) setCfg('dcf_inbound_dari', e.target.value, () => { X.cfg.inboundDari = e.target.value; start(true); }); };
    Q('#dcfBody').onchange = async e => {
      const t = e.target;
      if (t.dataset.kv) { const v = Number(t.value); if (v > 0) { const k = Object.assign({}, X.cfg.kend, { [t.dataset.kv]: v }); setCfg('dcf_kendaraan', k, () => X.cfg.kend = k); } return; }
      const k = t.dataset.k, tr = t.closest('tr[data-p]'); if (!k || !tr) return;
      let v = t.type === 'checkbox' ? t.checked : t.value.trim(); if (t.type === 'number') v = v === '' ? null : Number(v);
      if ((k === 'frc' || k === 'pallet_ctn') && !(v > 0)) { msg('Nilai harus lebih dari 0', true); return; }
      const r = await sbc().from('dcf_item').update({ [k]: v === '' ? null : v }).eq('plu_dc', tr.dataset.p);
      if (r.error) msg('Gagal menyimpan: ' + r.error.message, true); else { X.items.find(i => i.plu_dc === tr.dataset.p)[k] = v; X.po = null; msg('Tersimpan'); }
    };
  }
  const cv = c => { let v = c && c.value; if (v && typeof v === 'object' && !(v instanceof Date)) v = 'result' in v ? v.result : (v.richText ? v.richText.map(x => x.text).join('') : null); return v; };
  const toISO = v => { if (v instanceof Date) return iso(v); const s = String(v || '').trim(); let m; if ((m = s.match(/^(\d{4})(\d\d)(\d\d)/))) return m[1] + '-' + m[2] + '-' + m[3]; if ((m = s.match(/^(\d{4})-(\d\d)-(\d\d)/))) return m[0]; return null; };
  async function loadEJ() { if (window.ExcelJS) return window.ExcelJS; await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'; s.onload = ok; s.onerror = () => no(new Error('Pustaka Excel gagal dimuat.')); document.head.appendChild(s); }); return window.ExcelJS; }
  async function uploadXlsx(f) {
    const st = Q('#dcfFs'); if (!f) return; st.textContent = 'Membaca file…';
    try {
      const EJ = await loadEJ(), wb = new EJ.Workbook(); await wb.xlsx.load(await f.arrayBuffer());
      const ws = wb.worksheets.find(w => /data\s*ed/i.test(w.name)); if (!ws) throw new Error('Sheet "data ED" tidak ditemukan.');
      const tgl = toISO(cv(ws.getCell('B2'))); if (!tgl) throw new Error('Tanggal di sel B2 sheet data ED tidak terbaca.');
      const rows = [], known = new Set(X.items.map(i => String(i.plu_cust || '').trim())); let skip = 0;
      ws.eachRow((row, rn) => {
        if (rn < 4) return; const pc = String(cv(row.getCell(1)) || '').trim(); if (!pc) return; const stok = Number(cv(row.getCell(3))) || 0;
        const exp = toISO(cv(row.getCell(11))) || toISO(cv(row.getCell(5))), inb = toISO(cv(row.getCell(10))) || toISO(cv(row.getCell(4)));
        if (!known.has(pc)) { skip += stok; return; } rows.push({ tgl_data: tgl, plu_cust: pc, deskripsi: String(cv(row.getCell(2)) || '').trim(), stok, tgl_inbound: inb, tgl_exp: exp });
      });
      if (!rows.length) throw new Error('Tidak ada baris yang cocok dengan master item.');
      const s = sbc(); must(await s.from('dcf_stok_batch').delete().gt('id', 0));
      for (let i = 0; i < rows.length; i += 200) must(await s.from('dcf_stok_batch').insert(rows.slice(i, i + 200)));
      st.textContent = ''; X.po = null; msg(rows.length + ' batch stok per ' + fd(tgl) + ' tersimpan' + (skip ? ' (' + n0(skip) + ' ctn item di luar master diabaikan)' : '')); await start(true);
    } catch (e) { st.textContent = ''; msg('Gagal: ' + e.message, true); }
  }

  // ===== Excel PO TAKAKI (format sama dengan file Anda) =====
  async function exportXlsx() {
    try {
      const EJ = await loadEJ(), wb = new EJ.Workbook(), ws = wb.addWorksheet('PO TAKAKI', { views: [{ showGridLines: false }] });
      const p = X.po, rows = X.rows.filter(r => r.it.aktif), nP = p.pos.length, T = acuanOf(p);
      const col = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
      const c0 = 6, cA = c0 + nP * 3, cB = cA + 1, lastC = cB, R0 = 6, RN = R0 + rows.length - 1, RG = RN + 1;
      const FILL = rgb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rgb } }), YEL = FILL('FFFF00'), BLU = FILL('BDD7EE'), SAL = FILL('FCE4D6');
      const thin = { style: 'thin', color: { argb: 'FF000000' } }, BOX = { top: thin, left: thin, bottom: thin, right: thin };
      const ACC = '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)', ACC1 = '_(* #,##0.0_);_(* (#,##0.0);_(* "-"_);_(@_)';
      const set = (a, v, o) => { const c = ws.getCell(a); c.value = v; if (o) { if (o.f) c.fill = o.f; if (o.b) c.border = o.b; if (o.font) c.font = o.font; if (o.al) c.alignment = o.al; if (o.nf) c.numFmt = o.nf; } return c; };
      const hdr = { font: { bold: true, name: 'Calibri', size: 10 }, al: { horizontal: 'center', vertical: 'middle', wrapText: true }, b: BOX };
      const ptgl = pd(p.tgl_po);
      set('A1', 'PO TAKAKI (U/ DCF SBY)', { font: { bold: true, size: 16, name: 'Calibri' } });
      set('A2', 'Tanggal PO : ' + fdl(p.tgl_po) + " '" + String(ptgl.getUTCFullYear()).slice(2), { font: { italic: true, size: 9, name: 'Calibri' } });
      p.pos.forEach((o, k) => { const c = c0 + k * 3; set(col(c) + '2', 77, { font: { bold: true, size: 12, color: { argb: k < nP - 1 || nP === 1 ? 'FFA6BDD7' : 'FF000000' } }, al: { horizontal: 'center' } }); });
      ws.mergeCells(3, c0, 3, c0 + nP * 3 - 1); set(col(c0) + '3', 'PO TAKAKI', Object.assign({}, hdr, { font: { bold: true, size: 11 } }));
      for (let c = c0; c < c0 + nP * 3; c++) ws.getCell(3, c).border = BOX;
      ws.mergeCells('A4:A5'); ws.mergeCells('B4:B5'); ws.mergeCells('C4:C5');
      set('A4', 'PLU_DC', hdr); set('B4', 'DESCRIPTION', hdr); set('C4', 'FRC', hdr);['A5', 'B5', 'C5'].forEach(a => ws.getCell(a).border = BOX);
      set('D4', 'ASUMSI SISA', { font: { size: 10 }, al: { horizontal: 'center', vertical: 'middle' } });
      set('D5', 'EST. STOCK AKHIR DCF  ' + pd(T).getUTCDate() + ' ' + MONL[pd(T).getUTCMonth()] + ' ' + String(pd(T).getUTCFullYear()).slice(2), Object.assign({}, hdr, { f: YEL }));
      set('E4', 'SPD', Object.assign({}, hdr, { f: BLU })); set('E5', 'CTN', Object.assign({}, hdr, { f: BLU }));
      p.pos.forEach((o, k) => {
        const c = c0 + k * 3; ws.mergeCells(4, c, 4, c + 2); set(col(c) + '4', 'PO ' + (k + 1) + ' (kirim ' + fdl(o.date) + ')', Object.assign({}, hdr, { f: YEL, font: { bold: true, size: 9, color: { argb: 'FF1F3864' } } }));
        for (let i = 0; i < 3; i++) ws.getCell(4, c + i).border = BOX; ['PALLET', 'CTN', 'PCS'].forEach((t, i) => set(col(c + i) + '5', t, Object.assign({}, hdr, { f: YEL })));
      });
      ws.mergeCells(4, cA, 4, cB); set(col(cA) + '4', 'DSI DCF', Object.assign({}, hdr, { f: YEL })); ws.getCell(4, cB).border = BOX; set(col(cA) + '5', 'AWAL', Object.assign({}, hdr, { f: YEL })); set(col(cB) + '5', 'AKHIR', Object.assign({}, hdr, { f: YEL }));
      ws.getRow(5).height = 48; ws.getRow(4).height = 20;
      rows.forEach((r, i) => {
        const n = R0 + i, y = r.it.sorot ? { f: YEL } : {}, ctn = p.pos.map((o, k) => col(c0 + k * 3 + 1) + n);
        set('A' + n, Number(r.plu), Object.assign({ al: { horizontal: 'left' }, font: { size: 10 } }, y)); set('B' + n, r.it.nama_po || r.it.deskripsi, Object.assign({ font: { size: 10 } }, y));
        set('C' + n, Number(r.it.frc), { al: { horizontal: 'center' }, font: { size: 10 } });
        set('D' + n, Math.round(r.stockT), { nf: '#,##0', font: { size: 10 } }); set('E' + n, Math.round(r.spd), { nf: '#,##0', font: { size: 10 } });
        p.pos.forEach((o, k) => { const c = c0 + k * 3, q = cellQ(r, k);
          set(col(c) + n, { formula: 'IFERROR(' + col(c + 1) + n + '/' + col(c) + '$2,0)', result: q / 77 }, { nf: ACC1, font: { size: 10 } });
          set(col(c + 1) + n, q, { nf: ACC, font: { size: 10 } }); set(col(c + 2) + n, { formula: col(c + 1) + n + '*$C' + n, result: q * r.it.frc }, { nf: ACC, font: { size: 10 } }); });
        const tq = totQ(r);
        set(col(cA) + n, { formula: 'IFERROR(D' + n + '/$E' + n + ',0)', result: r.spd > 0 ? r.stockT / r.spd : 0 }, { nf: '0', al: { horizontal: 'center' }, font: { size: 10 } });
        set(col(cB) + n, { formula: 'IFERROR((D' + n + (ctn.length ? '+' + ctn.join('+') : '') + ')/$E' + n + ',0)', result: r.spd > 0 ? (r.stockT + tq) / r.spd : 0 }, { nf: '0', al: { horizontal: 'center' }, font: { size: 10 } });
      });
      const sumF = (c, f) => ({ formula: 'SUM(' + col(c) + R0 + ':' + col(c) + RN + ')' }), gt = { font: { bold: true, size: 10 }, b: BOX };
      ws.mergeCells('A' + RG + ':C' + RG); set('A' + RG, 'Grand Total', gt);['B', 'C'].forEach(c => ws.getCell(c + RG).border = BOX);
      set('D' + RG, sumF(4), Object.assign({}, gt, { f: YEL, nf: '#,##0' })); set('E' + RG, sumF(5), Object.assign({}, gt, { f: BLU, nf: '#,##0' }));
      p.pos.forEach((o, k) => { const c = c0 + k * 3; set(col(c) + RG, sumF(c), Object.assign({}, gt, { nf: '#,##0', al: { horizontal: 'center' } })); set(col(c + 1) + RG, sumF(c + 1), Object.assign({}, gt, { f: YEL, nf: '#,##0', al: { horizontal: 'center' } })); set(col(c + 2) + RG, sumF(c + 2), Object.assign({}, gt, { nf: '#,##0', al: { horizontal: 'center' } })); });
      const allCtn = p.pos.map((o, k) => col(c0 + k * 3 + 1) + RG);
      set(col(cA) + RG, { formula: 'IFERROR(D' + RG + '/E' + RG + ',0)' }, Object.assign({}, gt, { f: YEL, nf: '0', al: { horizontal: 'center' } }));
      set(col(cB) + RG, { formula: 'IFERROR((D' + RG + (allCtn.length ? '+' + allCtn.join('+') : '') + ')/E' + RG + ',0)' }, Object.assign({}, gt, { f: YEL, nf: '0', al: { horizontal: 'center' } }));
      set('B' + (RG + 1), 'AVERAGE STOCK DCF', { al: { horizontal: 'right' }, font: { size: 10 } }); set('D' + (RG + 1), { formula: 'AVERAGE(D' + R0 + ':D' + RN + ')' }, { nf: '#,##0" CTN"', font: { bold: true, size: 10 }, al: { horizontal: 'right' } });
      const RT = RG + 4; set('A' + RT, 'Tonase Kendaraan :', { font: { bold: true, size: 10 } });
      VEH.forEach((v, i) => {
        const n = RT + 1 + i; set('A' + n, cap(v), { f: SAL, nf: '#,##0', font: { bold: true, size: 11 } }); set('B' + n, v, { f: SAL, font: { bold: true, size: 11 } });
        p.pos.forEach((o, k) => set(col(c0 + k * 3 + 1) + n, cap(v), { nf: '#,##0', al: { horizontal: 'center' }, font: o.veh === v ? { bold: true, size: 12 } : { size: 11, color: { argb: 'FF000000' } } }));
      });
      ws.getColumn(1).width = 11; ws.getColumn(2).width = 34; ws.getColumn(3).width = 6; ws.getColumn(4).width = 15; ws.getColumn(5).width = 8;
      for (let c = c0; c < c0 + nP * 3; c++) ws.getColumn(c).width = 9; ws.getColumn(cA).width = 8; ws.getColumn(cB).width = 8;
      ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 5, showGridLines: false }]; ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      const buf = await wb.xlsx.writeBuffer(), name = 'PO TAKAKI ' + p.tgl_po + (nP ? ' kirim ' + p.pos.map(o => o.date).sort()[0] : '') + '.xlsx', blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (window.save) window.save(blob, name); else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
    } catch (e) { msg('Gagal membuat Excel: ' + e.message, true); }
  }

  // ---------------- pemasangan menu ----------------
  async function start(force) {
    const body = Q('#dcfBody'); if (body) body.innerHTML = '<div class="card empty" style="margin-top:12px"><span class="spin"></span><div>Memuat stok DCF…</div></div>';
    try { await loadAll(); if (force) X.po = X.po && X.po.id ? X.po : null; shell(); paint(); } catch (e) { shell(); Q('#dcfBody').innerHTML = '<div class="card empty" style="color:#b00020;margin-top:12px">Gagal memuat: ' + E(e.message) + '</div>'; }
  }
  function mount() {
    const navs = document.querySelectorAll('nav .nb'); if (!navs.length || Q('#nbD')) return;
    const b = document.createElement('button'); b.className = 'nb'; b.id = 'nbD'; b.style.display = 'none';
    b.innerHTML = '<span class="ni"><svg class="ic o" aria-hidden="true"><use href="#i-package"/></svg></span><span class="nt">Stok &amp; Order DCF</span>';
    navs[navs.length - 1].after(b);   // paling belakang
    const v = document.createElement('div'); v.id = 'vDcf'; v.style.display = 'none'; Q('main .wrap').appendChild(v);
    VID.dcf = '#vDcf';
    const av = window.applyView; window.applyView = function (x) { av(x); b.classList.toggle('on', x === 'dcf'); };
    b.onclick = e => { e.stopPropagation(); window.showView('dcf'); if (!X.ready) start(false); else { if (!Q('#dcfSeg')) shell(); paint(); } };
    setInterval(() => { const d = gD(), adm = !!(d && d.user && d.user.admin && gTok()); b.style.display = adm ? '' : 'none'; if (!adm && X.ready) { X.ready = false; X.po = null; } }, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.PBDCF = { shell, paint, start, X, build, sim, stokRow, calcOrder, initPO, allocate, suggestPOs, exportXlsx, paintOrder };
})();
