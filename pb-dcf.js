/* PB SAY BREAD - menu "Stok & Order DCF" (administrator).
   Stok DC = stok Takaki (upload data ED) - outbound PB per tanggal + inbound.  Order Takaki = rekomendasi otomatis (target DSI, rata-rata 4 minggu).
   Semua satuan CTN.  Tabel Supabase: dcf_item, dcf_stok_batch, dcf_inbound, dcf_outbound_hist, dcf_po, dcf_po_line (hanya admin). */
(function () {
  'use strict';
  // ---------- tanggal & angka ----------
  const iso = d => d.toISOString().slice(0, 10);
  const pd = s => new Date(s + 'T00:00:00Z');
  const addD = (s, n) => iso(new Date(pd(s).getTime() + n * 864e5));
  const dow = s => pd(s).getUTCDay();
  const monOf = s => addD(s, -((dow(s) + 6) % 7));
  const todayJ = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'], DAYN = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const fd = s => { if (!s) return ''; const p = pd(s); return String(p.getUTCDate()).padStart(2, '0') + ' ' + MON[p.getUTCMonth()]; };
  const fdd = s => s ? DAYN[dow(s)] + ' ' + fd(s) : '';
  const n0 = v => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  const n1 = v => Number(v || 0).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const Q = (s, r) => (r || document).querySelector(s);
  const sbc = () => window.PBAPI.sb;
  const gTok = () => (typeof TOKEN !== 'undefined' ? TOKEN : null), gD = () => (typeof D !== 'undefined' ? D : null);
  const msg = (m, err) => { if (window.toast) window.toast(m, err); else alert(m); };
  const must = r => { if (r.error) throw new Error(r.error.message); return r.data; };

  // ---------- state ----------
  const X = { tab: 'stok', ready: false, busy: false, items: [], batches: [], inb: [], hist: [], cfg: { target: 30, round: 0.5, inboundDari: '2026-11-07' },
    snap: null, today: todayJ(), outDay: {}, known: {}, weekTot: {}, warn: [], po: null, rows: [], pos: [] };

  // ---------- data ----------
  const apiOut = w => new Promise(ok => window.PBAPI.call('getOutbound', [gTok(), false, w], r => ok(r), () => ok(null)));
  async function loadAll() {
    const s = sbc();
    const st = must(await s.from('settings').select('key,value').in('key', ['dcf_target_dsi', 'dcf_round_pct', 'dcf_inbound_dari']));
    st.forEach(r => { if (r.key === 'dcf_target_dsi') X.cfg.target = Number(r.value) || 30; if (r.key === 'dcf_round_pct') X.cfg.round = Number(r.value); if (r.key === 'dcf_inbound_dari') X.cfg.inboundDari = String(r.value); });
    X.today = todayJ();
    const [it, bt, hi, ib, cu, nx] = await Promise.all([
      s.from('dcf_item').select('*').order('urut'), s.from('dcf_stok_batch').select('*').order('tgl_exp').limit(5000),
      s.from('dcf_outbound_hist').select('*').limit(5000), s.from('dcf_inbound').select('*').gte('tgl', X.cfg.inboundDari).order('tgl').limit(5000),
      apiOut('cur'), apiOut('next')]);
    X.items = must(it); X.batches = must(bt); X.hist = must(hi); X.inb = must(ib);
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
    // riwayat outbound mingguan bertambah otomatis dari web (minggu berjalan & depan)
    const up = []; X.items.forEach(i => { const t = X.weekTot[i.plu_dc]; if (t) Object.keys(t).forEach(wk => up.push({ minggu: wk, plu_dc: i.plu_dc, qty: t[wk], sumber: 'WEB' })); });
    if (up.length) s.from('dcf_outbound_hist').upsert(up, { onConflict: 'minggu,plu_dc' }).then(() => { }, () => { });
    X.ready = true;
  }

  // ---------- perhitungan ----------
  function build() {
    const cur = monOf(X.today), nextW = addD(cur, 7);
    const rows = X.items.map(it => {
      const pc = String(it.plu_cust || '').trim();
      const bs = X.batches.filter(b => String(b.plu_cust).trim() === pc);
      const r = { it, plu: it.plu_dc, s0: bs.reduce((a, b) => a + Number(b.stok || 0), 0), bs, inb: {}, inbPO: 0 };
      X.inb.forEach(x => { if (x.plu_dc === it.plu_dc) r.inb[x.tgl] = (r.inb[x.tgl] || 0) + Number(x.qty); });
      const w = {}; X.hist.forEach(h => { if (h.plu_dc === it.plu_dc) w[h.minggu] = Number(h.qty); });
      const ov = X.weekTot[it.plu_dc] || {}; Object.keys(ov).forEach(k => w[k] = ov[k]);
      r.wk = Object.keys(w).filter(k => k <= nextW).sort().slice(-4).map(k => [k, w[k]]);
      r.avg = r.wk.length ? r.wk.reduce((a, b) => a + b[1], 0) / r.wk.length : 0;
      r.spd = r.avg / 7;
      return r;
    });
    X.rows = rows; return rows;
  }
  function outOn(r, d) { const wk = monOf(d); if (X.known[wk]) return (X.outDay[r.plu] || {})[d] || 0; return dow(d) === 0 ? 0 : r.avg / 6; }
  function sim(r, endISO, future, clamp) {
    if (!X.snap) return { at: {}, end: 0, min: 0 };
    let s = r.s0; Object.keys(r.inb).forEach(d => { if (d >= X.cfg.inboundDari && d <= X.snap) s += r.inb[d]; });
    const at = {}; at[X.snap] = s; let min = s;
    for (let d = addD(X.snap, 1); d <= endISO; d = addD(d, 1)) { if (future || d <= X.today) s += r.inb[d] || 0; s -= outOn(r, d); if (s < min) min = s; if (clamp && s < 0) s = 0; at[d] = s; }
    return { at, end: endISO < X.snap ? at[X.snap] : s, min };
  }
  function roundPal(need, P) {
    if (need <= 1e-9) return 0; const pal = Math.floor(need / P), rem = need - pal * P;
    if (rem < 1e-9) return pal * P; return rem >= X.cfg.round * P ? (pal + 1) * P : pal * P + Math.ceil(rem);
  }
  function stokRow(r) {
    const cur = monOf(X.today), eowC = addD(cur, 5), eowN = addD(cur, 12), T = X.today < X.snap ? X.snap : X.today;
    const a = sim(r, T < eowN ? eowN : T, false), f = sim(r, eowN, true);
    r.now = (sim(r, T, false).end); r.eowC = a.at[eowC] != null ? a.at[eowC] : a.end; r.eowN = a.at[eowN];
    r.ongo = Object.keys(r.inb).filter(d => d > X.today).reduce((t, d) => t + r.inb[d], 0);
    r.tot = r.eowN + r.ongo; r.dsi = r.spd > 0 ? r.now / r.spd : null;
    r.outToday = 0; for (let d = addD(X.snap || X.today, 1); X.snap && d <= T; d = addD(d, 1)) r.outToday += outOn(r, d);
    r.inbArr = Object.keys(r.inb).filter(d => d >= X.cfg.inboundDari && d <= X.today).reduce((t, d) => t + r.inb[d], 0);
    const b = r.bs.filter(b => Number(b.stok) > 0 && b.tgl_exp).sort((x, y) => x.tgl_exp < y.tgl_exp ? -1 : 1)[0];
    r.ed = b ? { exp: b.tgl_exp, hari: Math.round((pd(b.tgl_exp) - pd(X.today)) / 864e5), qty: b.stok } : null;
    r.edRisk = r.bs.filter(b => Number(b.stok) > 0 && b.tgl_exp && (pd(b.tgl_exp) - pd(X.today)) / 864e5 <= 30).reduce((t, b) => t + Number(b.stok), 0);
    return r;
  }
  // ---------- Order ----------
  function initPO(keep) {
    const cur = monOf(X.today), p = X.po && keep ? X.po : { id: null, tgl_po: X.today, mulai: addD(cur, 14), selesai: addD(cur, 19), dates: null, cells: {}, manual: {}, catatan: '' };
    const days = []; for (let d = p.mulai; d <= p.selesai; d = addD(d, 1)) if (dow(d) !== 0) days.push(d);
    p.days = days; if (!p.dates) p.dates = days.slice(0, 8);
    p.dates = p.dates.filter(d => days.includes(d)); X.po = p; return p;
  }
  function calcOrder() {
    const p = X.po, T = p.selesai;
    X.rows.forEach(r => {
      stokRow(r);
      const P = Number(r.it.pallet_ctn) || 77, tgt = r.it.target_dsi != null ? Number(r.it.target_dsi) : X.cfg.target;
      const sT = sim(r, T, true, true), sM = sim(r, addD(p.mulai, -1), true, true);
      r.P = P; r.tgt = tgt; r.stockT = sT.end; r.minPre = sM.min; r.dsiT = r.spd > 0 ? sT.end / r.spd : null;
      r.need = Math.max(0, tgt * r.spd - sT.end); r.rec = r.it.aktif ? roundPal(r.need, P) : 0;
    });
  }
  function autoFill(only) {
    const p = X.po, n = p.dates.length || 1;
    X.rows.forEach(r => {
      if (only && p.manual[r.plu]) return;
      const c = {}; p.dates.forEach(d => c[d] = 0);
      if (p.dates.length) { const pal = Math.floor(r.rec / r.P), loose = r.rec - pal * r.P; for (let i = 0; i < pal; i++) c[p.dates[i % n]] += r.P; c[p.dates[pal % n]] += loose; }
      p.cells[r.plu] = c; delete p.manual[r.plu];
    });
  }
  const tot = r => Object.values(X.po.cells[r.plu] || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const palTxt = (q, P) => { const a = Math.floor(q / P), b = q - a * P; return q ? (a ? a + ' plt' : '') + (a && b ? ' + ' : '') + (b ? n0(b) + ' ctn' : '') : '-'; };

  // ---------- tampilan ----------
  const TH = 'padding:5px 8px;background:#3730a3;color:#fff;font-size:11px;white-space:nowrap;position:sticky;top:0;z-index:2';
  const TD = 'padding:4px 8px;border-bottom:1px solid #edf0f8;white-space:nowrap;font-size:12.5px;text-align:right';
  const TDL = 'padding:4px 8px;border-bottom:1px solid #edf0f8;white-space:nowrap;font-size:12.5px;position:sticky;left:0;background:inherit;z-index:1';
  const root = () => Q('#vDcf');
  function shell() {
    const tabs = [['stok', 'Stok DC'], ['order', 'Order Takaki'], ['inb', 'Inbound / PO On Going'], ['data', 'Data & Pengaturan']];
    root().innerHTML = '<div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 style="margin:0;color:var(--br)">Stok &amp; Order DCF</h3><span id="dcfSub" class="note" style="padding:0"></span><span style="flex:1"></span>'
      + '<span id="dcfSeg" style="display:inline-flex;gap:4px;flex-wrap:wrap">' + tabs.map(t => '<button class="b ' + (X.tab === t[0] ? 'p' : 's') + '" data-t="' + t[0] + '">' + t[1] + '</button>').join('') + '</span><button class="b s" id="dcfRl">Muat ulang</button></div><div id="dcfWarn"></div></div><div id="dcfBody"></div>';
    Q('#dcfSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; X.tab = b.dataset.t; shell(); paint(); };
    Q('#dcfRl').onclick = () => start(true);
  }
  function paint() {
    if (!X.ready) return;
    build(); X.rows.forEach(stokRow);
    Q('#dcfSub').textContent = X.snap ? 'Stok Takaki per ' + fdd(X.snap) + ' · hari ini ' + fdd(X.today) + ' · satuan CTN' : 'Belum ada data stok Takaki — unggah di tab Data & Pengaturan';
    Q('#dcfWarn').innerHTML = X.warn.map(w => '<div class="note wn" style="padding-top:6px">' + w + '</div>').join('');
    ({ stok: paintStok, order: paintOrder, inb: paintInb, data: paintData })[X.tab]();
  }
  const kpi = (l, v, s, c) => '<div class="kpi"><small>' + l + '</small><b' + (c ? ' style="color:' + c + '"' : '') + '>' + v + '</b><span>' + (s || '') + '</span></div>';

  function paintStok() {
    const R = X.rows.filter(r => r.it.aktif), cur = monOf(X.today);
    const neg = R.filter(r => r.now < 0).length, ongo = R.reduce((t, r) => t + r.ongo, 0), ed = R.reduce((t, r) => t + r.edRisk, 0);
    let h = '<div class="card" style="margin-top:12px"><div class="kpis">' + kpi('Stok DC hari ini', n0(R.reduce((t, r) => t + r.now, 0)), 'ctn · semua item aktif') + kpi('PO on going', n0(ongo), 'ctn belum tiba') + kpi('Item stok minus', neg, 'perlu cek / inbound', neg ? '#b91c1c' : '#15803d') + kpi('ED ≤ 30 hari', n0(ed), 'ctn mendekati kadaluarsa', ed ? '#b45309' : '#15803d') + '</div>'
      + '<div class="note" style="padding:0 0 6px">Stok hari ini = stok Takaki (' + fd(X.snap) + ') + inbound sejak ' + fd(X.cfg.inboundDari) + ' − outbound PB per tanggal. Minggu berjalan & depan memakai PB web; sesudahnya rata-rata 4 minggu. Klik baris untuk melihat ED.</div>'
      + '<div style="overflow:auto;max-height:70vh"><table style="border-collapse:collapse;width:100%"><thead><tr>'
      + ['ITEM', 'STOK TAKAKI', 'OUTBOUND s/d HARI INI', 'INBOUND DITERIMA', 'STOK DC HARI INI', 'STOK AKHIR ' + fd(addD(cur, 5)), 'STOK AKHIR ' + fd(addD(cur, 12)), 'PO ON GOING', 'TOTAL + ON GOING', 'RATA2 /MGG', 'DSI (HARI)', 'ED TERDEKAT'].map((t, i) => '<th style="' + TH + (i ? ';text-align:right' : ';text-align:left;left:0;z-index:3') + '">' + t + '</th>').join('') + '</tr></thead><tbody>';
    R.forEach((r, n) => {
      const bg = n % 2 ? '#fafbff' : '#fff', red = v => v < 0 ? ';color:#b91c1c;font-weight:bold' : '';
      h += '<tr data-p="' + r.plu + '" style="background:' + bg + ';cursor:pointer"><td style="' + TDL + '"><b>' + E(r.it.deskripsi) + '</b></td><td style="' + TD + '">' + n0(r.s0) + '</td><td style="' + TD + '">' + n0(r.outToday) + '</td><td style="' + TD + '">' + n0(r.inbArr) + '</td><td style="' + TD + ';font-weight:bold' + red(r.now) + '">' + n0(r.now) + '</td><td style="' + TD + red(r.eowC) + '">' + n0(r.eowC) + '</td><td style="' + TD + red(r.eowN) + '">' + n0(r.eowN) + '</td><td style="' + TD + '">' + (r.ongo ? n0(r.ongo) : '-') + '</td><td style="' + TD + red(r.tot) + '">' + n0(r.tot) + '</td><td style="' + TD + '">' + n0(r.avg) + '</td><td style="' + TD + (r.dsi != null && r.dsi < 14 ? ';color:#b91c1c;font-weight:bold' : '') + '">' + (r.dsi == null ? '-' : n1(r.dsi)) + '</td><td style="' + TD + (r.ed && r.ed.hari <= 30 ? ';color:#b45309;font-weight:bold' : '') + '">' + (r.ed ? fd(r.ed.exp) + ' · ' + r.ed.hari + ' hr' : '-') + '</td></tr>';
    });
    Q('#dcfBody').innerHTML = h + '</tbody></table></div></div>';
    Q('#dcfBody tbody').onclick = e => { const tr = e.target.closest('tr'); if (tr) showED(tr.dataset.p); };
  }
  function showED(plu) {
    const r = X.rows.find(x => x.plu === plu); if (!r) return;
    const b = r.bs.filter(x => Number(x.stok) > 0).sort((x, y) => (x.tgl_exp || '') < (y.tgl_exp || '') ? -1 : 1);
    const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = '<div style="background:#fff;border-radius:14px;padding:16px;max-width:520px;width:100%;max-height:80vh;overflow:auto"><div style="display:flex;justify-content:space-between;align-items:center"><b>' + E(r.it.deskripsi) + '</b><button class="b s">Tutup</button></div><div class="note" style="padding:4px 0 8px">Rata-rata 4 minggu: ' + r.wk.map(w => fd(w[0]) + ' = ' + n0(w[1])).join(' · ') + '</div><table style="border-collapse:collapse;width:100%"><thead><tr><th style="' + TH + ';text-align:left">INBOUND</th><th style="' + TH + '">EXP</th><th style="' + TH + '">SISA HARI</th><th style="' + TH + '">STOK</th></tr></thead><tbody>'
      + (b.map(x => { const h = Math.round((pd(x.tgl_exp) - pd(X.today)) / 864e5); return '<tr><td style="' + TD + ';text-align:left">' + fd(x.tgl_inbound) + '</td><td style="' + TD + '">' + fd(x.tgl_exp) + '</td><td style="' + TD + (h <= 30 ? ';color:#b45309;font-weight:bold' : '') + '">' + h + '</td><td style="' + TD + '">' + n0(x.stok) + '</td></tr>'; }).join('') || '<tr><td colspan="4" class="note">Tidak ada batch.</td></tr>') + '</tbody></table></div>';
    document.body.appendChild(ov); ov.onclick = e => { if (e.target === ov || e.target.tagName === 'BUTTON') ov.remove(); };
  }

  function paintOrder() {
    const p = X.po || initPO(); if (!X.po.days.length) initPO(true);
    calcOrder(); if (!Object.keys(p.cells).length) autoFill(false);
    let h = '<div class="card" style="margin-top:12px"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">'
      + '<div><label class="k">Tanggal PO</label><input type="date" class="in" id="poT" value="' + p.tgl_po + '" style="width:150px"></div>'
      + '<div><label class="k">Kirim mulai</label><input type="date" class="in" id="poM" value="' + p.mulai + '" style="width:150px"></div>'
      + '<div><label class="k">Kirim selesai (acuan DSI)</label><input type="date" class="in" id="poS" value="' + p.selesai + '" style="width:150px"></div>'
      + '<div><label class="k">Target DSI global (hari)</label><input type="number" class="in" id="poD" value="' + X.cfg.target + '" style="width:110px"></div>'
      + '<button class="b s" id="poRe">Hitung ulang rekomendasi</button></div>'
      + '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="note" style="padding:0">Tanggal kirim PO:</span>' + p.days.map(d => '<label style="font-size:12px;border:1px solid var(--bd);border-radius:8px;padding:2px 7px"><input type="checkbox" data-d="' + d + '"' + (p.dates.includes(d) ? ' checked' : '') + '> ' + fdd(d) + '</label>').join('') + '</div>';
    const rows = X.rows.filter(r => r.it.aktif);
    const sumRec = rows.reduce((t, r) => t + r.rec, 0), low = rows.filter(r => r.minPre < 0).length;
    h += '<div class="kpis" id="poK"></div><div class="note" style="padding:0 0 6px">Rekomendasi = target DSI × (rata-rata outbound 4 minggu ÷ 7) − estimasi stok ' + fdd(p.selesai) + ' (sudah termasuk PO on going). Pembulatan: pallet penuh (77 ctn); sisa ≥ ' + Math.round(X.cfg.round * 100) + '% pallet dibulatkan naik, sisa lebih kecil boleh ctn. Sel tanggal bisa diubah manual (ctn).</div>'
      + '<div style="overflow:auto;max-height:68vh"><table style="border-collapse:collapse;width:100%"><thead><tr>' + ['ITEM', 'EST. STOK ' + fd(p.selesai), 'RATA2 /MGG', 'DSI', 'TARGET', 'BUTUH', 'REKOMENDASI'].map((t, i) => '<th style="' + TH + (i ? ';text-align:right' : ';text-align:left;left:0;z-index:3') + '">' + t + '</th>').join('')
      + p.dates.map(d => '<th style="' + TH + ';background:#2f7d4f">' + fdd(d) + '</th>').join('') + ['TOTAL PO', 'PALLET', 'DSI SETELAH PO', 'NILAI (Rp)', 'CATATAN'].map(t => '<th style="' + TH + ';text-align:right">' + t + '</th>').join('') + '</tr></thead><tbody>';
    rows.forEach((r, n) => {
      h += '<tr data-p="' + r.plu + '" style="background:' + (n % 2 ? '#fafbff' : '#fff') + '"><td style="' + TDL + '"><b>' + E(r.it.deskripsi) + '</b></td><td style="' + TD + (r.stockT < 0 ? ';color:#b91c1c;font-weight:bold' : '') + '">' + n0(r.stockT) + '</td><td style="' + TD + '">' + n0(r.avg) + '</td><td style="' + TD + '">' + (r.dsiT == null ? '-' : n1(r.dsiT)) + '</td><td style="' + TD + '">' + r.tgt + '</td><td style="' + TD + '">' + n0(r.need) + '</td><td style="' + TD + ';font-weight:bold;color:#3730a3">' + n0(r.rec) + '<div style="font-weight:normal;font-size:10.5px;color:#64748b">' + palTxt(r.rec, r.P) + '</div></td>'
        + p.dates.map(d => '<td style="' + TD + ';padding:2px 4px"><input type="number" min="0" class="in" data-c="' + d + '" value="' + (p.cells[r.plu] && p.cells[r.plu][d] ? p.cells[r.plu][d] : '') + '" style="width:64px;text-align:right;padding:3px 5px"></td>').join('')
        + '<td class="t" style="' + TD + ';font-weight:bold"></td><td class="pl" style="' + TD + '"></td><td class="ds" style="' + TD + '"></td><td class="rp" style="' + TD + '"></td><td class="ct" style="' + TD + ';white-space:normal;max-width:200px;font-size:11px"></td></tr>';
    });
    h += '</tbody></table></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><input class="in" id="poN" placeholder="Catatan PO (opsional)" value="' + E(p.catatan) + '" style="max-width:320px"><button class="b p" id="poSv">Simpan PO</button><button class="b s" id="poXl">Unduh Excel PO Takaki</button></div>'
      + '<div id="poHist" style="margin-top:14px"></div></div>';
    Q('#dcfBody').innerHTML = h; Q('#poK').className = 'kpis';
    const B = Q('#dcfBody');
    B.querySelectorAll('tr[data-p]').forEach(refreshRow); refreshTotals();
    B.onchange = e => {
      const t = e.target;
      if (t.dataset.c) { const tr = t.closest('tr'), pl = tr.dataset.p; (p.cells[pl] || (p.cells[pl] = {}))[t.dataset.c] = Number(t.value) || 0; p.manual[pl] = true; refreshRow(tr); refreshTotals(); }
      else if (t.dataset.d) { p.dates = p.days.filter(d => (Q('input[data-d="' + d + '"]', B) || {}).checked); autoFill(false); paintOrder(); }
      else if (t.id === 'poT') p.tgl_po = t.value;
      else if (t.id === 'poM' || t.id === 'poS') { p.mulai = Q('#poM').value; p.selesai = Q('#poS').value; if (p.selesai < p.mulai) p.selesai = p.mulai; p.dates = null; p.cells = {}; initPO(true); paintOrder(); }
      else if (t.id === 'poD') { const v = Number(t.value); if (v > 0) { sbc().from('settings').upsert({ key: 'dcf_target_dsi', value: v }).then(r => { if (r.error) msg('Gagal menyimpan target DSI', true); }); X.cfg.target = v; p.cells = {}; paintOrder(); } }
      else if (t.id === 'poN') p.catatan = t.value;
    };
    Q('#poRe').onclick = () => { p.cells = {}; p.manual = {}; paintOrder(); msg('Rekomendasi dihitung ulang'); };
    Q('#poSv').onclick = savePO; Q('#poXl').onclick = exportXlsx;
    loadPOList();
  }
  function refreshRow(tr) {
    const r = X.rows.find(x => x.plu === tr.dataset.p), p = X.po, q = tot(r), diff = q - r.rec;
    const sA = r.spd > 0 ? (r.stockT + q) / r.spd : null;
    Q('.t', tr).textContent = q ? n0(q) : '-'; Q('.pl', tr).textContent = palTxt(q, r.P);
    Q('.ds', tr).textContent = sA == null ? '-' : n1(sA); Q('.rp', tr).textContent = q ? n0(q * r.it.frc * r.it.hpp) : '-';
    const c = []; if (r.minPre < 0) c.push('<span style="color:#b91c1c">⚠ stok habis sebelum PO tiba (' + n0(r.minPre) + ')</span>'); if (p.manual[r.plu] && diff) c.push('manual ' + (diff > 0 ? '+' : '') + n0(diff) + ' vs rekomendasi');
    if (r.edRisk) c.push('<span style="color:#b45309">ED ≤30hr: ' + n0(r.edRisk) + '</span>'); Q('.ct', tr).innerHTML = c.join('<br>');
  }
  function refreshTotals() {
    const rows = X.rows.filter(r => r.it.aktif); let q = 0, v = 0, pl = 0, rec = 0, low = 0;
    rows.forEach(r => { const t = tot(r); q += t; v += t * r.it.frc * r.it.hpp; pl += t / r.P; rec += r.rec; if (r.minPre < 0) low++; });
    Q('#poK').innerHTML = kpi('Total rekomendasi', n0(rec), 'ctn') + kpi('Total PO (diisi)', n0(q), 'ctn · ' + n1(pl) + ' pallet') + kpi('Nilai PO', 'Rp ' + n0(v), 'HPP inc PPN') + kpi('Item berisiko habis', low, 'sebelum PO tiba', low ? '#b91c1c' : '#15803d');
  }
  async function savePO() {
    const p = X.po, s = sbc(); const b = Q('#poSv'); b.disabled = true;
    try {
      const head = { tgl_po: p.tgl_po, kirim_mulai: p.mulai, kirim_selesai: p.selesai, target_dsi: X.cfg.target, tgl_kirim: p.dates, catatan: p.catatan || null, dibuat_oleh: ((gD() || {}).user || {}).name || null };
      let id = p.id;
      if (id) must(await s.from('dcf_po').update(head).eq('id', id)); else { const r = must(await s.from('dcf_po').insert(head).select('id').single()); id = r.id; p.id = id; }
      must(await s.from('dcf_po_line').delete().eq('po_id', id));
      const lines = []; X.rows.forEach(r => p.dates.forEach(d => { const q = Number((p.cells[r.plu] || {})[d]) || 0; if (q > 0) lines.push({ po_id: id, plu_dc: r.plu, tgl_kirim: d, qty: q }); }));
      if (lines.length) must(await s.from('dcf_po_line').insert(lines));
      msg('PO tersimpan (' + lines.length + ' baris)'); loadPOList();
    } catch (e) { msg('Gagal menyimpan PO: ' + e.message, true); }
    b.disabled = false;
  }
  async function loadPOList() {
    const h = Q('#poHist'); if (!h) return;
    try {
      X.pos = must(await sbc().from('dcf_po').select('*').order('id', { ascending: false }).limit(15));
      h.innerHTML = '<b style="color:var(--br)">PO tersimpan</b>' + (X.pos.length ? '<div style="overflow:auto"><table style="border-collapse:collapse;width:100%;margin-top:6px"><tbody>' + X.pos.map(o => '<tr><td style="' + TD + ';text-align:left">#' + o.id + ' · PO ' + fd(o.tgl_po) + '</td><td style="' + TD + ';text-align:left">kirim ' + fd(o.kirim_mulai) + ' – ' + fd(o.kirim_selesai) + '</td><td style="' + TD + ';text-align:left">' + E(o.status) + (o.catatan ? ' · ' + E(o.catatan) : '') + '</td><td style="' + TD + '"><button class="b s" data-o="open" data-i="' + o.id + '">Buka</button> <button class="b s" data-o="ong" data-i="' + o.id + '">Jadikan PO on going</button> <button class="b s" data-o="del" data-i="' + o.id + '">Hapus</button></td></tr>').join('') + '</tbody></table></div>' : '<div class="note">Belum ada.</div>');
      h.onclick = e => { const b = e.target.closest('button[data-o]'); if (b) poAct(b.dataset.o, Number(b.dataset.i)); };
    } catch (e) { h.innerHTML = '<div class="note wn">' + E(e.message) + '</div>'; }
  }
  async function poAct(a, id) {
    const s = sbc(), o = X.pos.find(x => x.id === id); if (!o) return;
    try {
      if (a === 'open') {
        const ls = must(await s.from('dcf_po_line').select('*').eq('po_id', id)); const cells = {};
        ls.forEach(l => { (cells[l.plu_dc] || (cells[l.plu_dc] = {}))[l.tgl_kirim] = Number(l.qty); });
        X.po = { id, tgl_po: o.tgl_po, mulai: o.kirim_mulai, selesai: o.kirim_selesai, dates: o.tgl_kirim, cells, manual: {}, catatan: o.catatan || '' };
        X.rows.forEach(r => { if (!cells[r.plu]) cells[r.plu] = {}; X.po.manual[r.plu] = true; }); initPO(true); paintOrder(); msg('PO #' + id + ' dibuka');
      } else if (a === 'ong') {
        pbDo('Jadikan PO #' + id + ' sebagai PO on going?\nQty tiap tanggal kirim masuk ke Inbound dan ikut menghitung stok & rekomendasi berikutnya.', async () => {
          const ls = must(await s.from('dcf_po_line').select('*').eq('po_id', id));
          must(await s.from('dcf_inbound').delete().eq('po_id', id));
          if (ls.length) must(await s.from('dcf_inbound').insert(ls.map(l => ({ tgl: l.tgl_kirim, plu_dc: l.plu_dc, qty: l.qty, sumber: 'PO', po_id: id }))));
          must(await s.from('dcf_po').update({ status: 'ON GOING' }).eq('id', id)); msg('PO #' + id + ' masuk ke PO on going'); await start(true);
        });
      } else if (a === 'del') {
        pbDo('Hapus PO #' + id + '? Inbound dari PO ini ikut dihapus.', async () => { must(await s.from('dcf_inbound').delete().eq('po_id', id)); must(await s.from('dcf_po').delete().eq('id', id)); if (X.po && X.po.id === id) X.po.id = null; msg('PO dihapus'); await start(true); });
      }
    } catch (e) { msg(e.message, true); }
  }
  function pbDo(text, fn) { if (window.pbConfirm) window.pbConfirm(text, () => fn().catch(e => msg(e.message, true))); else if (confirm(text)) fn().catch(e => msg(e.message, true)); }

  // ---------- Inbound (matriks tanggal × item) ----------
  function paintInb() {
    const dset = new Set(); X.inb.forEach(x => dset.add(x.tgl)); (X.extraDates || []).forEach(d => dset.add(d));
    const ds = [...dset].sort(), R = X.rows.filter(r => r.it.aktif);
    let h = '<div class="card" style="margin-top:12px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end"><div><label class="k">Tambah kolom tanggal</label><input type="date" class="in" id="ibD" style="width:150px"></div><button class="b s" id="ibA">Tambah</button><span class="note" style="padding:0">Tanggal ≤ hari ini = sudah tiba (menambah stok DC). Tanggal sesudahnya = PO on going. Dihitung sejak ' + fd(X.cfg.inboundDari) + '. Isi qty dalam CTN.</span></div>'
      + '<div style="overflow:auto;max-height:68vh;margin-top:8px"><table style="border-collapse:collapse"><thead><tr><th style="' + TH + ';text-align:left;left:0;z-index:3">ITEM</th>' + ds.map(d => '<th style="' + TH + (d > X.today ? ';background:#2f7d4f' : '') + '">' + fdd(d) + '</th>').join('') + '</tr></thead><tbody>';
    R.forEach((r, n) => { h += '<tr data-p="' + r.plu + '" style="background:' + (n % 2 ? '#fafbff' : '#fff') + '"><td style="' + TDL + '"><b>' + E(r.it.deskripsi) + '</b></td>' + ds.map(d => '<td style="' + TD + ';padding:2px 4px"><input type="number" min="0" class="in" data-d="' + d + '" value="' + (r.inb[d] || '') + '" style="width:70px;text-align:right;padding:3px 5px"></td>').join('') + '</tr>'; });
    Q('#dcfBody').innerHTML = h + '</tbody></table></div></div>';
    Q('#ibA').onclick = () => { const v = Q('#ibD').value; if (v) { (X.extraDates = X.extraDates || []).push(v); paintInb(); } };
    Q('#dcfBody tbody').onchange = async e => {
      const t = e.target, tr = t.closest('tr'); if (!t.dataset.d) return; const plu = tr.dataset.p, d = t.dataset.d, q = Number(t.value) || 0;
      try {
        must(await sbc().from('dcf_inbound').delete().eq('plu_dc', plu).eq('tgl', d));
        if (q > 0) must(await sbc().from('dcf_inbound').insert({ tgl: d, plu_dc: plu, qty: q, sumber: 'MANUAL' }));
        X.inb = X.inb.filter(x => !(x.plu_dc === plu && x.tgl === d)); if (q > 0) X.inb.push({ tgl: d, plu_dc: plu, qty: q }); msg('Inbound disimpan');
      } catch (er) { msg('Gagal menyimpan: ' + er.message, true); }
    };
  }

  // ---------- Data & pengaturan ----------
  function paintData() {
    let h = '<div class="card" style="margin-top:12px"><h3 style="margin:0 0 6px;color:var(--br)">Unggah stok Takaki</h3><div class="note" style="padding:0 0 8px">Pilih file <b>Monitoring Stock Takaki DCF SBY (.xlsx)</b>. Yang dibaca hanya sheet <b>data ED</b> (tanggal di B2, PLU_CUST kolom A, stok kolom C, inbound kolom J, ED kolom K). Data stok lama diganti.</div>'
      + '<input type="file" id="dcfF" accept=".xlsx"> <span id="dcfFs" class="note"></span>'
      + '<div class="note" style="padding:8px 0 0">Data saat ini: ' + (X.snap ? n0(X.batches.length) + ' batch per ' + fdd(X.snap) : 'kosong') + '</div></div>'
      + '<div class="card" style="margin-top:12px"><h3 style="margin:0 0 6px;color:var(--br)">Pengaturan</h3><div style="display:flex;gap:12px;flex-wrap:wrap">'
      + '<div><label class="k">Target DSI global (hari)</label><input type="number" class="in" id="cfT" value="' + X.cfg.target + '" style="width:110px"></div>'
      + '<div><label class="k">Sisa ≥ x% pallet dibulatkan naik</label><input type="number" class="in" id="cfR" value="' + Math.round(X.cfg.round * 100) + '" style="width:110px"></div>'
      + '<div><label class="k">Hitung inbound sejak</label><input type="date" class="in" id="cfI" value="' + X.cfg.inboundDari + '" style="width:150px"></div></div></div>'
      + '<div class="card" style="margin-top:12px"><h3 style="margin:0 0 6px;color:var(--br)">Master item DCF</h3><div class="note" style="padding:0 0 6px">Target DSI kosong = pakai target global. HPP per pcs (inc PPN). Item non-aktif tidak ikut stok & order.</div><div style="overflow:auto"><table style="border-collapse:collapse"><thead><tr>'
      + ['ITEM', 'PLU DC', 'PLU PO', 'PLU CUST', 'FRC', 'HPP', 'CTN/PALLET', 'TARGET DSI', 'AKTIF'].map(t => '<th style="' + TH + '">' + t + '</th>').join('') + '</tr></thead><tbody>'
      + X.items.map((i, n) => '<tr data-p="' + i.plu_dc + '" style="background:' + (n % 2 ? '#fafbff' : '#fff') + '"><td style="' + TD + ';text-align:left"><b>' + E(i.deskripsi) + '</b></td><td style="' + TD + '">' + i.plu_dc + '</td>'
        + ['plu_po', 'plu_cust'].map(k => '<td style="' + TD + '"><input class="in" data-k="' + k + '" value="' + E(i[k] || '') + '" style="width:110px"></td>').join('')
        + ['frc', 'hpp', 'pallet_ctn', 'target_dsi'].map(k => '<td style="' + TD + '"><input type="number" class="in" data-k="' + k + '" value="' + (i[k] == null ? '' : i[k]) + '" style="width:80px;text-align:right"></td>').join('')
        + '<td style="' + TD + '"><input type="checkbox" data-k="aktif"' + (i.aktif ? ' checked' : '') + '></td></tr>').join('') + '</tbody></table></div></div>';
    Q('#dcfBody').innerHTML = h;
    Q('#dcfF').onchange = e => uploadXlsx(e.target.files[0]);
    const setCfg = (key, val, f) => sbc().from('settings').upsert({ key, value: val }).then(r => { if (r.error) msg('Gagal menyimpan pengaturan', true); else { f(); msg('Pengaturan disimpan'); X.po = null; } });
    Q('#cfT').onchange = e => { const v = Number(e.target.value); if (v > 0) setCfg('dcf_target_dsi', v, () => X.cfg.target = v); };
    Q('#cfR').onchange = e => { const v = Number(e.target.value) / 100; if (v >= 0 && v <= 1) setCfg('dcf_round_pct', v, () => X.cfg.round = v); };
    Q('#cfI').onchange = e => { if (e.target.value) setCfg('dcf_inbound_dari', e.target.value, () => { X.cfg.inboundDari = e.target.value; start(true); }); };
    Q('#dcfBody').onchange = async e => {
      const t = e.target, k = t.dataset.k, tr = t.closest('tr[data-p]'); if (!k || !tr) return;
      let v = t.type === 'checkbox' ? t.checked : t.value.trim(); if (t.type === 'number') v = v === '' ? null : Number(v);
      if ((k === 'frc' || k === 'pallet_ctn') && !(v > 0)) { msg('Nilai harus lebih dari 0', true); return; }
      const r = await sbc().from('dcf_item').update({ [k]: v }).eq('plu_dc', tr.dataset.p);
      if (r.error) msg('Gagal menyimpan: ' + r.error.message, true); else { X.items.find(i => i.plu_dc === tr.dataset.p)[k] = v; X.po = null; msg('Tersimpan'); }
    };
  }
  const cv = c => { let v = c && c.value; if (v && typeof v === 'object') v = 'result' in v ? v.result : (v.richText ? v.richText.map(x => x.text).join('') : null); return v; };
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
      st.textContent = ''; msg(rows.length + ' batch stok per ' + fd(tgl) + ' tersimpan' + (skip ? ' (' + n0(skip) + ' ctn item di luar master diabaikan)' : '')); await start(true);
    } catch (e) { st.textContent = ''; msg('Gagal: ' + e.message, true); }
  }

  // ---------- Excel PO Takaki ----------
  async function exportXlsx() {
    try {
      const EJ = await loadEJ(), wb = new EJ.Workbook(), ws = wb.addWorksheet('PO TAKAKI'), p = X.po, rows = X.rows.filter(r => r.it.aktif), nd = p.dates.length;
      ws.addRow(['PO TAKAKI (U/ DCF SBY)']).font = { bold: true, size: 14 }; ws.addRow(['Tanggal PO : ' + fd(p.tgl_po) + ' ' + p.tgl_po.slice(0, 4) + ' · Request kirim ' + fd(p.mulai) + ' – ' + fd(p.selesai) + ' · Target DSI ' + X.cfg.target + ' hari']);
      const h1 = ['PLU PO', 'PLU DC', 'DESCRIPTION', 'FRC', 'EST. STOK ' + fd(p.selesai), 'RATA2 /MGG', 'REKOMENDASI']; p.dates.forEach(d => h1.push(fdd(d) + ' PALLET', fdd(d) + ' CTN', fdd(d) + ' PCS')); h1.push('TOTAL CTN', 'TOTAL PCS', 'DSI SETELAH PO', 'HPP', 'TOTAL HARGA');
      const hr = ws.addRow([]), hd = ws.addRow(h1); hd.font = { bold: true, color: { argb: 'FFFFFFFF' } }; hd.alignment = { wrapText: true, horizontal: 'center' }; hd.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3730A3' } });
      const col = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
      rows.forEach(r => {
        const rn = ws.rowCount + 1, a = [r.it.plu_po || '', r.plu, r.it.deskripsi, r.it.frc, Math.round(r.stockT), Math.round(r.avg), r.rec]; const cc = [];
        p.dates.forEach((d, i) => { const q = Number((p.cells[r.plu] || {})[d]) || 0, c0 = 7 + i * 3; a.push(q ? Math.round(q / r.P * 10) / 10 : 0, q, { formula: col(c0 + 1) + rn + '*$D' + rn, result: q * r.it.frc }); cc.push(col(c0 + 1) + rn); });
        const base = 7 + nd * 3; a.push({ formula: cc.length ? 'SUM(' + cc.join(',') + ')' : '0', result: tot(r) }, { formula: col(base) + rn + '*$D' + rn, result: tot(r) * r.it.frc }, r.spd > 0 ? Math.round((r.stockT + tot(r)) / r.spd * 10) / 10 : '', r.it.hpp, { formula: col(base + 1) + rn + '*' + col(base + 3) + rn, result: tot(r) * r.it.frc * r.it.hpp });
        ws.addRow(a);
      });
      const last = ws.rowCount, base = 7 + nd * 3, tr = ws.addRow(['', '', 'TOTAL']); tr.font = { bold: true };
      [base, base + 1, base + 4].forEach(c => { tr.getCell(c + 1).value = { formula: 'SUM(' + col(c) + '5:' + col(c) + last + ')' }; });
      ws.columns.forEach((c, i) => c.width = i === 2 ? 30 : i < 2 ? 12 : 13); ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 4 }];
      ws.eachRow((row, n) => { if (n > 4) row.eachCell((c, i) => { if (i > 3 && typeof c.value !== 'string') c.numFmt = '#,##0.##'; }); });
      const buf = await wb.xlsx.writeBuffer(), name = 'PO TAKAKI ' + p.tgl_po + ' kirim ' + p.mulai + '.xlsx', blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (window.save) window.save(blob, name); else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
    } catch (e) { msg('Gagal membuat Excel: ' + e.message, true); }
  }

  // ---------- pemasangan menu ----------
  async function start(force) {
    const body = Q('#dcfBody'); if (body) body.innerHTML = '<div class="card empty" style="margin-top:12px"><span class="spin"></span><div>Memuat stok DCF…</div></div>';
    try { await loadAll(); if (force && X.po) initPO(true); shell(); paint(); } catch (e) { shell(); Q('#dcfBody').innerHTML = '<div class="card empty" style="color:#b00020;margin-top:12px">Gagal memuat: ' + E(e.message) + '</div>'; }
  }
  function mount() {
    const nav = Q('nav .wrap'); if (!nav || Q('#nbD')) return;
    const b = document.createElement('button'); b.className = 'nb'; b.id = 'nbD'; b.style.display = 'none';
    b.innerHTML = '<span class="ni"><svg class="ic o" aria-hidden="true"><use href="#i-package"/></svg></span><span class="nt">Stok &amp; Order DCF</span>';
    Q('#nbC').after(b);
    const v = document.createElement('div'); v.id = 'vDcf'; v.style.display = 'none'; Q('main .wrap').appendChild(v);
    VID.dcf = '#vDcf';
    const av = window.applyView; window.applyView = function (x) { av(x); b.classList.toggle('on', x === 'dcf'); };
    b.onclick = e => { e.stopPropagation(); window.showView('dcf'); if (!X.ready) start(false); else { if (!Q('#dcfSeg')) shell(); paint(); } };
    setInterval(() => { const d = gD(), adm = !!(d && d.user && d.user.admin && gTok()); b.style.display = adm ? '' : 'none'; if (!adm && X.ready) { X.ready = false; X.po = null; } }, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.PBDCF = { shell, paint, start, X, build, sim, roundPal, stokRow, calcOrder, initPO, autoFill };
})();
