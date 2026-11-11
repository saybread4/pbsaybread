/* PB SAY BREAD - menu "Stock DCF" (semua user login; edit hanya administrator) + tombol menu PO TAKAKI (isi halaman: pb-potakaki.js).  Semua satuan CTN.
   Sub halaman (kiri ke kanan): Data ED, Stock, Rekap PO.
   Tabel Supabase: stokdcf_item (kolom core), stokdcf_ed, stokdcf_po; fungsi stokdcf_sales() (lihat migrasi-stok-dcf.sql).
   Kolom PB di Stock diambil dari fungsi get_outbound (PB per tanggal kirim). Semua user login boleh melihat; unggah/edit/kolom core hanya admin (dijaga RLS di database). */
(function () {
  'use strict';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const MONL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const MONI = { jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, may: 4, jun: 5, jul: 6, agu: 7, aug: 7, agt: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11 };
  const pd = s => new Date(s + 'T00:00:00Z');
  const iso = d => d.toISOString().slice(0, 10);
  const addD = (s, n) => iso(new Date(pd(s).getTime() + n * 864e5));
  const fd = s => s ? String(pd(s).getUTCDate()).padStart(2, '0') + ' ' + MON[pd(s).getUTCMonth()] + ' ' + pd(s).getUTCFullYear() : '';
  const fdl = s => s ? pd(s).getUTCDate() + ' ' + MONL[pd(s).getUTCMonth()] + ' ' + pd(s).getUTCFullYear() : '';
  const dm = s => pd(s).getUTCDate() + '-' + MON[pd(s).getUTCMonth()];
  const dmm = s => pd(s).getUTCDate() + ' ' + MON[pd(s).getUTCMonth()];
  const lab = (a, b) => dmm(a) + '-' + dmm(b);
  const isoDow = s => pd(s).getUTCDay() || 7;
  const n0 = v => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const Q = (s, r) => (r || document).querySelector(s);
  const sbc = () => window.PBAPI.sb;
  const gTok = () => (typeof TOKEN !== 'undefined' ? TOKEN : null), gD = () => (typeof D !== 'undefined' ? D : null);
  const msg = (m, err) => { if (window.toast) window.toast(m, err); else alert(m); };
  const must = r => { if (r.error) throw new Error(r.error.message); return r.data; };
  const adm = () => { const d = gD(); return !!(d && d.user && d.user.admin); };
  const callApi = (fn, args) => new Promise((ok, no) => window.PBAPI.call(fn, args, ok, no));
  const ic = n => '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
  const norm = s => String(s == null ? '' : s).toUpperCase().replace(/\s+/g, ' ').trim();

  const X = { tab: 'stok', ready: false, items: [], ed: [], sales: {}, salesErr: null, poM: new Map(), pb: {}, pb2: {}, pbLabel: '-', pbLabel2: '-', pbTo: null, pbTo2: null, qpd: {}, qpdErr: null, pbState: 'load', pbErr: '', snap: null, file: null, imp: null, impOpen: false, run: 0 };

  // ---------------- gaya (mengikuti tema web: indigo + hijau, kartu putih) ----------------
  function css() {
    if (Q('#sdCss')) return;
    const s = document.createElement('style'); s.id = 'sdCss';
    s.textContent = `
#vPoTakaki .sd-head{display:flex;align-items:center;gap:10px;padding:8px 12px;margin-top:8px;border:1px solid var(--bd);border-radius:10px;background:linear-gradient(135deg,#f1f0ff,#e8f7ee)}\n#vPoTakaki .sd-ico{width:30px;height:30px;border-radius:8px;background:var(--br);color:#fff;display:grid;place-items:center;flex:none}\n#vPoTakaki .sd-ico svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2}\n#vPoTakaki .sd-t{font-weight:800;font-size:14px;color:var(--br)}#vPoTakaki .sd-s{font-size:11px;color:var(--mu)}\n#vStokDcf .sd-card{background:#fff;border:1px solid var(--bd);border-radius:10px;padding:8px 10px;margin-top:8px}
#vStokDcf .sd-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;margin-top:8px;border:1px solid var(--bd);border-radius:10px;background:linear-gradient(135deg,#f1f0ff,#eef9f2);border-left:4px solid var(--br)}
#vStokDcf .sd-ico{width:30px;height:30px;border-radius:8px;background:var(--br);color:#fff;display:grid;place-items:center;flex:none}
#vStokDcf .sd-ico svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#vStokDcf .sd-t{font-weight:800;font-size:14px;letter-spacing:.03em;color:var(--br);line-height:1.2}
#vStokDcf .sd-s{font-size:11px;color:var(--mu)}
#vStokDcf .sd-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:99px;background:#fff;border:1px solid #cfe5d6;font-size:11px;font-weight:700;color:var(--br2)}
#vStokDcf .sd-badge svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2}
#vStokDcf .sd-wrap{overflow-x:auto;overflow-y:hidden;margin-top:8px;border:1px solid var(--bd);border-radius:9px;background:#fff;display:inline-block;max-width:100%;vertical-align:top}
#vStokDcf table.sd-tb{border-collapse:separate;border-spacing:0;font-size:11.5px;line-height:1.25}
#vStokDcf .sd-tb th{background:var(--br);color:#fff;padding:3px 7px;font-size:10.5px;font-weight:700;white-space:nowrap;text-align:center;height:21px;border-right:1px solid rgba(255,255,255,.18);letter-spacing:.02em}
#vStokDcf .sd-tb th.sp,#vStokDcf .sd-tb th.sp[rowspan="2"],#vStokDcf .sd-tb td.sp{width:8px;min-width:0;max-width:8px;padding:0;background:#fff!important;border-right:0;border-bottom-color:transparent}
#vStokDcf .sd-tb tbody tr:nth-child(even) td.sp,#vStokDcf .sd-tb tbody tr.core td.sp{background:#fff!important}
#vStokDcf .sd-tb th.g{background:#2f9f61}
#vStokDcf .sd-tb th[rowspan="2"]{white-space:normal;line-height:1.15;min-width:44px}
#vStokDcf .sd-tb td{padding:1px 7px;border-bottom:1px solid #e6eee9;white-space:nowrap;text-align:right;height:20px}
#vStokDcf .sd-tb td.l{text-align:left}#vStokDcf .sd-tb td.c{text-align:center}
#vStokDcf .sd-tb tbody tr:nth-child(even) td{background:#fafcfb}
#vStokDcf .sd-tb tbody tr.core td{background:#e3f5e8}
#vStokDcf .sd-tb tbody tr.y td{background:#fff8cc}
#vStokDcf .sd-tb tbody tr.r td{background:#fde4e6}
#vStokDcf .sd-tb td.z{background:#fde4e6!important;color:#9c0006;font-weight:700}
#vStokDcf .sd-tb td.rr{color:#9c0006;font-weight:700}
#vStokDcf .sd-tb tr.tot td{background:#d9f0e2;font-weight:800;color:var(--br);border-top:1px solid #b9dcc6}
#vStokDcf .sd-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--mu);padding:6px 2px 0;align-items:center}
#vStokDcf .sd-sw{display:inline-block;width:12px;height:12px;border-radius:3px;border:1px solid rgba(0,0,0,.15);vertical-align:-2px;margin-right:4px}
#vStokDcf .sd-sw.g{background:#e3f5e8}#vStokDcf .sd-sw.y{background:#fff8cc}#vStokDcf .sd-sw.r{background:#fde4e6}
#vStokDcf input.sd-c{width:58px;border:0;border-radius:4px;background:transparent;text-align:right;font:inherit;padding:1px 3px}
#vStokDcf input.sd-c:hover{background:rgba(55,48,163,.07)}#vStokDcf input.sd-c:focus{outline:2px solid #34b96f;background:#fff}
#vStokDcf input.sd-c::placeholder{color:#9aa8a0}
#vStokDcf input[type=checkbox].sd-ck{accent-color:#2f9f61;width:14px;height:14px;cursor:pointer;vertical-align:middle}
#vStokDcf .sd-row{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}
#vStokDcf .sd-row .in{width:auto;padding:3px 7px}
#vStokDcf .sd-dt{cursor:pointer}
#vStokDcf .sd-dt:hover{background:#4b43c4}
#vStokDcf .sd-dt input.sd-dh{width:128px;font:inherit;font-size:11px;padding:1px 3px;border:0;border-radius:4px;background:#fff;color:#111}
#vStokDcf .sd-x{margin-left:5px;opacity:.55;font-size:12px;line-height:1}#vStokDcf .sd-x:hover{opacity:1;color:#ffd2d6}
#vStokDcf textarea.sd-ta{width:100%;min-height:80px;font:12px/1.35 ui-monospace,Consolas,monospace;border:1px solid var(--bd);border-radius:8px;padding:6px 8px;resize:vertical}
#vStokDcf .sd-ok{color:#15803d}#vStokDcf .sd-er{color:#b00020}
`;
    document.head.appendChild(s);
  }

  // ---------------- data ----------------
  async function loadAll() {
    const s = sbc();
    const [it, ed, po, sl, qp] = await Promise.all([
      s.from('stokdcf_item').select('*').order('urut'),
      s.from('stokdcf_ed').select('*').order('tgl_exp').limit(10000),
      s.from('stokdcf_po').select('tgl,plu_dc,qty').limit(20000),
      s.rpc('stokdcf_sales'), s.rpc('stokdcf_qpd')]);
    X.items = must(it); X.ed = must(ed);
    X.poM = new Map(); must(po).forEach(r => X.poM.set(r.tgl + '|' + r.plu_dc, Number(r.qty) || 0));
    X.sales = {}; X.salesErr = sl.error ? sl.error.message : null;
    if (!sl.error) (sl.data || []).forEach(r => { X.sales[String(r.plu).trim()] = Number(r.qty) || 0; });
    X.qpd = {}; X.qpdErr = qp.error ? qp.error.message : null;
    if (!qp.error) (qp.data || []).forEach(r => { X.qpd[String(r.plu).trim()] = { qpd: Number(r.qpd) || 0, frc: Number(r.frc) || 0 }; });
    X.snap = X.ed.length ? X.ed.reduce((m, b) => b.tgl_data > m ? b.tgl_data : m, '0000-00-00') : null;
    X.ready = true;
  }
  // PB = jumlah PB yang DIKIRIM. Minggu berjalan: sehari setelah tanggal stock s/d Sabtu (stock 9 Nov -> kirim 10-14 Nov).
  // Minggu depan: Senin s/d Sabtu berikutnya (16-21 Nov). Hari Minggu (15 Nov) tidak ada pengiriman.
  // loadPB dibungkus: simpan promise (agar halaman lain menunggu, bukan memanggil ulang) dan waktu muat (cache)
  function loadPB(run) { const p = loadPB0(run); X.pbP = p; return p; }
  async function loadPB0(run) {
    X.pbState = 'load'; X.pbErr = ''; X.pb = {}; X.pb2 = {};
    const from = X.snap ? addD(X.snap, 1) : null;
    if (!from) { X.pbLabel = X.pbLabel2 = '-'; X.pbTo = X.pbTo2 = null; X.pbState = 'ok'; return; }
    const dow = isoDow(from), to = addD(from, dow === 7 ? 6 : 6 - dow), from2 = addD(to, 2), to2 = addD(to, 7);
    X.pbTo = to; X.pbLabel = lab(from, to); X.pbTo2 = to2; X.pbLabel2 = lab(from2, to2);
    try {
      const tryGet = async w => { try { return await callApi('getOutbound', [gTok(), false, w]); } catch (e) { if (/timeout|canceling/i.test(String(e && e.message || e))) { await new Promise(r => setTimeout(r, 1500)); return callApi('getOutbound', [gTok(), false, w]); } throw e; } };   // 1x ulang bila timeout
      const get = w => tryGet(w).catch(() => null);
      const res = await Promise.all([get('cur'), get('next')]);
      if (run !== X.run) return;
      if (!res[0] && !res[1]) throw new Error('data PB (outbound) tidak bisa dimuat');
      const seen = new Set();
      res.forEach(R => {
        if (!R || !R.dates || !R.dates.length) return;
        const ks = [];   // [indeks kolom, minggu 1/2]
        R.dates.forEach((d, k) => { if (seen.has(d)) return; const wk = d >= from && d <= to ? 1 : (d >= from2 && d <= to2 ? 2 : 0); if (wk) { seen.add(d); ks.push([k, wk]); } });
        (R.items || []).forEach(i => {
          const p = String(i.plu).trim();
          ks.forEach(([k, wk]) => { const v = Number(i.pb && i.pb[k]) || 0; if (!v) return; const o = wk === 1 ? X.pb : X.pb2; o[p] = (o[p] || 0) + v; });
        });
      });
      X.pbState = 'ok'; X.pbAt = Date.now();
    } catch (e) { if (run !== X.run) return; X.pbState = 'err'; X.pbErr = e.message; }
  }
  const stokOf = pc => X.ed.reduce((t, b) => String(b.plu_cust).trim() === pc ? t + Number(b.stok || 0) : t, 0);
  // urutan item (dipakai Stock dan Rekap PO): core dulu, lalu sales tertinggi
  const ordered = () => X.items.filter(i => i.aktif).sort((a, b) =>
    (Number(!!b.core) - Number(!!a.core)) || ((X.sales[String(b.plu_dc).trim()] || 0) - (X.sales[String(a.plu_dc).trim()] || 0)) || (a.urut - b.urut));

  // ---------------- kerangka ----------------
  const root = () => Q('#vStokDcf');
  const head = (icon, title, sub, badge) => '<div class="sd-head"><span class="sd-ico">' + ic(icon) + '</span><div><div class="sd-t">' + title + '</div><div class="sd-s">' + sub + '</div></div><span style="flex:1"></span>' + (badge || '') + '</div>';
  const badge = (t, icon) => '<span class="sd-badge">' + (icon ? ic(icon) : '') + t + '</span>';

  function shell() {
    css();
    const tabs = [['ed', 'Data Exp Date'], ['stok', 'Stock'], ['po', 'Rekap PO']];
    root().innerHTML = '<div class="card" style="padding:8px 12px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 style="margin:0;color:var(--br);font-size:15px">Stock DCF</h3><span id="sdSub" class="note" style="padding:0"></span><span style="flex:1"></span>'
      + '<span id="sdSeg" style="display:inline-flex;gap:4px">' + tabs.map(t => '<button class="b ' + (X.tab === t[0] ? 'p' : 's') + '" data-t="' + t[0] + '">' + t[1] + '</button>').join('') + '</span>'
      + '<button class="b s" id="sdRl">Muat ulang</button></div></div><div id="sdBody"></div>';
    Q('#sdSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; X.tab = b.dataset.t; shell(); paint(); };
    Q('#sdRl').onclick = () => start();
  }
  function paint() {
    if (!X.ready) return;
    const b = Q('#sdBody'); if (!b) return; b.onchange = b.onclick = b.onpaste = null;
    Q('#sdSub').textContent = X.snap ? 'Data ED per ' + fdl(X.snap) + ' · satuan CTN' : 'Belum ada data ED — unggah di sub halaman Data ED';
    ({ ed: paintED, po: paintPO }[X.tab] || paintStok)();
  }

  // ===== Sub halaman: Stock =====
  // Est. STOCK (Sabtu) = STOCK - PB (min. 0). PO on going dipakai: tanggal <= Sabtu - 3 hari (stock 14 Nov -> PO tgl 7-11 Nov).
  // Est. STOCK (h-1 jadwal kirim minggu depan, mis. 15 Nov) = Est. STOCK Sabtu + total PO on going tersebut.
  // Est. STOCK (h-1 jadwal kirim berikutnya, mis. 22 Nov) = (Est. STOCK 15 Nov - PB minggu depan, min. 0) + PO on going tanggal 12-18 Nov.
  // QPD (Ctn) = sales per hari (pcs) / FRC.  DSI = STOCK / QPD (Ctn).
  function calcStok() {
    const to = X.pbTo, to2 = X.pbTo2, cut1 = to ? addD(to, -3) : null, cut2 = to2 ? addD(to2, -3) : null;
    const cols = poCols(), pcols = cut1 ? cols.filter(d => d <= cut1) : [], p2cols = cut1 ? cols.filter(d => d > cut1 && d <= cut2) : [];
    const rows = ordered().map(i => {
      const k = String(i.plu_dc).trim(), qty = stokOf(String(i.plu_cust).trim()), pb = X.pb[k] || 0, pb2 = X.pb2[k] || 0, sisa = Math.max(0, qty - pb);
      const pov = pcols.map(d => poQ(d, i.plu_dc)), po = pov.reduce((t, v) => t + v, 0), est2 = sisa + po;
      const sisa2 = Math.max(0, est2 - pb2), po2 = p2cols.reduce((t, d) => t + poQ(d, i.plu_dc), 0);
      const q = X.qpd[k] || { qpd: 0, frc: 0 }, qc = q.frc > 0 ? q.qpd / q.frc : 0;
      return { i, qty, pb, sisa, pov, est2, pb2, sisa2, po2, est3: sisa2 + po2, qc, dsi: qc > 0 ? qty / qc : null };
    });
    return { to, to2, cut1, cut2, pcols, p2cols, rows };
  }
  // Download JPG: kolom NO s/d DSI (tabel dibuat ulang dengan gaya inline lalu digambar ke canvas)
  async function downloadJpg() {
    const b = Q('#sdJpg'); if (b) b.disabled = true;
    try {
      const C = calcStok(), FF = 'font-family:Calibri,Arial,sans-serif;', bd = 'border:1px solid #cdd3e6;', pd = 'padding:3px 8px;';
      const th = t => '<th style="' + FF + bd + pd + 'background-color:#3730a3;color:#ffffff;font-size:12px;font-weight:bold;white-space:nowrap;text-align:center">' + t + '</th>';
      const td = (t, bg, st) => '<td style="' + FF + bd + pd + 'background-color:' + bg + ';font-size:12px;white-space:nowrap;' + (st || '') + '">' + t + '</td>';
      const q1 = v => v ? (v >= 10 ? n0(v) : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })) : '-';
      let tq = 0, tc = 0;
      let h = '<div style="' + FF + 'display:inline-block;background-color:#ffffff;padding:8px"><div style="font-weight:bold;font-size:17px;color:#3730a3">MONITORING STOK DCF JATIM</div>'
        + '<div style="font-size:12px;color:#475569;padding-bottom:4px">Stok DCF ' + E(X.snap ? fdl(X.snap) : '-') + ' · satuan CTN</div>'
        + '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse"><thead><tr>' + ['NO', 'PLU', 'DESKRIPSI', 'STOCK', 'QPD (Ctn)', 'DSI'].map(th).join('') + '</tr></thead><tbody>';
      C.rows.forEach((r, n) => {
        const bg = r.i.core ? '#e3f5e8' : (n % 2 ? '#fafcfb' : '#ffffff'); tq += r.qty; tc += r.qc;
        h += '<tr>' + td(n + 1, bg, 'text-align:center') + td(E(r.i.plu_dc), bg) + td(E(r.i.deskripsi), bg) + td(n0(r.qty), bg, 'text-align:right') + td(q1(r.qc), bg, 'text-align:right') + td(r.dsi == null ? '-' : n0(r.dsi), bg, 'text-align:right') + '</tr>';
      });
      const TB = '#d9f0e2', ts = 'text-align:right;font-weight:bold;';
      h += '<tr>' + td('Grand Total', TB, 'font-weight:bold').replace('<td ', '<td colspan="3" ') + td(n0(tq), TB, ts) + td(q1(tc), TB, ts) + td(tc > 0 ? n0(tq / tc) : '-', TB, ts) + '</tr></tbody></table>'
        + '<div style="font-size:10px;color:#64748b;padding-top:3px">QPD (Ctn) = sales per hari ÷ FRC · DSI = STOCK ÷ QPD (Ctn) · baris hijau = item core</div></div>';
      const hold = document.createElement('div'); hold.style.cssText = 'position:fixed;left:-99999px;top:0'; hold.innerHTML = h; document.body.appendChild(hold);
      const el = hold.firstElementChild, w = Math.ceil(el.offsetWidth) + 2, ht = Math.ceil(el.offsetHeight) + 2; hold.remove();
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + ht + '"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">' + h.replace(/&nbsp;/g, '&#160;') + '</div></foreignObject></svg>';
      const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('gagal merender gambar')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      const sc = Math.max(1, Math.min(3, Math.floor(14000 / Math.max(w, ht)))), c = document.createElement('canvas'); c.width = w * sc; c.height = ht * sc;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.scale(sc, sc); g.drawImage(img, 0, 0);
      const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', .93)); if (!blob) throw new Error('gagal membuat JPG');
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Stock DCF ' + (X.snap || '') + '.jpg'; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (e) { msg('Gagal membuat JPG: ' + e.message, true); }
    if (b) b.disabled = false;
  }
  function paintStok() {
    const A = adm(), load = X.pbState === 'load', C = calcStok(), { to, to2, pcols, p2cols, rows } = C;
    const e1 = to ? dmm(to) : '-', e2 = to ? dmm(addD(to, 1)) : '-', e3 = to2 ? dmm(addD(to2, 1)) : '-';
    const T = rows.reduce((t, r) => { t.qty += r.qty; t.qc += r.qc; t.pb += r.pb; t.sisa += r.sisa; t.est2 += r.est2; t.pb2 += r.pb2; t.po2 += r.po2; t.est3 += r.est3; r.pov.forEach((v, k) => { t.pov[k] += v; }); return t; },
      { qty: 0, qc: 0, pb: 0, sisa: 0, est2: 0, pb2: 0, po2: 0, est3: 0, pov: pcols.map(() => 0) });
    const L = v => load ? '…' : n0(v), dash = v => v ? n0(v) : '-';
    const q1 = v => v ? (v >= 10 ? n0(v) : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })) : '-';
    const po2lab = to ? (p2cols.length ? lab(p2cols[0], p2cols[p2cols.length - 1]) : lab(addD(C.cut1, 1), C.cut2)) : '-';
    let h = head('package', 'MONITORING STOK DCF JATIM', 'Stok DCF ' + (X.snap ? E(fdl(X.snap)) : '-'), badge('PB kirim ' + E(X.pbLabel), 'cal') + ' <button class="b s" id="sdJpg" title="Unduh kolom NO sampai DSI sebagai gambar">' + ic('image') + ' Download JPG</button>')
      + '<div class="sd-wrap"><table class="sd-tb"><thead><tr><th rowspan="2">NO</th><th rowspan="2">PLU</th><th rowspan="2">DESKRIPSI</th><th rowspan="2">STOCK</th>'
      + '<th rowspan="2" title="Sales per hari dibagi FRC">QPD<br>(Ctn)</th><th rowspan="2" title="Stock dibagi QPD (Ctn)">DSI</th><th rowspan="2" class="sp"></th>'
      + '<th>PB</th><th rowspan="2">Est. STOCK<br>' + E(e1) + '</th>'
      + (pcols.length ? '<th colspan="' + pcols.length + '" class="g">PO ON GOING</th>' : '')
      + '<th rowspan="2">Est. STOCK<br>' + E(e2) + '</th>'
      + '<th>PB</th><th class="g">PO ON GOING</th><th rowspan="2">Est. STOCK<br>' + E(e3) + '</th>'
      + (A ? '<th rowspan="2" title="Centang untuk menjadikan item core">CORE</th>' : '') + '</tr>'
      + '<tr><th>' + E(X.pbLabel) + '</th>' + pcols.map(d => '<th class="g">' + E(dm(d)) + '</th>').join('') + '<th>' + E(X.pbLabel2) + '</th><th class="g">' + E(po2lab) + '</th></tr></thead><tbody>'
      + rows.map((r, n) => '<tr class="' + (r.i.core ? 'core' : '') + '"><td class="c">' + (n + 1) + '</td><td class="l">' + E(r.i.plu_dc) + '</td><td class="l">' + E(r.i.deskripsi) + '</td>'
        + '<td>' + n0(r.qty) + '</td><td>' + q1(r.qc) + '</td><td>' + (r.dsi == null ? '-' : n0(r.dsi)) + '</td><td class="sp"></td>'
        + '<td>' + L(r.pb) + '</td>'
        + '<td class="' + (!load && r.sisa === 0 ? 'z' : '') + '">' + L(r.sisa) + '</td>'
        + r.pov.map(v => '<td>' + dash(v) + '</td>').join('')
        + '<td style="font-weight:700">' + L(r.est2) + '</td>'
        + '<td>' + L(r.pb2) + '</td><td>' + dash(r.po2) + '</td>'
        + '<td class="' + (!load && r.sisa2 === 0 && r.po2 === 0 ? 'z' : '') + '" style="font-weight:700">' + L(r.est3) + '</td>'
        + (A ? '<td class="c"><input type="checkbox" class="sd-ck" data-core="' + E(r.i.plu_dc) + '"' + (r.i.core ? ' checked' : '') + '></td>' : '') + '</tr>').join('')
      + '<tr class="tot"><td class="l" colspan="3">Grand Total</td><td>' + n0(T.qty) + '</td><td>' + q1(T.qc) + '</td><td>' + (T.qc > 0 ? n0(T.qty / T.qc) : '-') + '</td><td class="sp"></td>'
      + '<td>' + L(T.pb) + '</td><td>' + L(T.sisa) + '</td>'
      + T.pov.map(v => '<td>' + dash(v) + '</td>').join('') + '<td>' + L(T.est2) + '</td>'
      + '<td>' + L(T.pb2) + '</td><td>' + dash(T.po2) + '</td><td>' + L(T.est3) + '</td>' + (A ? '<td></td>' : '') + '</tr>'
      + '</tbody></table></div>'
      + '<div class="sd-leg"><span><i class="sd-sw g"></i>Item core</span>'
      + (X.pbState === 'err' ? '<span class="sd-er">PB belum bisa dimuat (' + E(X.pbErr) + ') — klik Muat ulang.</span>' : '')
      + (X.qpdErr ? '<span class="sd-er">QPD tidak terbaca (' + E(X.qpdErr) + ') — jalankan fungsi <b>stokdcf_qpd</b> di Supabase.</span>' : '')
      + (X.salesErr ? '<span class="sd-er">Sales tidak terbaca (' + E(X.salesErr) + ') — urutan sementara sesuai master.</span>' : '') + '</div>';
    Q('#sdBody').innerHTML = h;
    Q('#sdJpg').onclick = downloadJpg;
    if (A) Q('#sdBody').onchange = async e => {
      const t = e.target; if (!t.hasAttribute('data-core')) return;
      const p = t.dataset.core, v = t.checked;
      const r = await sbc().from('stokdcf_item').update({ core: v }).eq('plu_dc', p);
      if (r.error) { msg('Gagal menyimpan: ' + r.error.message, true); t.checked = !v; return; }
      const it = X.items.find(i => String(i.plu_dc) === p); if (it) it.core = v;
      paintStok();
    };
  }

  // ===== Sub halaman: Data ED =====
  const toISO = v => {
    if (v instanceof Date) return isNaN(v) ? null : iso(v);
    const s = String(v == null ? '' : v).trim(); let m;
    if ((m = s.match(/^(\d{4})(\d\d)(\d\d)$/))) return m[1] + '-' + m[2] + '-' + m[3];
    if ((m = s.match(/^(\d{4})-(\d\d)-(\d\d)/))) return m[0];
    if ((m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/))) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return null;
  };
  const cv = c => { let v = c && c.value; if (v && typeof v === 'object' && !(v instanceof Date)) v = 'result' in v ? v.result : (v.richText ? v.richText.map(x => x.text).join('') : null); return v; };
  const dayDiff = (a, b) => a && b ? Math.round((pd(b) - pd(a)) / 864e5) : null;
  async function loadEJ() {
    if (window.ExcelJS) return window.ExcelJS;
    await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'; s.onload = ok; s.onerror = () => no(new Error('Pustaka Excel gagal dimuat.')); document.head.appendChild(s); });
    return window.ExcelJS;
  }
  // baca sheet "data ED": tanggal B2, PLU_CUST kolom A, deskripsi B, stok C, inbound J (cadangan D), ED K (cadangan E)
  function parseED(ws) {
    const rows = [];
    ws.eachRow((row, rn) => {
      if (rn < 4) return;
      const pc = String(cv(row.getCell(1)) || '').trim(); if (!pc) return;
      const stok = Number(cv(row.getCell(3))) || 0, ds = String(cv(row.getCell(2)) || '').trim();
      if (!ds && !stok) return;
      rows.push({ plu_cust: pc, deskripsi: ds, stok, tgl_inbound: toISO(cv(row.getCell(10))) || toISO(cv(row.getCell(4))), tgl_exp: toISO(cv(row.getCell(11))) || toISO(cv(row.getCell(5))) });
    });
    return rows;
  }
  async function pickFile(f) {
    const st = Q('#sdFs'); if (!f) return; st.textContent = 'Membaca file…'; X.file = null;
    try {
      const EJ = await loadEJ(), wb = new EJ.Workbook(); await wb.xlsx.load(await f.arrayBuffer());
      const ws = wb.worksheets.find(w => /data\s*ed/i.test(w.name)); if (!ws) throw new Error('Sheet "data ED" tidak ditemukan di file ini.');
      const rows = parseED(ws); if (!rows.length) throw new Error('Tidak ada baris data di sheet data ED.');
      X.file = { name: f.name, rows };
      const t = toISO(cv(ws.getCell('B2'))); if (t) Q('#sdTgl').value = t;
      st.textContent = f.name + ' — ' + n0(rows.length) + ' baris, total ' + n0(rows.reduce((a, r) => a + r.stok, 0)) + ' ctn. Periksa tanggal lalu klik Simpan.';
      Q('#sdSave').disabled = false;
    } catch (e) { st.textContent = ''; Q('#sdSave').disabled = true; msg('Gagal: ' + e.message, true); }
  }
  async function saveED() {
    const tgl = Q('#sdTgl').value; if (!X.file) return msg('Pilih file dulu', true); if (!tgl) return msg('Isi tanggal data dulu', true);
    const b = Q('#sdSave'); b.disabled = true; b.textContent = 'Menyimpan…';
    try {
      const s = sbc(), rows = X.file.rows.map(r => Object.assign({ tgl_data: tgl }, r));
      must(await s.from('stokdcf_ed').delete().gt('id', 0));
      for (let i = 0; i < rows.length; i += 200) must(await s.from('stokdcf_ed').insert(rows.slice(i, i + 200)));
      X.file = null; msg(n0(rows.length) + ' baris data ED per ' + fd(tgl) + ' tersimpan'); await start();
    } catch (e) { msg('Gagal menyimpan: ' + e.message, true); b.disabled = false; b.textContent = 'Simpan'; }
  }
  function paintED() {
    const known = new Set(X.items.filter(i => i.aktif).map(i => String(i.plu_cust).trim()));
    const th = t => '<th>' + t + '</th>';
    const A = adm();
    let h = head('cal', 'DATA EXP DATE', X.snap ? 'Per ' + E(fdl(X.snap)) + ' · ' + n0(X.ed.length) + ' baris' : 'Belum ada data', X.snap ? badge('Tanggal data ' + E(fd(X.snap)), 'cal') : '')
      + (!A ? '' : '<div class="sd-card"><div class="sd-row"><div><label class="k">File Monitoring Stock Takaki (.xlsx)</label><br><input type="file" id="sdF" accept=".xlsx"></div>'
      + '<div><label class="k">Tanggal data</label><br><input type="date" class="in" id="sdTgl" value="' + (X.snap || '') + '" style="width:140px"></div>'
      + '<button class="b p" id="sdSave" disabled>Simpan</button>'
      + (X.snap ? '<button class="b s" id="sdTglOnly" title="Ubah tanggal data yang sudah tersimpan tanpa unggah ulang">Ubah tanggal saja</button>' : '') + '</div>'
      + '<div id="sdFs" class="note" style="padding:5px 0 0"></div>'
      + '<div class="note" style="padding:2px 0 0">Hanya sheet <b>data ED</b> di file yang dibaca (PLU_CUST kolom A, deskripsi B, stok C, inbound J, ED K). Tanggal terisi dari sel B2 dan bisa diubah. Data ED lama diganti.</div></div>');
    if (X.ed.length) {
      const rows = X.ed.map((b, n) => {
        const pc = String(b.plu_cust).trim();
        return { b, n, pc, aktif: known.has(pc), ms: dayDiff(b.tgl_inbound, b.tgl_exp), sh: dayDiff(X.snap, b.tgl_exp) };
      }).sort((a, b) => (Number(b.aktif) - Number(a.aktif)) || (a.n - b.n));   // yang tidak AKTIF di paling bawah
      h += '<div class="sd-wrap"><table class="sd-tb"><thead><tr>' + ['PLU_CUST', 'DESKRIPSI', 'STOK', 'INBOUND', 'EXP DATE', 'MASA SIMPAN', 'SISA HARI SIMPAN'].concat(A ? ['AKTIF'] : []).map(th).join('') + '</tr></thead><tbody>'
        + rows.map(r => {
          const cls = r.sh != null && r.sh < 30 ? 'r' : (r.sh != null && r.sh < 40 ? 'y' : '');
          return '<tr class="' + cls + '"><td class="l">' + E(r.pc) + '</td><td class="l">' + E(r.b.deskripsi) + '</td><td>' + n0(r.b.stok) + '</td>'
            + '<td class="c">' + E(fd(r.b.tgl_inbound)) + '</td><td class="c">' + E(fd(r.b.tgl_exp)) + '</td>'
            + '<td>' + (r.ms == null ? '' : r.ms + ' Hari') + '</td>'
            + '<td' + (cls === 'r' ? ' class="rr"' : '') + '>' + (r.sh == null ? '' : r.sh + ' Hari') + '</td>'
            + (A ? '<td class="c">' + (r.aktif ? 'AKTIF' : '') + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>'
        + '<div class="sd-leg"><span><i class="sd-sw y"></i>Sisa hari simpan di bawah 40 hari</span><span><i class="sd-sw r"></i>Di bawah 30 hari</span>' + (A ? '<span>Baris tanpa keterangan AKTIF ada di paling bawah</span>' : '') + '</div>';
    }
    Q('#sdBody').innerHTML = h;
    if (!A) return;
    Q('#sdF').onchange = e => pickFile(e.target.files[0]);
    Q('#sdSave').onclick = saveED;
    const o = Q('#sdTglOnly'); if (o) o.onclick = async () => {
      const t = Q('#sdTgl').value; if (!t) return msg('Isi tanggal dulu', true);
      const r = await sbc().from('stokdcf_ed').update({ tgl_data: t }).gt('id', 0);
      if (r.error) return msg('Gagal: ' + r.error.message, true); msg('Tanggal data diubah'); start();
    };
  }

  // ===== Sub halaman: Rekap PO =====
  const poCols = () => [...new Set([...X.poM.keys()].map(k => k.split('|')[0]))].sort();
  const poQ = (d, p) => X.poM.get(d + '|' + p) || 0;
  const ymd = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? iso(t) : null; };
  const y4 = y => y < 100 ? 2000 + y : y;
  const guessYear = (mo0, d) => { const y = new Date().getUTCFullYear(); return [y - 1, y, y + 1].sort((a, b) => Math.abs(Date.UTC(a, mo0, d) - Date.now()) - Math.abs(Date.UTC(b, mo0, d) - Date.now()))[0]; };
  function dateOf(v) {
    if (v instanceof Date) return isNaN(v) ? null : iso(v);
    if (typeof v === 'number') return v > 30000 && v < 80000 ? iso(new Date(Math.round((v - 25569) * 864e5))) : null;
    const s = String(v == null ? '' : v).trim(); if (!s) return null; let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ymd(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/))) return ymd(y4(+m[3]), +m[2], +m[1]);
    if ((m = s.match(/^(\d{1,2})[\s\-\/]*([A-Za-z]{3,9})\.?(?:[\s\-\/,]*(\d{2,4}))?$/))) {
      const mo = MONI[m[2].slice(0, 3).toLowerCase()]; if (mo == null) return null;
      return ymd(m[3] ? y4(+m[3]) : guessYear(mo, +m[1]), mo + 1, +m[1]);
    }
    if ((m = s.match(/^(\d{1,2})[\/-](\d{1,2})$/))) return ymd(guessYear(+m[2] - 1, +m[1]), +m[2], +m[1]);
    return null;
  }
  function num(s) {
    if (typeof s === 'number') return s >= 0 ? s : NaN;
    s = String(s == null ? '' : s).trim().replace(/\s/g, ''); if (!s || /^[-–—]+$/.test(s)) return 0;
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
    const v = Number(s.replace(',', '.')); return isFinite(v) && v >= 0 ? v : NaN;
  }
  function splitLine(l, d) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === d) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur); return out;
  }
  function splitRows(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '');
    const all = lines.join('\n'), d = lines.some(l => l.includes('\t')) ? '\t' : ((all.match(/;/g) || []).length > (all.match(/,/g) || []).length ? ';' : ',');
    return lines.map(l => splitLine(l, d));
  }
  // rows = array of array. Baris judul = baris pertama yang berisi tanggal; baris data = PLU (kolom 1) atau deskripsi (kolom 2) yang cocok dengan item.
  function parsePORows(rows) {
    let h = -1, dc = [];
    for (let i = 0; i < rows.length; i++) { const ds = rows[i].map(dateOf); if (ds.some(x => x)) { h = i; dc = ds.map((d, j) => d ? j : -1).filter(j => j >= 0); break; } }
    if (h < 0) throw new Error('Baris tanggal tidak ditemukan. Baris judul harus berisi tanggal seperti 7-Nov, 8-Nov, …');
    const dates = dc.map(j => dateOf(rows[h][j]));
    if (new Set(dates).size !== dates.length) throw new Error('Ada tanggal ganda di baris judul.');
    const act = X.items.filter(i => i.aktif), byP = new Map(act.map(i => [String(i.plu_dc).trim(), i])), byD = new Map(act.map(i => [norm(i.deskripsi), i]));
    const vals = new Map(), unknown = []; let bad = 0;
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i], a = String(r[0] == null ? '' : r[0]).trim(), b = String(r[1] == null ? '' : r[1]).trim();
      if ((!a && !b) || /total/i.test(a) || /total/i.test(b)) continue;
      const it = byP.get(a) || byD.get(norm(b)) || byD.get(norm(a));
      if (!it) { unknown.push(a || b); continue; }
      vals.set(it.plu_dc, dc.map(j => { const n = num(r[j]); if (isNaN(n)) { bad++; return 0; } return n; }));
    }
    if (!vals.size) throw new Error('Tidak ada PLU/deskripsi yang cocok dengan daftar item.');
    return { dates, vals, unknown, bad };
  }
  function analyze(rows) {
    const st = Q('#sdImpS'), ap = Q('#sdApply'); X.imp = null; ap.disabled = true;
    try {
      const imp = parsePORows(rows); X.imp = imp;
      st.className = 'note sd-ok'; st.textContent = imp.vals.size + ' item · ' + imp.dates.length + ' tanggal (' + dm(imp.dates[0]) + ' s/d ' + dm(imp.dates[imp.dates.length - 1]) + ')'
        + (imp.unknown.length ? ' · dilewati karena tidak dikenal: ' + imp.unknown.slice(0, 5).join(', ') + (imp.unknown.length > 5 ? '…' : '') : '')
        + (imp.bad ? ' · ' + imp.bad + ' sel bukan angka dianggap 0' : '') + '. Item yang tidak ada di tempelan diisi 0. Klik Terapkan.';
      ap.disabled = false;
    } catch (e) { st.className = 'note sd-er'; st.textContent = e.message; }
  }
  async function readPoFile(f) {
    if (!f) return; const st = Q('#sdImpS'); st.className = 'note'; st.textContent = 'Membaca file…';
    try {
      let rows;
      if (/\.xlsx$/i.test(f.name)) {
        const EJ = await loadEJ(), wb = new EJ.Workbook(); await wb.xlsx.load(await f.arrayBuffer());
        const ws = wb.worksheets.find(w => /po/i.test(w.name)) || wb.worksheets[0]; rows = [];
        ws.eachRow({ includeEmpty: false }, row => { const a = []; for (let c = 1; c <= Math.max(row.cellCount, 1); c++) a.push(cv(row.getCell(c))); rows.push(a); });
      } else rows = splitRows(await f.text());
      Q('#sdTa').value = ''; analyze(rows);
    } catch (e) { st.className = 'note sd-er'; st.textContent = 'Gagal membaca file: ' + e.message; }
  }
  async function applyImp() {
    const imp = X.imp; if (!imp) return; const mode = Q('#sdMode').value, b = Q('#sdApply'); b.disabled = true; b.textContent = 'Menyimpan…';
    try {
      const s = sbc(), rows = [];
      ordered().forEach(it => imp.dates.forEach((d, k) => rows.push({ tgl: d, plu_dc: it.plu_dc, qty: (imp.vals.get(it.plu_dc) || [])[k] || 0 })));
      for (let i = 0; i < rows.length; i += 400) must(await s.from('stokdcf_po').upsert(rows.slice(i, i + 400), { onConflict: 'tgl,plu_dc' }));
      if (mode === 'replace') must(await s.from('stokdcf_po').delete().not('tgl', 'in', '(' + imp.dates.join(',') + ')'));
      X.imp = null; X.impOpen = false; await loadAll(); msg('Rekap PO tersimpan (' + imp.dates.length + ' tanggal)'); paint();
    } catch (e) { msg('Gagal menyimpan: ' + e.message, true); b.disabled = false; b.textContent = 'Terapkan'; }
  }
  function fillTotals() {
    const cols = poCols(), act = ordered(); let gt = 0;
    act.forEach(i => { const t = cols.reduce((a, d) => a + poQ(d, i.plu_dc), 0); gt += t; const el = Q('.sd-rt[data-p="' + i.plu_dc + '"]'); if (el) el.textContent = t ? n0(t) : '-'; });
    cols.forEach(d => { const t = act.reduce((a, i) => a + poQ(d, i.plu_dc), 0), el = Q('.sd-ct[data-d="' + d + '"]'); if (el) el.textContent = t ? n0(t) : '-'; });
    const g = Q('#sdGT'); if (g) g.textContent = gt ? n0(gt) : '-';
  }
  async function addCol() {
    const d = Q('#sdAddD').value; if (!d) return msg('Pilih tanggal dulu', true);
    if (poCols().includes(d)) return msg('Tanggal ' + dm(d) + ' sudah ada', true);
    try {
      must(await sbc().from('stokdcf_po').upsert(ordered().map(i => ({ tgl: d, plu_dc: i.plu_dc, qty: 0 })), { onConflict: 'tgl,plu_dc' }));
      ordered().forEach(i => X.poM.set(d + '|' + i.plu_dc, 0)); paintPO();
    } catch (e) { msg('Gagal: ' + e.message, true); }
  }
  function paintPO() {
    const A = adm(), cols = poCols(), act = ordered();
    const hasD = cols.length > 0;
    let h = head('truck', 'PO TAKAKI JATIM', 'PO on going per tanggal · satuan CTN · urutan item sama dengan halaman Stock',
      hasD ? badge(dm(cols[0]) + ' s/d ' + dm(cols[cols.length - 1]), 'cal') : '')
      + (!A ? '' : '<div class="sd-card"><div class="sd-row"><button class="b p" id="sdOpenImp">' + ic('clip') + ' Tempel / unggah data</button>'
      + '<div><label class="k">Tambah kolom tanggal</label><br><input type="date" class="in" id="sdAddD" style="width:140px"></div><button class="b s" id="sdAddB">+ Tanggal</button>'
      + '<span class="note" style="padding:0 0 4px">Klik angka untuk mengubah · klik tanggal di judul untuk mengganti tanggalnya · × untuk menghapus kolom</span></div></div>')
      + (!A ? '' : '<div class="sd-card" id="sdImp" style="display:' + (X.impOpen ? 'block' : 'none') + '"><label class="k">Tempel dari Excel (blok tabel lengkap: baris tanggal + kolom PLU, DESKRIPSI, tanggal…)</label>'
      + '<textarea class="sd-ta" id="sdTa" placeholder="PLU&#9;DESKRIPSI&#9;7-Nov&#9;8-Nov&#9;…"></textarea>'
      + '<div class="sd-row" style="margin-top:6px"><div><label class="k">atau file CSV / Excel</label><br><input type="file" id="sdPf" accept=".csv,.tsv,.txt,.xlsx"></div>'
      + '<div><label class="k">Cara simpan</label><br><select class="in" id="sdMode"><option value="replace">Ganti seluruh data PO</option><option value="merge">Timpa tanggal yang sama saja</option></select></div>'
      + '<button class="b p" id="sdApply" disabled>Terapkan</button><button class="b s" id="sdCancel">Tutup</button></div>'
      + '<div id="sdImpS" class="note" style="padding:5px 0 0"></div></div>');
    if (!hasD) h += '<div class="sd-card"><div class="note" style="padding:10px;text-align:center">Belum ada data PO.' + (A ? ' Tempel tabel dari Excel / unggah CSV, atau tambahkan kolom tanggal lalu isi angkanya.' : '') + '</div></div>';
    else {
      h += '<div class="sd-wrap"><table class="sd-tb"><thead><tr><th rowspan="2">PLU</th><th rowspan="2">DESKRIPSI</th><th colspan="' + cols.length + '">PO ON GOING</th><th rowspan="2" class="g">TOTAL</th></tr><tr>'
        + cols.map(d => A ? '<th class="sd-dt" data-d="' + d + '" title="Klik untuk mengganti tanggal"><span class="sd-dl">' + dm(d) + '</span><b class="sd-x" data-del="' + d + '" title="Hapus kolom ini">×</b></th>' : '<th>' + dm(d) + '</th>').join('') + '</tr></thead><tbody>'
        + act.map(i => '<tr class="' + (i.core ? 'core' : '') + '"><td class="l">' + E(i.plu_dc) + '</td><td class="l">' + E(i.deskripsi) + '</td>'
          + cols.map(d => { const v = poQ(d, i.plu_dc); return A ? '<td><input class="sd-c" inputmode="numeric" placeholder="-" data-p="' + E(i.plu_dc) + '" data-d="' + d + '" value="' + (v ? v : '') + '"></td>' : '<td>' + (v ? n0(v) : '-') + '</td>'; }).join('')
          + '<td class="sd-rt" data-p="' + E(i.plu_dc) + '" style="font-weight:700"></td></tr>').join('')
        + '<tr class="tot"><td class="l" colspan="2">Grand Total</td>' + cols.map(d => '<td class="sd-ct" data-d="' + d + '"></td>').join('') + '<td id="sdGT"></td></tr>'
        + '</tbody></table></div><div class="sd-leg"><span><i class="sd-sw g"></i>Item core</span></div>';
    }
    Q('#sdBody').innerHTML = h; if (hasD) fillTotals();
    if (!A) return;
    const body = Q('#sdBody'), imp = Q('#sdImp');
    Q('#sdOpenImp').onclick = () => { X.impOpen = !X.impOpen; imp.style.display = X.impOpen ? 'block' : 'none'; if (X.impOpen) Q('#sdTa').focus(); };
    Q('#sdCancel').onclick = () => { X.impOpen = false; X.imp = null; imp.style.display = 'none'; };
    Q('#sdAddB').onclick = addCol;
    Q('#sdTa').oninput = e => { const t = e.target.value; if (!t.trim()) { X.imp = null; Q('#sdApply').disabled = true; Q('#sdImpS').textContent = ''; return; } analyze(splitRows(t)); };
    Q('#sdPf').onchange = e => readPoFile(e.target.files[0]);
    Q('#sdApply').onclick = applyImp;
    // tempel blok tabel langsung ke sel angka -> dibuka di panel tempel (ditinjau dulu sebelum disimpan)
    body.onpaste = e => {
      const t = e.target; if (!t.classList || !t.classList.contains('sd-c')) return;
      const txt = (e.clipboardData || window.clipboardData).getData('text'); if (!/[\t\n]/.test(txt.trim())) return;
      e.preventDefault(); X.impOpen = true; imp.style.display = 'block'; Q('#sdTa').value = txt; analyze(splitRows(txt)); imp.scrollIntoView({ block: 'nearest' });
    };
    body.onclick = async e => {
      const x = e.target.closest('.sd-x');
      if (x) {
        e.stopPropagation(); const d = x.dataset.del;
        const del = async () => {
          const r = await sbc().from('stokdcf_po').delete().eq('tgl', d); if (r.error) return msg('Gagal: ' + r.error.message, true);
          [...X.poM.keys()].forEach(k => { if (k.startsWith(d + '|')) X.poM.delete(k); }); paintPO();
        };
        const tx = 'Hapus kolom ' + dm(d) + ' beserta angkanya?';
        // confirm() bawaan diblokir di iframe Google Sites -> pakai dialog sendiri (pbConfirm di index.html)
        if (window.pbConfirm) window.pbConfirm(tx, () => del().catch(er => msg('Gagal: ' + er.message, true)), 'Hapus'); else if (confirm(tx)) del();
        return;
      }
      const th = e.target.closest('th.sd-dt');
      if (th && !e.target.classList.contains('sd-dh') && !Q('input.sd-dh', th)) {   // ubah judul jadi kolom tanggal; Enter/pilih tanggal = simpan, Esc = batal
        th.innerHTML = '<input type="date" class="sd-dh" value="' + th.dataset.d + '">';
        const inp = Q('input.sd-dh', th); inp.focus();
        inp.onkeydown = ev => { if (ev.key === 'Escape') paintPO(); };
        try { inp.showPicker(); } catch (er) { /* browser lama: ketik tanggal lalu Enter */ }
      }
    };
    body.onchange = async e => {
      const t = e.target;
      if (t.classList.contains('sd-dh')) {
        const old = t.closest('th').dataset.d, nw = t.value; if (!nw || nw === old) return;
        if (poCols().includes(nw)) { msg('Tanggal ' + dm(nw) + ' sudah ada', true); return paintPO(); }
        const r = await sbc().from('stokdcf_po').update({ tgl: nw }).eq('tgl', old); if (r.error) { msg('Gagal: ' + r.error.message, true); return paintPO(); }
        [...X.poM.keys()].forEach(k => { if (k.startsWith(old + '|')) { X.poM.set(nw + '|' + k.split('|')[1], X.poM.get(k)); X.poM.delete(k); } });
        msg('Tanggal diubah menjadi ' + dm(nw) + ' — kolom diurutkan otomatis'); return paintPO();   // poCols() selalu urut tanggal
      }
      if (!t.classList.contains('sd-c')) return;
      const v = num(t.value), d = t.dataset.d, p = t.dataset.p;
      if (isNaN(v)) { msg('Angka tidak valid', true); t.value = poQ(d, p) || ''; return; }
      const r = await sbc().from('stokdcf_po').upsert({ tgl: d, plu_dc: p, qty: v }, { onConflict: 'tgl,plu_dc' });
      if (r.error) { msg('Gagal menyimpan: ' + r.error.message, true); t.value = poQ(d, p) || ''; return; }
      X.poM.set(d + '|' + p, v); t.value = v ? v : ''; fillTotals();
    };
    body.addEventListener('focusin', e => { if (e.target.classList && e.target.classList.contains('sd-c')) e.target.select(); });
  }

  // ---------------- pemasangan menu ----------------
  async function start() {
    const run = ++X.run, body = Q('#sdBody'); if (body) body.innerHTML = '<div class="card empty" style="margin-top:12px"><span class="spin"></span><div>Memuat Stock DCF…</div></div>';
    try {
      await loadAll(); if (run !== X.run) return;
      X.pbState = 'load'; shell(); paint();
      loadPB(run).then(() => { if (run === X.run && X.tab === 'stok' && Q('#sdSeg')) paint(); });
    } catch (e) { shell(); Q('#sdBody').innerHTML = '<div class="card empty" style="color:#b00020;margin-top:12px">Gagal memuat: ' + E(e.message) + '<br><span class="note">Pastikan <b>migrasi-stok-dcf.sql</b> sudah dijalankan di Supabase.</span></div>'; }
  }
  function mount() {
    const navs = document.querySelectorAll('nav .nb'); if (!navs.length || Q('#nbSD')) return;
    const b = document.createElement('button'); b.className = 'nb'; b.id = 'nbSD'; b.style.display = 'none';
    b.innerHTML = '<span class="ni"><svg class="ic o" aria-hidden="true"><use href="#i-package"/></svg></span><span class="nt">Stock DCF</span>';
    navs[navs.length - 1].after(b);
    const v = document.createElement('div'); v.id = 'vStokDcf'; v.style.display = 'none'; Q('main .wrap').appendChild(v);
    VID.sdcf = '#vStokDcf';
    const av = window.applyView; window.applyView = function (x) { av(x); b.classList.toggle('on', x === 'sdcf'); };
    b.onclick = e => { e.stopPropagation(); window.showView('sdcf'); if (!X.ready) start(); else { if (!Q('#sdSeg')) shell(); paint(); } };
    // menu PO TAKAKI (di kanan Stock DCF); isi halaman ada di pb-potakaki.js
    const b2 = document.createElement('button'); b2.className = 'nb'; b2.id = 'nbPT'; b2.style.display = 'none';
    b2.innerHTML = '<span class="ni"><svg class="ic o" aria-hidden="true"><use href="#i-truck"/></svg></span><span class="nt">PO TAKAKI</span>';
    b.after(b2);
    const v2 = document.createElement('div'); v2.id = 'vPoTakaki'; v2.style.display = 'none'; Q('main .wrap').appendChild(v2);
    VID.potakaki = '#vPoTakaki';
    const av2 = window.applyView; window.applyView = function (x) { av2(x); b2.classList.toggle('on', x === 'potakaki'); };
    b2.onclick = e => { e.stopPropagation(); if (!adm()) return; window.showView('potakaki'); if (window.PBPOTAKAKI) window.PBPOTAKAKI.open(); };   // hanya administrator
    setInterval(() => { const d = gD(), ok = !!(d && d.user && gTok()); b.style.display = ok ? '' : 'none'; const isA = ok && adm(); b2.style.display = isA ? '' : 'none'; if (!isA && v2.style.display !== 'none') window.showView('lap'); if (!ok && X.ready) X.ready = false; }, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  // Est. STOCK h-1 jadwal kirim minggu depan (mis. 15 Nov) per PLU DC -> dipakai tabel Stock-DC vs PB di Rekap Cabang
  let estP = null;   // beberapa halaman (Rekap Cabang, Simulasi) minta bersamaan -> satu permintaan saja
  function est15(force) {
    if (!estP) estP = est15Run(force).finally(() => { estP = null; });
    return estP;
  }
  async function est15Run(force) {
    if (force || !X.ready) await loadAll();
    if (X.pbState === 'load' && X.pbP) await X.pbP;                                  // PB sedang dimuat halaman lain: tunggu
    if (X.pbState !== 'ok' || !X.pbAt || Date.now() - X.pbAt > (force ? 30000 : 180000)) await loadPB(++X.run);   // PB dipakai ulang selama 3 menit
    if (X.pbState !== 'ok') throw new Error(X.pbErr || 'PB belum termuat');
    const C = calcStok(), map = {}, byD = {};
    C.rows.forEach(r => { const o = { est: r.est2, ds: r.i.deskripsi }; map[String(r.i.plu_dc).trim()] = o; byD[norm(r.i.deskripsi)] = o; });
    C.rows.forEach(r => { const o = map[String(r.i.plu_dc).trim()]; o.now = r.qty; o.est3 = r.est3; byD[norm(r.i.deskripsi)].now = r.qty; byD[norm(r.i.deskripsi)].est3 = r.est3; });
    // stok awal per tanggal: snap = STOCK Data Exp Date, d2 = Est. STOCK h-1 minggu depan (mis. 15 Nov), d3 = Est. STOCK berikutnya (mis. 22 Nov)
    return { date: addD(C.to, 1), label: 'Est. STOCK ' + dmm(addD(C.to, 1)), snap: X.snap, d3: addD(C.to2, 1), map, byD };
  }
  window.PBSTOKDCF = { est15, X, start, parseED, parsePORows, paintStok, paintPO, paintED, calcStok };
})();
