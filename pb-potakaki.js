/* PB SAY BREAD - halaman "PO TAKAKI" (hanya administrator).  Semua satuan CTN, PALLET boleh desimal.
   Isi halaman mengikuti Excel EST. PO TAKAKI JATIM:
   - PO 1, PO 2, dst. (satu PO = satu mobil, bisa ditambah/dihapus; kendaraan, tanggal kirim, ctn per pallet bisa diubah)
   - STOCK (tanpa forecast) = Est. STOCK terakhir di Stock DCF (mis. Est. STOCK 22 Nov); STOCK (ada forecast) = STOCK + total PO
   - BUFFER % = (STOCK - rata-rata PB per minggu) / rata-rata PB per minggu, minimal 0
   - DSI = STOCK / QPD (Ctn);  QPD (Ctn) = sales per hari / FRC (sama dengan Stock DCF)
   - JML TOKO JUAL dan rata-rata PB per minggu dari fungsi database potakaki_info()
   - Rekomendasi jumlah PO: kebutuhan CTN agar semua item mencapai target DSI -> jumlah & jenis kendaraan paling pas
     (tonase TRONTON / JUMBO / BUILT-UP), lalu bisa diisi otomatis (DSI diratakan) dan tetap bisa diedit.
   Tabel Supabase: potakaki_po, potakaki_po_item, potakaki_cfg (hanya admin, RLS is_admin()) - lihat migrasi-po-takaki.sql.
   Memakai window.PBSTOKDCF (est15, calcStok) dari pb-stokdcf.js. */
(function () {
  'use strict';
  const MONL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const pd = s => new Date(s + 'T00:00:00Z');
  const iso = d => d.toISOString().slice(0, 10);
  const addD = (s, n) => iso(new Date(pd(s).getTime() + n * 864e5));
  const dmm = s => pd(s).getUTCDate() + ' ' + MON[pd(s).getUTCMonth()];
  const dml = s => pd(s).getUTCDate() + ' ' + MONL[pd(s).getUTCMonth()];
  const dmy = s => pd(s).getUTCDate() + ' ' + MONL[pd(s).getUTCMonth()] + ' ' + String(pd(s).getUTCFullYear()).slice(2);
  const n0 = v => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  const q1 = v => v ? (v >= 10 ? n0(v) : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })) : '-';
  const fmtP = v => v ? String(Math.round(v * 100) / 100).replace('.', ',') : '';      // pallet: koma desimal
  const fmtP1 = v => v ? Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 }) : '-';
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const Q = (s, r) => (r || document).querySelector(s);
  const sbc = () => window.PBAPI.sb;
  const gD = () => (typeof D !== 'undefined' ? D : null);
  const adm = () => { const d = gD(); return !!(d && d.user && d.user.admin); };
  const msg = (m, err) => { if (window.toast) window.toast(m, err); else alert(m); };
  const must = r => { if (r.error) throw new Error(r.error.message); return r.data; };
  const ic = n => '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
  const numIn = s => { s = String(s == null ? '' : s).trim().replace(/\s/g, '').replace(',', '.'); if (!s) return 0; const v = Number(s); return isFinite(v) && v >= 0 ? v : NaN; };

  const KEND0 = { 'TRONTON': 1518, 'JUMBO': 1782, 'BUILT-UP': 2178 };
  const MAXPO = 12;

  // ---------------- perhitungan murni (diuji terpisah) ----------------
  const toCtn = (pallet, cp) => Math.round((Number(pallet) || 0) * cp);
  // pengisian otomatis dalam satuan 0,1 pallet
  const UP = 10;
  // kapasitas kendaraan dalam satuan 0,1 pallet (muatan yang bisa diisi otomatis tanpa melebihi tonase)
  const unitsCap = (cap, cp) => Math.floor(cap / cp * UP + 1e-9);
  // DSI akhir item CORE harus lebih tinggi minimal GAP hari dari item lainnya (mis. core 40 hari -> item lain 35 hari)
  const GAP = 5;
  const tgtOf = (r, T) => r.core ? T : Math.max(0, T - GAP);
  // kebutuhan CTN agar setiap item mencapai DSI target (core = T, lainnya = T - GAP; hanya item yang punya QPD)
  const needCtn = (rows, T) => rows.reduce((t, r) => t + (r.qc > 0 ? Math.max(0, tgtOf(r, T) * r.qc - r.s1) : 0), 0);
  // jumlah PO paling sedikit, lalu kapasitas paling pas, dari kombinasi jenis kendaraan
  function pickVehicles(need, caps, cp) {
    if (!(need > 0)) return [];
    const names = Object.keys(caps).filter(k => caps[k] > 0).sort((a, b) => caps[a] - caps[b]);
    if (!names.length) return [];
    const use = n => unitsCap(caps[n], cp) * cp / UP;
    for (let n = 1; n <= MAXPO; n++) {
      let best = null;
      const rec = (i, left, cur, cap) => {
        if (left === 0) { if (cap >= need - 1e-9 && (!best || cap < best.cap)) best = { cap, list: cur.slice() }; return; }
        if (i >= names.length) return;
        for (let k = left; k >= 0; k--) {
          for (let t = 0; t < k; t++) cur.push(names[i]);
          rec(i + 1, left - k, cur, cap + k * use(names[i]));
          for (let t = 0; t < k; t++) cur.pop();
        }
      };
      rec(0, n, [], 0);
      if (best) return best.list.sort((a, b) => caps[b] - caps[a]);
    }
    const big = names[names.length - 1];
    return Array(Math.min(MAXPO, Math.ceil(need / use(big)))).fill(big);
  }
  // rekomendasi. Tiap item minimal mencapai DSI target (dibulatkan ke atas 0,1 pallet).
  // mode 'full' = kendaraan diisi penuh, kelebihan kapasitas dibagi dengan DSI diratakan (water-filling); 'pas' = tepat sampai target DSI.
  // hasil: { need (ctn mentah), veh (daftar kendaraan), capUnits, capCtn, level (DSI rata-rata), plan: [{kendaraan, items:{plu: pallet}}] }
  function recommend(rows, T, caps, cp, mode) {
    const items = rows.filter(r => r.qc > 0), cu = cp / UP;
    const need = needCtn(rows, T);
    const mn = items.map(r => Math.ceil(Math.max(0, tgtOf(r, T) * r.qc - r.s1) / cu - 1e-9)), off = items.map(r => T - tgtOf(r, T));
    const veh = pickVehicles(mn.reduce((a, b) => a + b, 0) * cu, caps, cp);
    const vu = veh.map(n => unitsCap(caps[n], cp)), capUnits = vu.reduce((a, b) => a + b, 0);
    const out = { need, veh, capUnits, capCtn: capUnits * cu, level: T, plan: veh.map(n => ({ kendaraan: n, items: {} })) };
    if (!veh.length || !items.length) return out;
    let x = mn.slice(), level = T;
    if (mode !== 'pas') {
      const xs = lv => items.map((r, i) => Math.max(mn[i], ((lv - off[i]) * r.qc - r.s1) / cu));   // item non-core diratakan di level (lv - GAP)
      const f = lv => xs(lv).reduce((a, b) => a + b, 0);
      let lo = T, hi = T + 1; while (f(hi) < capUnits && hi < 1e6) hi *= 2;
      for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (f(mid) < capUnits) lo = mid; else hi = mid; }
      level = hi; x = xs(level);
    }
    out.level = level;
    // pembulatan ke 0,1 pallet (sisa pecahan terbesar dulu); total tidak melebihi kapasitas
    const base = x.map(v => Math.floor(v + 1e-9)), fr = x.map((v, i) => v - base[i]);
    let left = Math.min(capUnits, Math.round(x.reduce((a, b) => a + b, 0))) - base.reduce((a, b) => a + b, 0);
    fr.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0) { base[i]++; left--; } });
    // bagi ke mobil per blok (maks. 0,5 pallet, tidak dipecah bila muat) ke mobil yang paling longgar (sisa/kapasitas terbesar);
    // item kecil jadi utuh di satu mobil, item besar tersebar rata
    const rem = vu.slice(), U = veh.map(() => ({})), BLK = 5;
    const put = (j, plu, u) => { U[j][plu] = (U[j][plu] || 0) + u; rem[j] -= u; };
    items.forEach((r, i) => {
      let u = base[i];
      while (u > 0) {
        const blk = Math.min(u, BLK); let j = -1, bv = -1;
        rem.forEach((m, k) => { if (m >= blk && m / vu[k] > bv + 1e-12) { bv = m / vu[k]; j = k; } });
        if (j < 0) { let mx = 0; rem.forEach((m, k) => { if (m > mx) { mx = m; j = k; } }); if (j < 0) return; const t = Math.min(blk, rem[j]); put(j, r.plu, t); u -= t; }
        else { put(j, r.plu, blk); u -= blk; }
      }
    });
    // CTN dibulatkan per item: pastikan muatan tiap mobil tidak melebihi tonase (kurangi dari item yang DSI-nya masih paling longgar sesudah dikurangi),
    // lalu pastikan tiap item tetap mencapai DSI target (tambah 0,1 pallet bila pembulatan membuatnya kurang)
    const tu = {}, byP = {}; U.forEach(m => Object.keys(m).forEach(k => { tu[k] = (tu[k] || 0) + m[k]; })); items.forEach(r => { byP[r.plu] = r; });
    const dsiAfter = k => (byP[k].s1 + (tu[k] - 1) * cu) / byP[k].qc;   // DSI item bila dikurangi 0,1 pallet
    const poTot = j => Object.keys(U[j]).reduce((a, k) => a + Math.round(U[j][k] / UP * cp), 0);
    U.forEach((m, j) => {
      const cap = caps[veh[j]]; let g = 0;
      while (poTot(j) > cap && g++ < 500) { const k = Object.keys(m).filter(q => m[q] > 0).sort((a, b) => dsiAfter(b) - dsiAfter(a))[0]; if (!k) break; m[k]--; tu[k]--; }
    });
    // mode 'full': sisa muatan (akibat pembulatan CTN per item) diisi tambahan 0,1 pallet yang membuat muatan paling dekat ke tonase
    if (mode !== 'pas') U.forEach((m, j) => {
      const cap = caps[veh[j]]; let g = 0;
      while (g++ < 60) {
        const cur = poTot(j); if (cur >= cap) break;
        let bk = null, bt = cur;
        items.forEach(r => { m[r.plu] = (m[r.plu] || 0) + 1; const t = poTot(j); m[r.plu]--; if (!m[r.plu]) delete m[r.plu];
          if (t <= cap && (t > bt || (t === bt && bk && (r.s1 + t) / r.qc < (byP[bk].s1 + t) / byP[bk].qc))) { bt = t; bk = r.plu; } });
        if (!bk || bt <= cur) break;
        m[bk] = (m[bk] || 0) + 1; tu[bk] = (tu[bk] || 0) + 1;
      }
    });
    const ctnOf = k => U.reduce((a, m) => a + Math.round((m[k] || 0) / UP * cp), 0);
    items.forEach(r => {
      const reqC = Math.max(0, tgtOf(r, T) * r.qc - r.s1); let g = 0;
      while (ctnOf(r.plu) < reqC - 1e-9 && g++ < 30) {
        const order = U.map((m, j) => j).sort((a, b) => ((U[b][r.plu] > 0) - (U[a][r.plu] > 0)) || (caps[veh[b]] - poTot(b)) - (caps[veh[a]] - poTot(a)));
        let ok = false;
        for (const j of order) { U[j][r.plu] = (U[j][r.plu] || 0) + 1; if (poTot(j) <= caps[veh[j]]) { tu[r.plu]++; ok = true; break; } U[j][r.plu]--; if (!U[j][r.plu]) delete U[j][r.plu]; }
        if (!ok) break;
      }
    });
    U.forEach((m, j) => Object.keys(m).forEach(k => { if (m[k] > 0) out.plan[j].items[k] = m[k] / UP; }));
    return out;
  }

  // ---------------- status ----------------
  const P = { ready: false, loading: false, err: '', noTbl: false, run: 0, busy: false, mode: 'full',
    periode: null, tab: 'hitung', tglPO: '', reqCustom: '', all: [], hid: new Set(), estDate: null, reqFrom: null, reqTo: null, rows: [], pos: [], pal: new Map(), info: {}, nw: 0,
    cfg: { target: 30, cp: 77, kend: Object.assign({}, KEND0) } };
  const pk = (id, plu) => id + '|' + plu;
  const palOf = (id, plu) => P.pal.get(pk(id, plu)) || 0;
  const capOf = po => Number(P.cfg.kend[po.kendaraan]) || 0;
  // daftar kendaraan urut tonase terkecil -> terbesar (TRONTON, JUMBO, BUILT-UP), tidak tergantung urutan data tersimpan
  const kendKeys = () => Object.keys(P.cfg.kend).sort((a, b) => (Number(P.cfg.kend[a]) || 0) - (Number(P.cfg.kend[b]) || 0));
  const cpOf = po => Number(po.ctn_pallet) || P.cfg.cp || 77;
  const root = () => Q('#vPoTakaki');

  // ---------------- gaya ----------------
  function css() {
    if (Q('#ptCss')) return;
    const s = document.createElement('style'); s.id = 'ptCss';
    s.textContent = `
#vPoTakaki .pt-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;margin-top:8px;border:1px solid var(--bd);border-radius:10px;background:linear-gradient(135deg,#fff9d6,#eef9f2);border-left:4px solid #f5b800}
#vPoTakaki .pt-ico{width:30px;height:30px;border-radius:8px;background:#f59e0b;color:#fff;display:grid;place-items:center;flex:none}
#vPoTakaki .pt-ico svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#vPoTakaki .pt-t{font-weight:800;font-size:15px;color:var(--br);line-height:1.2}
#vPoTakaki .pt-s{font-size:11.5px;color:var(--mu)}
#vPoTakaki input.pt-rq{font:inherit;font-size:11.5px;color:var(--mu);border:1px dashed transparent;background:transparent;border-radius:4px;padding:0 4px;margin:0 0 0 -4px;width:auto;min-width:0;max-width:100%;box-shadow:none}
#vPoTakaki input.pt-rq:hover{border-color:#d8b84a;background:#fffdf0}#vPoTakaki input.pt-rq:focus{outline:2px solid #34b96f;border-color:transparent;background:#fff;color:#111}
#vPoTakaki .pt-card{background:#fff;border:1px solid var(--bd);border-radius:10px;padding:9px 12px;margin-top:8px}
#vPoTakaki .pt-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
#vPoTakaki .pt-row .in,#vPoTakaki .pt-row select{width:auto;padding:3px 7px}
#vPoTakaki .pt-reco{font-size:12.5px;line-height:1.55}
#vPoTakaki .pt-reco b{color:var(--br)}
#vPoTakaki .pt-chip{display:inline-block;padding:1px 9px;border-radius:99px;background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;font-weight:700;font-size:11.5px;margin:0 3px 0 0}
#vPoTakaki .pt-chip.k{background:#fff3cd;border-color:#f5d36b;color:#7a5a00}
#vPoTakaki .pt-wrap{overflow-x:auto;overflow-y:hidden;margin-top:8px;border:1px solid #9aa3a0;background:#fff;max-width:100%}
#vPoTakaki table.pt-tb{border-collapse:separate;border-spacing:0;font-size:11.5px;line-height:1.25;color:#111;width:max-content!important;min-width:0!important;max-width:none!important;table-layout:auto}
#vPoTakaki .pt-tb th,#vPoTakaki .pt-tb td{width:auto}
#vPoTakaki .pt-tb th{position:sticky;top:0;z-index:2;background:#fff;color:#111;border-right:1px solid #8b9490;border-bottom:1px solid #8b9490;padding:3px 7px;font-size:10.5px;font-weight:700;text-align:center;white-space:nowrap}
#vPoTakaki .pt-tb th.y{background:#ffe600}
#vPoTakaki .pt-tb th.gr{background:#d9f0e2}
#vPoTakaki .pt-tb th.bl{background:#d4f1f9}
#vPoTakaki .pt-tb th.tn{background:#e9dfd6}
#vPoTakaki .pt-tb th.pc{background:#fde9d9}
#vPoTakaki .pt-tb td.rmc{padding:0 4px;text-align:center}
#vPoTakaki .pt-rm{cursor:pointer;opacity:.35;font-size:14px;line-height:1;padding:0 3px;color:#b00020}#vPoTakaki tr:hover .pt-rm{opacity:.7}#vPoTakaki .pt-rm:hover{opacity:1}
#vPoTakaki .pt-tb th.rs{vertical-align:middle}
#vPoTakaki .pt-tb td{padding:1px 6px;border-right:1px solid #cfd6d3;border-bottom:1px solid #cfd6d3;white-space:nowrap;text-align:right;height:21px;background:#fff}
#vPoTakaki .pt-tb td.l{text-align:left}#vPoTakaki .pt-tb td.c{text-align:center}
#vPoTakaki .pt-tb td.core{background:#e3f5e8}
#vPoTakaki .pt-tb td.pt-jt{background:#fff9a6}
#vPoTakaki .pt-tb td.z{background:#fdd4d6!important;color:#9c0006;font-weight:700}
#vPoTakaki .pt-tb td.bf{min-width:58px}
#vPoTakaki .pt-tb td.pl{background:#fffdf0}
#vPoTakaki .pt-tb td.tot{font-weight:700}
#vPoTakaki .pt-tb tr.gt td{background:#d9f0e2;font-weight:800;border-top:2px solid #6f7c76}
#vPoTakaki .pt-tb tr.gt td.core{background:#d9f0e2}
#vPoTakaki .pt-tb tr.cp td{background:#fff1e6;font-weight:700}
#vPoTakaki .pt-tb td.neg{color:#c00000}
#vPoTakaki .pt-poh1{display:flex;align-items:center;gap:5px;justify-content:center}
#vPoTakaki .pt-poh2{display:flex;align-items:center;gap:4px;justify-content:center;margin-top:2px;font-weight:600}
#vPoTakaki .pt-tb th select,#vPoTakaki .pt-tb th input{font:inherit;font-size:10.5px;padding:0 3px;border:1px solid #9aa3a0;border-radius:4px;background:#fff;color:#111;height:19px}
#vPoTakaki .pt-tb th input.pt-dt{width:104px}
#vPoTakaki .pt-x{cursor:pointer;opacity:.55;font-size:14px;line-height:1;padding:0 3px}#vPoTakaki .pt-x:hover{opacity:1;color:#c00000}
#vPoTakaki input.pt-p{width:56px;border:0;border-radius:4px;background:transparent;text-align:right;font:inherit;padding:1px 3px;color:#1f4fd8;font-weight:600}
#vPoTakaki input.pt-p:hover{background:rgba(55,48,163,.07)}#vPoTakaki input.pt-p:focus{outline:2px solid #34b96f;background:#fff}
#vPoTakaki input.pt-p::placeholder{color:#b8c2bd;font-weight:400}
#vPoTakaki .pt-ton{display:inline-block;margin-top:8px;background:#fbe5d6;border:1px solid #efc9ae;border-radius:8px;padding:7px 12px;font-size:12px}
#vPoTakaki .pt-ton table{border-collapse:collapse;width:auto;min-width:0}#vPoTakaki .pt-ton td{padding:1px 6px 1px 0}
#vPoTakaki .pt-ton input{width:68px;text-align:right;font:inherit;font-weight:700;padding:1px 4px;border:1px solid #d9b394;border-radius:4px;background:#fff;color:#1f4fd8}
#vPoTakaki .pt-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--mu);padding:6px 2px 0;align-items:center}
#vPoTakaki .pt-sw{display:inline-block;width:14px;height:12px;border:1px solid rgba(0,0,0,.2);vertical-align:-2px;margin-right:4px;background:#e3f5e8}
#vPoTakaki .pt-er{color:#b00020}
`;
    document.head.appendChild(s);
  }

  // baris item mengikuti urutan & penanda core halaman Stock DCF
  const mapRows = rows => { const SD = window.PBSTOKDCF; return rows.map(r => { const k = String(r.i.plu_dc).trim(); return { plu: k, raw: r.i.plu_dc, desk: r.i.deskripsi, core: !!r.i.core, s1: Number(r.estLast != null ? r.estLast : r.est3) || 0,   // Est. STOCK kolom terakhir di Stock DCF (termasuk minggu Est. PB tambahan)
         qc: Number(r.qc) || 0, frc: (SD.X.qpd[k] || {}).frc || 0 }; }); };

  // ---------------- data ----------------
  async function load(force) {
    const run = ++P.run; P.loading = true; P.err = ''; P.noTbl = false; paint();
    try {
      const SD = window.PBSTOKDCF; if (!SD) throw new Error('modul Stock DCF belum termuat');
      await SD.est15(!!force);
      if (run !== P.run) return;
      const C = SD.calcStok();
      if (!C.to2) throw new Error('Belum ada data stock DCF - unggah dulu di Stock DCF > Data Exp Date');
      setDates(C);
      P.all = mapRows(C.rows);
      const s = sbc();
      const [po, cf, inf] = await Promise.all([
        s.from('potakaki_po').select('*').eq('periode', P.periode).order('urut'),
        s.from('potakaki_cfg').select('key,value'),
        s.rpc('potakaki_info')]);
      if (run !== P.run) return;
      const miss = e => e && (e.code === '42P01' || e.code === 'PGRST202' || e.code === 'PGRST205' || /potakaki/i.test(e.message || ''));
      if (miss(po.error) || miss(cf.error) || miss(inf.error)) { P.noTbl = true; throw new Error('Tabel/fungsi PO TAKAKI belum ada di Supabase'); }
      P.pos = must(po);
      P.pal = new Map();
      if (P.pos.length) must(await s.from('potakaki_po_item').select('po_id,plu_dc,pallet').in('po_id', P.pos.map(p => p.id))).forEach(r => P.pal.set(pk(r.po_id, String(r.plu_dc).trim()), Number(r.pallet) || 0));
      P.cfg = { target: 30, cp: 77, kend: Object.assign({}, KEND0) }; P.reqCustom = ''; P.hid = new Set();
      must(cf).forEach(r => {
        if (r.key === 'item_hidden' && Array.isArray(r.value)) P.hid = new Set(r.value.map(v => String(v).trim()));
        if (r.key === 'request_text|' + P.periode && typeof r.value === 'string') P.reqCustom = r.value.trim();
        if (r.key === 'target_dsi' && Number(r.value) > 0) P.cfg.target = Number(r.value);
        if (r.key === 'ctn_pallet' && Number(r.value) > 0) P.cfg.cp = Number(r.value);
        if (r.key === 'kendaraan' && r.value && typeof r.value === 'object') P.cfg.kend = r.value;
      });
      P.info = {}; P.nw = 0;
      must(inf).forEach(r => { P.info[String(r.plu).trim()] = { toko: Number(r.jml_toko) || 0, avg: Number(r.avg_pb) || 0 }; P.nw = Number(r.n_minggu) || P.nw; });
      P.rows = P.all.filter(r => !P.hid.has(r.plu)); P.ready = true; P.at = Date.now();
    } catch (e) { if (run !== P.run) return; P.ready = false; P.err = e.message || String(e); }
    P.loading = false; paint();
  }

  // ---------------- hitung tampilan ----------------
  function calc() {
    const pos = P.pos;
    const rows = P.rows.map(r => {
      const inf = P.info[r.plu] || { toko: 0, avg: 0 };
      const ctn = pos.map(po => toCtn(palOf(po.id, r.plu), cpOf(po)));
      const tot = ctn.reduce((a, b) => a + b, 0), s2 = r.s1 + tot;
      const buf = s => inf.avg > 0 ? Math.max(0, (s - inf.avg) / inf.avg) : 0;
      return { r, inf, ctn, tot, s2, b1: buf(r.s1), b2: buf(s2), d1: r.qc > 0 ? r.s1 / r.qc : null, d2: r.qc > 0 ? s2 / r.qc : null };
    });
    const T = { pal: pos.map(() => 0), ctn: pos.map(() => 0), tot: 0, s1: 0, s2: 0, qc: 0, avg: 0 };
    rows.forEach(x => { x.ctn.forEach((v, k) => { T.ctn[k] += v; T.pal[k] += palOf(pos[k].id, x.r.plu); }); T.tot += x.tot; T.s1 += x.r.s1; T.s2 += x.s2; T.qc += x.r.qc; T.avg += x.inf.avg; });
    return { rows, T };
  }
  const reco = () => recommend(P.rows, P.cfg.target, P.cfg.kend, P.cfg.cp, P.mode);

  // baris "Muatan kendaraan": 100% penuh -> hanya nama kendaraan (mis. TRONTON); selain itu + sisa / kapasitas
  function muatText(po, used) {
    const cap = capOf(po); if (!cap) return po.kendaraan || '-';
    const left = cap - used;
    if (left === 0) return po.kendaraan;
    const pct = left > 0 ? Math.floor(used / cap * 100) : Math.round(used / cap * 100);   // tidak dibulatkan ke 100% bila belum penuh
    return po.kendaraan + ' · ' + (left < 0 ? 'Lebih ' + n0(-left) : 'Sisa ' + n0(left)) + ' / ' + n0(cap) + ' (' + pct + '%)';
  }

  // ---------------- tampilan ----------------
  // periode default "23 - 28 NOVEMBER 2026"
  // periode request pengiriman tetap (minggu setelah Est. STOCK 22 Nov, mis. 23-28 Nov); minggu Est. PB tambahan di Stock DCF hanya menggeser
  // tanggal Est. STOCK / DSI di judul kolom (mis. 29 Nov) karena stock yang dipakai adalah Est. STOCK terakhir
  function setDates(C) {
    const tL = C.toLast || C.to2;
    P.estDate = addD(tL, 1); P.reqFrom = addD(C.to2, 2); P.reqTo = addD(C.to2, 7); P.periode = P.reqFrom;
    P.hdrDate = tL !== C.to2 ? P.estDate : null;
  }
  const hdrD = () => P.hdrDate || P.reqTo;
  const reqPeriod = () => { const sm = pd(P.reqFrom).getUTCMonth() === pd(P.reqTo).getUTCMonth(); return (sm ? pd(P.reqFrom).getUTCDate() : dml(P.reqFrom).toUpperCase()) + ' - ' + dml(P.reqTo).toUpperCase() + ' ' + pd(P.reqTo).getUTCFullYear(); };
  const defLine = () => 'REQUEST PENGIRIMAN : ' + reqPeriod();
  // teks baris di bawah judul: bisa diubah administrator (tersimpan per periode), kosong = otomatis
  const reqLine = () => P.reqCustom || defLine();
  const rqSize = v => Math.max(24, Math.min(90, String(v).length + 2));
  function head() {
    const rq = P.reqFrom ? reqLine() : '';
    return '<div class="pt-head"><span class="pt-ico">' + ic('truck') + '</span><div><div class="pt-t">EST. PO TAKAKI JATIM</div><div class="pt-s">'
      + (P.reqFrom && P.tab !== 'kirim' ? '<input class="pt-rq" id="ptRq" size="' + rqSize(rq) + '" value="' + E(rq) + '" spellcheck="false" title="Klik untuk mengubah teks ini (ikut tampil di hasil download). Kosongkan lalu Enter untuk kembali otomatis."> · satuan CTN · hanya administrator' : 'satuan CTN · hanya administrator') + '</div></div>'
      + (P.ready && !P.loading && !P.err ? '<span id="ptSeg" style="display:inline-flex;gap:4px;margin-left:6px"><button class="b ' + (P.tab !== 'kirim' ? 'p' : 's') + '" data-t="hitung">Hitung PO</button><button class="b ' + (P.tab === 'kirim' ? 'p' : 's') + '" data-t="kirim">Kirim PO</button></span>' : '')
      + '<span style="flex:1"></span>'
      + '<button class="b s" id="ptRl">' + ic('refresh') + ' Muat ulang</button>'
      + (P.ready && !P.loading && !P.err ? '<div class="dmw" id="ptDm"><button class="b p" id="ptDl">' + ic('down') + ' Download ' + ic('chev') + '</button>'
        + '<div class="dmn"><a data-f="jpg">' + ic('image') + ' JPG</a><a data-f="xls">' + ic('sheet') + ' Excel (.xlsx)</a></div></div>' : '') + '</div>';
  }
  function recoHtml() {
    const R = reco(), T = P.cfg.target, cp = P.cfg.cp, C = calc();
    const below = C.rows.filter(x => x.r.qc > 0 && x.d2 != null && x.d2 < tgtOf(x.r, T) - 1e-9).length;
    let h = '<div class="pt-card"><div class="pt-row"><div><label class="k">Target DSI (hari)</label><br><input class="in" id="ptTg" inputmode="decimal" style="width:70px;text-align:right" value="' + E(String(T).replace('.', ',')) + '"></div>'
      + '<div><label class="k">Cara isi otomatis</label><br><select class="in" id="ptMd"><option value="full"' + (P.mode === 'full' ? ' selected' : '') + '>Kendaraan diisi penuh (DSI diratakan)</option><option value="pas"' + (P.mode === 'pas' ? ' selected' : '') + '>Pas sampai target DSI</option></select></div>'
      + '<button class="b p" id="ptApply"' + (R.veh.length ? '' : ' disabled') + '>' + ic('spark') + ' Terapkan rekomendasi</button>'
      + '<button class="b s" id="ptAdd"' + (P.pos.length >= MAXPO ? ' disabled' : '') + '>' + ic('plus') + ' Tambah PO (mobil)</button>'
      + '<div><label class="k">CTN per pallet</label><br><input class="in" id="ptCp" inputmode="decimal" style="width:60px;text-align:right;color:#1f4fd8;font-weight:700" value="' + E(String(P.cfg.cp).replace('.', ',')) + '" title="Berlaku untuk semua PO"></div>'
      + (P.all.some(r => P.hid.has(r.plu)) ? '<div><label class="k">Item dihapus</label><br><select class="in" id="ptAddItem"><option value="">+ Tambah item…</option>' + P.all.filter(r => P.hid.has(r.plu)).map(r => '<option value="' + E(r.plu) + '">' + E(r.plu + ' · ' + r.desk) + '</option>').join('') + '</select></div>' : '') + '</div>'
      + '<div class="pt-reco" style="margin-top:7px">';
    if (!P.rows.some(r => r.qc > 0)) h += '<span class="pt-er">QPD belum terbaca - rekomendasi belum bisa dihitung.</span>';
    else if (!R.veh.length) h += '<span class="pt-chip">Rekomendasi: 0 PO</span> Est. STOCK ' + E(dml(P.estDate)) + ' semua item sudah memenuhi target (core ' + E(String(T).replace('.', ',')) + ' hari, lainnya ' + E(String(Math.max(0, T - GAP)).replace('.', ',')) + ' hari).';
    else {
      const cnt = {}; R.veh.forEach(v => { cnt[v] = (cnt[v] || 0) + 1; });
      h += '<span class="pt-chip k">Rekomendasi: ' + R.veh.length + ' PO</span> ' + Object.keys(cnt).map(v => '<b>' + cnt[v] + ' × ' + E(v) + '</b>').join(' + ')
        + ' (muat maks. ' + n0(R.capCtn) + ' ctn = ' + fmtP1(R.capUnits / 10) + ' pallet). Kebutuhan agar item core DSI ≥ ' + E(String(T).replace('.', ',')) + ' hari dan item lain ≥ ' + E(String(Math.max(0, T - GAP)).replace('.', ',')) + ' hari: <b>' + n0(R.need) + ' ctn</b> (' + fmtP1(R.need / cp) + ' pallet).'
        + (P.mode === 'full' ? ' Bila diisi penuh, DSI item core ≈ <b>' + n0(R.level) + ' hari</b>, item lain ≈ <b>' + n0(Math.max(0, R.level - GAP)) + ' hari</b>.' : '');
    }
    h += '<br><span class="pt-chip">Terisi sekarang: ' + P.pos.length + ' PO · ' + n0(C.T.tot) + ' ctn</span>'
      + (P.pos.length && P.rows.some(r => r.qc > 0) ? '<span class="pt-chip' + (below ? ' k' : '') + '">Item DSI &lt; target setelah PO: ' + below + '</span>' : '')
      + '</div></div>';
    return h;
  }
  function tableHtml() {
    const pos = P.pos, np = pos.length, d1 = hdrD() ? dmy(hdrD()) : '', ds = P.reqTo ? dmm(hdrD()).replace(' ', '-') : '';
    const kopt = sel => kendKeys().map(k => '<option' + (k === sel ? ' selected' : '') + '>' + E(k) + '</option>').join('');
    const poh = pos.map((po, i) => '<th colspan="2" class="y"><div class="pt-poh1"><b>PO ' + (i + 1) + '</b><select class="pt-kd" data-po="' + po.id + '">' + kopt(po.kendaraan) + '</select><span class="pt-x" data-del="' + po.id + '" title="Hapus PO ini">×</span></div>'
      + '<div class="pt-poh2">Kirim <input type="date" class="pt-dt" data-po="' + po.id + '" value="' + E(po.tgl_kirim || '') + '"></div></th>').join('');
    let h = '<div class="pt-wrap"><table class="pt-tb"><thead>'
      + '<tr class="h1"><th class="rs" rowspan="3">NO</th><th class="rs" rowspan="3">PLU DC</th><th class="rs" rowspan="3">DESCRIPTION</th><th class="rs" rowspan="3">FRC</th><th class="rs" rowspan="3"></th>'
      + '<th class="y" colspan="' + (np ? np * 2 : 2) + '">PO TAKAKI</th><th class="y rs" rowspan="2">TOTAL<br>PO</th>'
      + '<th class="gr" colspan="4">EST. STOCK DCF ' + E(d1) + '</th><th class="bl" colspan="2">DSI DCF ' + E(d1) + '</th>'
      + '<th class="tn rs" rowspan="2">QPD<br>(Ctn)</th><th class="y rs" rowspan="2">JML TOKO<br>JUAL</th><th class="pc">AVERAGE</th></tr>'
      + '<tr class="h2">' + (np ? poh : '<th colspan="2" class="y">belum ada PO</th>')
      + '<th class="gr" colspan="2">JIKA TANPA<br>FORECAST</th><th class="gr" colspan="2">JIKA ADA<br>FORECAST</th><th class="bl">JIKA TANPA<br>FORECAST</th><th class="bl">JIKA ADA<br>FORECAST</th><th class="pc">OUTB (PB)</th></tr>'
      + '<tr class="h3">' + (np ? pos.map(() => '<th class="y">PALLET</th><th class="y">CTN</th>').join('') : '<th class="y">PALLET</th><th class="y">CTN</th>')
      + '<th class="y">CTN</th><th class="gr">STOCK</th><th class="gr">BUFFER %</th><th class="gr">STOCK</th><th class="gr">BUFFER %</th><th class="bl">' + E(ds) + '</th><th class="bl">' + E(ds) + '</th>'
      + '<th class="tn">per hari</th><th class="y">(toko)</th><th class="pc">PER WEEK</th></tr></thead><tbody>';
    P.rows.forEach((r, n) => {
      h += '<tr data-p="' + E(r.plu) + '"><td class="c">' + (n + 1) + '</td><td class="l' + (r.core ? ' core' : '') + '">' + E(r.plu) + '</td><td class="l' + (r.core ? ' core' : '') + '">' + E(r.desk) + '</td><td class="c">' + (r.frc ? n0(r.frc) : '-') + '</td><td class="rmc"><span class="pt-rm" data-rm="' + E(r.plu) + '" title="Hapus item ini dari tabel">×</span></td>'
        + (np ? pos.map(po => '<td class="pl"><input class="pt-p" inputmode="decimal" placeholder="-" data-po="' + po.id + '" data-p="' + E(r.plu) + '" value="' + fmtP(palOf(po.id, r.plu)) + '"></td><td data-k="c|' + po.id + '|' + E(r.plu) + '"></td>').join('') : '<td class="pl"></td><td></td>')
        + '<td class="tot" data-k="t|' + E(r.plu) + '"></td><td data-k="s1|' + E(r.plu) + '"></td><td class="bf" data-k="b1|' + E(r.plu) + '"></td><td data-k="s2|' + E(r.plu) + '"></td><td class="bf" data-k="b2|' + E(r.plu) + '"></td>'
        + '<td data-k="d1|' + E(r.plu) + '"></td><td data-k="d2|' + E(r.plu) + '"></td><td>' + q1(r.qc) + '</td><td class="pt-jt">' + ((P.info[r.plu] || {}).toko ? n0(P.info[r.plu].toko) : '-') + '</td><td>' + ((P.info[r.plu] || {}).avg ? n0(P.info[r.plu].avg) : '-') + '</td></tr>';
    });
    h += '<tr class="gt"><td class="l" colspan="5">Grand Total</td>' + (np ? pos.map(po => '<td data-k="gp|' + po.id + '"></td><td data-k="gc|' + po.id + '"></td>').join('') : '<td></td><td></td>')
      + '<td data-k="gt"></td><td data-k="gs1"></td><td data-k="gb1"></td><td data-k="gs2"></td><td data-k="gb2"></td><td data-k="gd1"></td><td data-k="gd2"></td><td data-k="gq"></td><td></td><td data-k="ga"></td></tr>'
      + '<tr class="cp"><td class="l" colspan="5">Muatan kendaraan</td>' + (np ? pos.map(po => '<td colspan="2" data-k="cap|' + po.id + '"></td>').join('') : '<td colspan="2"></td>') + '<td colspan="10"></td></tr>'
      + '</tbody></table></div>';
    return h;
  }
  function tonHtml() {
    return '<div class="pt-leg"><span><i class="pt-sw"></i>Item core</span></div>'
      + '<div class="pt-ton"><b>Tonase Kendaraan (ctn)</b><table>' + kendKeys().map(k => '<tr><td><input class="pt-cap" data-k="' + E(k) + '" inputmode="numeric" value="' + n0(P.cfg.kend[k]) + '"></td><td>' + E(k) + '</td></tr>').join('') + '</table></div>'
      + '<div class="pt-leg"><span>Rata-rata PB per minggu = ' + (P.nw ? 'rata-rata ' + P.nw + ' minggu terakhir yang tersedia' : 'belum ada data') + ' (arsip PB) · JML TOKO JUAL = jumlah toko yang punya item tersebut</span></div>';
  }
  function paint() {
    const el = root(); if (!el) return; css();
    if (!adm()) { el.innerHTML = '<div class="card empty" style="margin-top:10px">Halaman ini hanya untuk administrator.</div>'; return; }
    if (P.loading) { el.innerHTML = head() + '<div class="card empty" style="margin-top:12px"><span class="spin"></span><div>Memuat PO TAKAKI…</div></div>'; bindHead(); return; }
    if (P.err || !P.ready) {
      el.innerHTML = head() + '<div class="card empty" style="color:#b00020;margin-top:12px">Gagal memuat: ' + E(P.err || 'belum dimuat')
        + (P.noTbl ? '<br><span class="note">Jalankan <b>migrasi-po-takaki.sql</b> di Supabase (SQL Editor) lalu klik Muat ulang.</span>' : '') + '</div>';
      bindHead(); return;
    }
    if (P.tab === 'kirim') { el.innerHTML = head() + kirimPage(); bindHead(); return; }
    el.innerHTML = head() + '<div id="ptReco">' + recoHtml() + '</div>' + tableHtml() + tonHtml();
    bindHead(); recalc(); fixSticky();
  }
  // header 3 baris menempel di atas saat tabel digulir: tinggi baris diukur setelah tampil
  function fixSticky() {
    const r1 = Q('#vPoTakaki tr.h1'), r2 = Q('#vPoTakaki tr.h2'), r3 = Q('#vPoTakaki tr.h3'); if (!r1 || !r2 || !r3) return;
    const a = r1.getBoundingClientRect().height, b = r2.getBoundingClientRect().height;
    r2.querySelectorAll('th').forEach(t => { t.style.top = a + 'px'; });
    r3.querySelectorAll('th').forEach(t => { t.style.top = (a + b) + 'px'; });
  }
  const setT = (k, t) => { const c = Q('#vPoTakaki [data-k="' + k + '"]'); if (c) c.textContent = t; };
  function setBuf(k, v, s) {
    const c = Q('#vPoTakaki [data-k="' + k + '"]'); if (!c) return;
    const w = Math.min(100, v * 100 / 3);   // batang penuh pada buffer 300%
    c.textContent = n0(v * 100) + '%'; c.classList.toggle('z', s <= 0);
    c.style.background = s > 0 && w > 0 ? 'linear-gradient(90deg,#f6b26b ' + w + '%,#fff3e0 ' + w + '%)' : '';
  }
  function recalc() {
    const C = calc(), pos = P.pos;
    C.rows.forEach(x => {
      const p = x.r.plu;
      pos.forEach((po, k) => setT('c|' + po.id + '|' + p, x.ctn[k] ? n0(x.ctn[k]) : '-'));
      setT('t|' + p, x.tot ? n0(x.tot) : '-');
      setT('s1|' + p, n0(x.r.s1)); const c1 = Q('#vPoTakaki [data-k="s1|' + p + '"]'); if (c1) c1.classList.toggle('z', x.r.s1 <= 0);
      setT('s2|' + p, n0(x.s2)); const c2 = Q('#vPoTakaki [data-k="s2|' + p + '"]'); if (c2) c2.classList.toggle('z', x.s2 <= 0);
      setBuf('b1|' + p, x.b1, x.r.s1); setBuf('b2|' + p, x.b2, x.s2);
      setT('d1|' + p, x.d1 == null ? '-' : n0(x.d1)); setT('d2|' + p, x.d2 == null ? '-' : n0(x.d2));
    });
    const T = C.T, bt = s => T.avg > 0 ? Math.max(0, (s - T.avg) / T.avg) : 0;
    pos.forEach((po, k) => {
      setT('gp|' + po.id, fmtP1(T.pal[k])); setT('gc|' + po.id, T.ctn[k] ? n0(T.ctn[k]) : '-');
      const cap = capOf(po), left = cap - T.ctn[k], c = Q('#vPoTakaki [data-k="cap|' + po.id + '"]');
      if (c) { c.textContent = muatText(po, T.ctn[k]); c.title = 'Muatan ' + n0(T.ctn[k]) + ' dari ' + n0(cap) + ' ctn (' + po.kendaraan + ')'; c.classList.toggle('neg', left < 0); c.style.textAlign = 'center'; }
    });
    setT('gt', T.tot ? n0(T.tot) : '-'); setT('gs1', n0(T.s1)); setT('gs2', n0(T.s2));
    const g1 = Q('#vPoTakaki [data-k="gb1"]'), g2 = Q('#vPoTakaki [data-k="gb2"]'); if (g1) g1.textContent = n0(bt(T.s1) * 100) + '%'; if (g2) g2.textContent = n0(bt(T.s2) * 100) + '%';
    setT('gd1', T.qc > 0 ? n0(T.s1 / T.qc) : '-'); setT('gd2', T.qc > 0 ? n0(T.s2 / T.qc) : '-'); setT('gq', q1(T.qc)); setT('ga', n0(T.avg));
    const rc = Q('#ptReco'); if (rc && !rc.contains(document.activeElement)) rc.innerHTML = recoHtml();
  }

  // ---------------- download (JPG / Excel) ----------------
  const saveBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  const fname = ext => 'PO TAKAKI ' + (P.reqFrom || '') + ' s.d. ' + (P.reqTo || '') + '.' + ext;
  const poLabel = (po, i) => 'PO ' + (i + 1) + ' (Kirim ' + (po.tgl_kirim ? dmm(po.tgl_kirim) : '?') + ')';

  async function downloadJpg() {
    const C = calc(), pos = P.pos, np = pos.length, T = C.T;
    const FF = 'font-family:Calibri,Arial,sans-serif;', bd = 'border:1px solid #8b9490;', bdl = 'border:1px solid #cfd6d3;';
    const Y = '#ffe600', G = '#d9f0e2', B = '#d4f1f9', TN = '#e9dfd6', PC = '#fde9d9', CORE = '#e3f5e8';
    const th = (t, bg, at) => '<th ' + (at || '') + ' style="' + FF + bd + 'padding:3px 7px;background-color:' + bg + ';color:#111;font-size:11px;font-weight:bold;text-align:center;white-space:nowrap">' + t + '</th>';
    const td = (t, bg, st) => '<td style="' + FF + bdl + 'padding:2px 7px;background-color:' + bg + ';color:#111;font-size:12px;white-space:nowrap;text-align:right;' + (st || '') + '">' + t + '</td>';
    const bufTd = (v, st) => { const w = Math.min(100, v * 100 / 3); return td(n0(v * 100) + '%', '#ffffff', 'min-width:58px;' + (st <= 0 ? 'background-color:#fdd4d6;color:#9c0006;font-weight:bold;' : (w > 0 ? 'background-image:linear-gradient(90deg,#f6b26b ' + w + '%,#fff3e0 ' + w + '%);' : ''))); };
    const zc = v => v <= 0 ? 'background-color:#fdd4d6;color:#9c0006;font-weight:bold;' : '';
    const d1 = dmy(hdrD()), ds = dmm(hdrD()).replace(' ', '-');
    let h = '<div style="' + FF + 'display:inline-block;background-color:#ffffff;padding:10px"><div style="font-weight:bold;font-size:19px;color:#111">EST. PO TAKAKI JATIM</div>'
      + '<div style="font-size:12px;color:#333;padding-bottom:5px">' + E(reqLine()) + ' · satuan CTN</div>'
      + '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse"><thead>'
      + '<tr>' + th('NO', '#fff', 'rowspan="3"') + th('PLU DC', '#fff', 'rowspan="3"') + th('DESCRIPTION', '#fff', 'rowspan="3"') + th('FRC', '#fff', 'rowspan="3"')
      + th('PO TAKAKI', Y, 'colspan="' + (np ? np * 2 : 2) + '"') + th('TOTAL<br>PO', Y, 'rowspan="2"') + th('EST. STOCK DCF ' + E(d1), G, 'colspan="4"') + th('DSI DCF ' + E(d1), B, 'colspan="2"')
      + th('QPD<br>(Ctn)', TN, 'rowspan="2"') + th('JML TOKO<br>JUAL', Y, 'rowspan="2"') + th('AVERAGE', PC) + '</tr>'
      + '<tr>' + (np ? pos.map((po, i) => th(E(poLabel(po, i)), Y, 'colspan="2"')).join('') : th('belum ada PO', Y, 'colspan="2"'))
      + th('JIKA TANPA<br>FORECAST', G, 'colspan="2"') + th('JIKA ADA<br>FORECAST', G, 'colspan="2"') + th('JIKA TANPA<br>FORECAST', B) + th('JIKA ADA<br>FORECAST', B) + th('OUTB (PB)', PC) + '</tr>'
      + '<tr>' + (np ? pos.map(() => th('PALLET', Y) + th('CTN', Y)).join('') : th('PALLET', Y) + th('CTN', Y)) + th('CTN', Y)
      + th('STOCK', G) + th('BUFFER %', G) + th('STOCK', G) + th('BUFFER %', G) + th(E(ds), B) + th(E(ds), B) + th('per hari', TN) + th('(toko)', Y) + th('PER WEEK', PC) + '</tr></thead><tbody>';
    C.rows.forEach((x, n) => {
      const r = x.r, cb = r.core ? CORE : '#ffffff';
      h += '<tr>' + td(n + 1, '#fff', 'text-align:center') + td(E(r.plu), cb, 'text-align:left') + td(E(r.desk), cb, 'text-align:left') + td(r.frc ? n0(r.frc) : '-', '#fff', 'text-align:center')
        + (np ? pos.map((po, k) => td(fmtP(palOf(po.id, r.plu)) || '-', '#fffdf0', 'color:#1f4fd8;font-weight:bold') + td(x.ctn[k] ? n0(x.ctn[k]) : '-', '#fff')).join('') : td('-', '#fffdf0') + td('-', '#fff'))
        + td(x.tot ? n0(x.tot) : '-', '#fff', 'font-weight:bold') + td(n0(r.s1), '#fff', zc(r.s1)) + bufTd(x.b1, r.s1) + td(n0(x.s2), '#fff', zc(x.s2)) + bufTd(x.b2, x.s2)
        + td(x.d1 == null ? '-' : n0(x.d1), '#fff') + td(x.d2 == null ? '-' : n0(x.d2), '#fff') + td(q1(r.qc), '#fff') + td(x.inf.toko ? n0(x.inf.toko) : '-', '#fff9a6') + td(x.inf.avg ? n0(x.inf.avg) : '-', '#fff') + '</tr>';
    });
    const gb = s => T.avg > 0 ? Math.max(0, (s - T.avg) / T.avg) : 0, tb = 'font-weight:bold;border-top:2px solid #6f7c76;';
    h += '<tr>' + td('Grand Total', G, 'text-align:left;' + tb).replace('<td ', '<td colspan="4" ')
      + (np ? pos.map((po, k) => td(fmtP1(T.pal[k]), G, tb) + td(T.ctn[k] ? n0(T.ctn[k]) : '-', G, tb)).join('') : td('', G, tb) + td('', G, tb))
      + td(T.tot ? n0(T.tot) : '-', G, tb) + td(n0(T.s1), G, tb) + td(n0(gb(T.s1) * 100) + '%', G, tb) + td(n0(T.s2), G, tb) + td(n0(gb(T.s2) * 100) + '%', G, tb)
      + td(T.qc > 0 ? n0(T.s1 / T.qc) : '-', G, tb) + td(T.qc > 0 ? n0(T.s2 / T.qc) : '-', G, tb) + td(q1(T.qc), G, tb) + td('', G, tb) + td(n0(T.avg), G, tb) + '</tr>';
    if (np) {
      h += '<tr>' + td('Muatan kendaraan', PC, 'text-align:left;font-weight:bold').replace('<td ', '<td colspan="4" ')
        + pos.map((po, k) => { const cap = capOf(po), left = cap - T.ctn[k]; return td(muatText(po, T.ctn[k]), PC, 'text-align:center;font-weight:bold;' + (left < 0 ? 'color:#c00000;' : '')).replace('<td ', '<td colspan="2" '); }).join('')
        + '<td colspan="10" style="background-color:' + PC + ';' + bdl + '"></td></tr>';
    }
    h += '</tbody></table><div style="font-size:11px;color:#333;padding-top:6px"><span style="display:inline-block;width:14px;height:11px;background-color:' + CORE + ';border:1px solid #999;vertical-align:-1px"></span> item core</div>'
      + '<div style="display:inline-block;margin-top:6px;background-color:#fbe5d6;border:1px solid #efc9ae;padding:5px 12px;font-size:12px"><b>Tonase Kendaraan (ctn)</b>'
      + kendKeys().map(k => '<div><b style="display:inline-block;width:46px;text-align:right">' + n0(P.cfg.kend[k]) + '</b> ' + E(k) + '</div>').join('') + '</div></div>';
    await htmlToJpg(h, fname('jpg'));
  }

  // html bergaya inline -> JPG (dipakai Hitung PO dan Kirim PO)
  async function htmlToJpg(h, name) {
    const hold = document.createElement('div'); hold.style.cssText = 'position:fixed;left:-99999px;top:0'; hold.innerHTML = h; document.body.appendChild(hold);
    const el = hold.firstElementChild, w = Math.ceil(el.offsetWidth) + 2, ht = Math.ceil(el.offsetHeight) + 2; hold.remove();
    // Ukuran ukur di halaman bisa lebih kecil dari hasil gambar (gaya halaman ikut mempengaruhi) -> kanvas dibuat longgar,
    // lalu dipotong tepat pada isi tabel (piksel non-putih) supaya kolom paling kanan tidak terpotong.
    const W = Math.ceil(w * 1.35) + 240, H = Math.ceil(ht * 1.2) + 120;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">' + h.replace(/&nbsp;/g, '&#160;').replace(/<br>/g, '<br/>') + '</div></foreignObject></svg>';
    const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('gagal merender gambar')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    let x0 = 0, y0 = 0, x1 = w, y1 = ht;
    try {
      const c0 = document.createElement('canvas'); c0.width = W; c0.height = H;
      const g0 = c0.getContext('2d'); g0.fillStyle = '#fff'; g0.fillRect(0, 0, W, H); g0.drawImage(img, 0, 0);
      const px = g0.getImageData(0, 0, W, H).data; let a = W, b = H, c1 = -1, d1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0, i = y * W * 4; x < W; x++, i += 4) {
        if (px[i] < 245 || px[i + 1] < 245 || px[i + 2] < 245) { if (x < a) a = x; if (x > c1) c1 = x; if (y < b) b = y; if (y > d1) d1 = y; }
      }
      if (c1 >= 0) { x0 = a; y0 = b; x1 = c1 + 1; y1 = d1 + 1; }
    } catch (e) { x1 = Math.min(W, Math.ceil(w * 1.15) + 40); y1 = Math.min(H, Math.ceil(ht * 1.05) + 20); }
    const M = 12, cx = Math.max(0, x0 - M), cy = Math.max(0, y0 - M), cw = Math.min(W, x1 + M) - cx, ch = Math.min(H, y1 + M) - cy;
    const sc = Math.max(1, Math.min(3, Math.floor(14000 / Math.max(cw, ch)))), c = document.createElement('canvas'); c.width = cw * sc; c.height = ch * sc;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.scale(sc, sc); g.translate(-cx, -cy); g.drawImage(img, 0, 0);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', .93)); if (!blob) throw new Error('gagal membuat JPG');
    saveBlob(blob, name);
  }

  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
      s.onload = () => window.ExcelJS ? ok(window.ExcelJS) : no(new Error('Pustaka Excel gagal dimuat.'));
      s.onerror = () => no(new Error('Pustaka Excel gagal dimuat. Periksa koneksi internet lalu coba lagi.'));
      document.head.appendChild(s);
    });
  }
  // Excel: tabel sama dengan halaman, memakai rumus (CTN = ROUND(pallet x ctn/plt), STOCK ada forecast = STOCK + TOTAL PO, buffer, DSI) agar bisa diedit lagi
  async function downloadXlsx() {
    const EJ = await loadExcelJS(), C = calc(), pos = P.pos, np = pos.length, T = C.T, n = C.rows.length;
    const wb = new EJ.Workbook(), ws = wb.addWorksheet('PO TAKAKI', { properties: { tabColor: { argb: 'FFFFE600' } } });
    const L = c => { let t = ''; while (c > 0) { const m = (c - 1) % 26; t = String.fromCharCode(65 + m) + t; c = Math.floor((c - 1) / 26); } return t; };
    const solid = a => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });
    const bx = { top: { style: 'thin', color: { argb: 'FF8B9490' } }, left: { style: 'thin', color: { argb: 'FF8B9490' } }, bottom: { style: 'thin', color: { argb: 'FF8B9490' } }, right: { style: 'thin', color: { argb: 'FF8B9490' } } };
    const Y = 'FFFFE600', G = 'FFD9F0E2', B = 'FFD4F1F9', TN = 'FFE9DFD6', PC = 'FFFDE9D9', PL = 'FFFFF9A6', GT = 'FFD9F0E2';
    const cT = 5 + 2 * np, c1 = cT + 1, cb1 = cT + 2, cs2 = cT + 3, cb2 = cT + 4, cd1 = cT + 5, cd2 = cT + 6, cq = cT + 7, cj = cT + 8, ca = cT + 9, NC = ca;
    const R0 = 7, RG = R0 + n;
    const put = (r, c, v, o) => { const cell = ws.getCell(r, c); if (v !== undefined && v !== null) cell.value = v; o = o || {};
      cell.font = Object.assign({ name: 'Calibri', size: 10 }, o.font || {}); cell.alignment = Object.assign({ vertical: 'middle', horizontal: o.h || 'right', wrapText: !!o.wrap }, {}); cell.border = bx;
      if (o.fill) cell.fill = solid(o.fill); if (o.nf) cell.numFmt = o.nf; return cell; };
    const merge = (r1, c1_, r2, c2, v, o) => { for (let r = r1; r <= r2; r++) for (let c = c1_; c <= c2; c++) put(r, c, null, o); if (r1 !== r2 || c1_ !== c2) ws.mergeCells(r1, c1_, r2, c2); put(r1, c1_, v, o); };
    ws.getCell(1, 1).value = 'EST. PO TAKAKI JATIM'; ws.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true };
    ws.getCell(2, 1).value = reqLine() + ' (satuan CTN)'; ws.getCell(2, 1).font = { name: 'Calibri', size: 10 };
    ws.getCell(3, 4).value = 'ctn/plt'; ws.getCell(3, 4).font = { name: 'Calibri', size: 9, italic: true }; ws.getCell(3, 4).alignment = { horizontal: 'right' };
    pos.forEach((po, k) => { const c = ws.getCell(3, 5 + 2 * k); c.value = cpOf(po); c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1F4FD8' } }; c.alignment = { horizontal: 'center' }; });
    const H = { font: { bold: true, size: 10 }, h: 'center', wrap: true };
    const hd = (bg) => Object.assign({}, H, { fill: bg });
    ['NO', 'PLU DC', 'DESCRIPTION', 'FRC'].forEach((t, i) => merge(4, i + 1, 6, i + 1, t, hd('FFFFFFFF')));
    if (np) merge(4, 5, 4, 4 + 2 * np, 'PO TAKAKI', hd(Y));
    pos.forEach((po, k) => { const pc = 5 + 2 * k; merge(5, pc, 5, pc + 1, poLabel(po, k), hd(Y)); put(6, pc, 'PALLET', hd(Y)); put(6, pc + 1, 'CTN', hd(Y)); });
    merge(4, cT, 5, cT, 'TOTAL PO', hd(Y)); put(6, cT, 'CTN', hd(Y));
    merge(4, c1, 4, cb2, 'EST. STOCK DCF ' + dmy(hdrD()), hd(G));
    merge(5, c1, 5, cb1, 'JIKA TANPA FORECAST', hd(G)); merge(5, cs2, 5, cb2, 'JIKA ADA FORECAST', hd(G));
    put(6, c1, 'STOCK', hd(G)); put(6, cb1, 'BUFFER %', hd(G)); put(6, cs2, 'STOCK', hd(G)); put(6, cb2, 'BUFFER %', hd(G));
    merge(4, cd1, 4, cd2, 'DSI DCF ' + dmy(hdrD()), hd(B)); put(5, cd1, 'JIKA TANPA FORECAST', hd(B)); put(5, cd2, 'JIKA ADA FORECAST', hd(B));
    put(6, cd1, dmm(hdrD()).replace(' ', '-'), hd(B)); put(6, cd2, dmm(hdrD()).replace(' ', '-'), hd(B));
    merge(4, cq, 5, cq, 'QPD (Ctn)', hd(TN)); put(6, cq, 'per hari', hd(TN));
    merge(4, cj, 5, cj, 'JML TOKO JUAL', hd(Y)); put(6, cj, '(toko)', hd(Y));
    put(4, ca, 'AVERAGE', hd(PC)); put(5, ca, 'OUTB (PB)', hd(PC)); put(6, ca, 'PER WEEK', hd(PC));
    ws.getRow(5).height = 28; ws.getRow(3).hidden = true;   // ctn/plt dipakai rumus tetapi tidak ditampilkan
    const NI = '#,##0', NP = '0%', N1 = '#,##0.0', NPL = '#,##0.0#';
    C.rows.forEach((x, i) => {
      const r = R0 + i, rr = x.r, f = (fml, res) => ({ formula: fml, result: res });
      put(r, 1, i + 1, { h: 'center' }); put(r, 2, rr.plu, { h: 'left', nf: '@', fill: rr.core ? 'FFE3F5E8' : null }); put(r, 3, rr.desk, { h: 'left', fill: rr.core ? 'FFE3F5E8' : null }); put(r, 4, rr.frc || null, { h: 'center', nf: NI });
      pos.forEach((po, k) => { const pc = 5 + 2 * k, pal = palOf(po.id, rr.plu);
        put(r, pc, pal || null, { nf: NPL, font: { color: { argb: 'FF1F4FD8' }, bold: true }, fill: 'FFFFFDF0' });
        put(r, pc + 1, f('ROUND(' + L(pc) + r + '*' + L(pc) + '$3,0)', x.ctn[k]), { nf: NI }); });
      put(r, cT, np ? f('SUM(' + pos.map((po, k) => L(6 + 2 * k) + r).join(',') + ')', x.tot) : 0, { nf: NI, font: { bold: true } });
      put(r, c1, rr.s1, { nf: NI });
      put(r, cb1, f('IF(' + L(ca) + r + '>0,MAX(0,(' + L(c1) + r + '-' + L(ca) + r + ')/' + L(ca) + r + '),0)', x.b1), { nf: NP });
      put(r, cs2, f(L(c1) + r + '+' + L(cT) + r, x.s2), { nf: NI });
      put(r, cb2, f('IF(' + L(ca) + r + '>0,MAX(0,(' + L(cs2) + r + '-' + L(ca) + r + ')/' + L(ca) + r + '),0)', x.b2), { nf: NP });
      put(r, cd1, f('IF(' + L(cq) + r + '>0,' + L(c1) + r + '/' + L(cq) + r + ',"")', x.d1 == null ? '' : x.d1), { nf: NI });
      put(r, cd2, f('IF(' + L(cq) + r + '>0,' + L(cs2) + r + '/' + L(cq) + r + ',"")', x.d2 == null ? '' : x.d2), { nf: NI });
      put(r, cq, rr.qc, { nf: N1 }); put(r, cj, x.inf.toko || null, { nf: NI, fill: PL }); put(r, ca, x.inf.avg, { nf: NI });
    });
    // Grand Total
    const G0 = { fill: GT, font: { bold: true, size: 10 } }, sum = (c) => 'SUM(' + L(c) + R0 + ':' + L(c) + (RG - 1) + ')';
    merge(RG, 1, RG, 4, 'Grand Total', Object.assign({ h: 'left' }, G0));
    pos.forEach((po, k) => { put(RG, 5 + 2 * k, { formula: sum(5 + 2 * k), result: T.pal[k] }, Object.assign({ nf: NPL }, G0)); put(RG, 6 + 2 * k, { formula: sum(6 + 2 * k), result: T.ctn[k] }, Object.assign({ nf: NI }, G0)); });
    const bt = s => T.avg > 0 ? Math.max(0, (s - T.avg) / T.avg) : 0;
    put(RG, cT, { formula: sum(cT), result: T.tot }, Object.assign({ nf: NI }, G0)); put(RG, c1, { formula: sum(c1), result: T.s1 }, Object.assign({ nf: NI }, G0));
    put(RG, cb1, { formula: 'IF(' + L(ca) + RG + '>0,MAX(0,(' + L(c1) + RG + '-' + L(ca) + RG + ')/' + L(ca) + RG + '),0)', result: bt(T.s1) }, Object.assign({ nf: NP }, G0));
    put(RG, cs2, { formula: sum(cs2), result: T.s2 }, Object.assign({ nf: NI }, G0));
    put(RG, cb2, { formula: 'IF(' + L(ca) + RG + '>0,MAX(0,(' + L(cs2) + RG + '-' + L(ca) + RG + ')/' + L(ca) + RG + '),0)', result: bt(T.s2) }, Object.assign({ nf: NP }, G0));
    put(RG, cd1, { formula: 'IF(' + L(cq) + RG + '>0,' + L(c1) + RG + '/' + L(cq) + RG + ',"")', result: T.qc > 0 ? T.s1 / T.qc : '' }, Object.assign({ nf: NI }, G0));
    put(RG, cd2, { formula: 'IF(' + L(cq) + RG + '>0,' + L(cs2) + RG + '/' + L(cq) + RG + ',"")', result: T.qc > 0 ? T.s2 / T.qc : '' }, Object.assign({ nf: NI }, G0));
    put(RG, cq, { formula: sum(cq), result: T.qc }, Object.assign({ nf: N1 }, G0)); put(RG, cj, null, G0); put(RG, ca, { formula: sum(ca), result: T.avg }, Object.assign({ nf: NI }, G0));
    // Muatan kendaraan (nama kendaraan; 100% = nama saja), lalu kapasitas & sisa
    let rr2 = RG + 1;
    if (np) {
      const lab = (r, t) => merge(r, 1, r, 4, t, { h: 'left', fill: PC, font: { bold: true, size: 10 } });
      lab(rr2, 'Muatan kendaraan'); lab(rr2 + 1, 'Kapasitas kendaraan (ctn)'); lab(rr2 + 2, 'Sisa kapasitas (ctn)');
      pos.forEach((po, k) => { const pc = 5 + 2 * k, cap = capOf(po), cc = L(pc) + (rr2 + 1), tc = L(pc + 1) + RG, kn = String(po.kendaraan).replace(/"/g, '""');
        const fm = 'IF(AND(' + cc + '>0,' + cc + '-' + tc + '=0),"' + kn + '","' + kn + ' · "&IF(' + cc + '-' + tc + '<0,"Lebih ","Sisa ")&TEXT(ABS(' + cc + '-' + tc + '),"#,##0")&" / "&TEXT(' + cc + ',"#,##0")&" ("&TEXT(IF(' + cc + '>0,IF(' + cc + '>' + tc + ',INT(' + tc + '/' + cc + '*100),ROUND(' + tc + '/' + cc + '*100,0)),0)/100,"0%")&")")';
        merge(rr2, pc, rr2, pc + 1, { formula: fm, result: muatText(po, T.ctn[k]) }, { h: 'center', fill: PC, font: { bold: true, size: 10 } });
        merge(rr2 + 1, pc, rr2 + 1, pc + 1, cap, { nf: NI, h: 'center', fill: PC, font: { bold: true, size: 10 } });
        merge(rr2 + 2, pc, rr2 + 2, pc + 1, { formula: cc + '-' + tc, result: cap - T.ctn[k] }, { nf: '#,##0;[Red]-#,##0', h: 'center', fill: PC, font: { bold: true, size: 10 } }); });
      rr2 += 3;
    }
    // Tonase kendaraan
    rr2 += 1; ws.getCell(rr2, 1).value = 'Tonase Kendaraan (ctn)'; ws.getCell(rr2, 1).font = { name: 'Calibri', size: 10, bold: true };
    kendKeys().forEach((k, i) => { const r = rr2 + 1 + i; put(r, 1, null, { fill: 'FFFBE5D6' }); put(r, 2, P.cfg.kend[k], { nf: NI, fill: 'FFFBE5D6', font: { bold: true } }); put(r, 3, k, { h: 'left', fill: 'FFFBE5D6' }); });
    ws.getCell(rr2 + Object.keys(P.cfg.kend).length + 2, 1).value = 'Item core diberi warna hijau (sama dengan Stock DCF). Kolom CTN, STOCK, BUFFER, DSI memakai rumus sehingga ikut berubah bila PALLET / ctn per pallet diubah. ctn per pallet ada di baris 3 (disembunyikan; klik kanan nomor baris > Unhide untuk mengubah).';
    ws.getCell(rr2 + Object.keys(P.cfg.kend).length + 2, 1).font = { name: 'Calibri', size: 9, italic: true };
    // lebar kolom, bekukan header, nol = merah muda
    const wd = { 1: 5, 2: 11, 3: 30, 4: 6 }; wd[cT] = 9; wd[c1] = 9; wd[cb1] = 10; wd[cs2] = 9; wd[cb2] = 10; wd[cd1] = 11; wd[cd2] = 11; wd[cq] = 9; wd[cj] = 10; wd[ca] = 11;
    for (let c = 1; c <= NC; c++) ws.getColumn(c).width = wd[c] || (c >= 5 && c < cT ? ((c - 5) % 2 === 0 ? 9 : 8) : 9);
    ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 6, showGridLines: false }];
    try {
      [c1, cb1, cs2, cb2].forEach(c => ws.addConditionalFormatting({ ref: L(c) + R0 + ':' + L(c) + (RG - 1), rules: [{ type: 'cellIs', operator: 'equal', formulae: [0], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFDD4D6' } }, font: { color: { argb: 'FF9C0006' } } } }] }));
    } catch (e) { /* format bersyarat opsional */ }
    const buf = await wb.xlsx.writeBuffer();
    saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname('xlsx'));
  }

  // ======================= Kirim PO =======================
  // Lembar PO yang dikirim ke Takaki: data diambil dari Hitung PO (item, stock, PO 1..n). Download JPG / Excel.
  const pad2 = v => String(v).padStart(2, '0');
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const tglPO = () => P.tglPO || todayIso();                       // otomatis hari ini, bisa diubah
  const tglPOText = () => { const t = tglPO(); return pd(t).getUTCDate() + ' ' + MONL[pd(t).getUTCMonth()] + " '" + String(pd(t).getUTCFullYear()).slice(2); };
  const kirimLabel = (po, i) => 'PO ' + (i + 1) + ' (kirim ' + (po.tgl_kirim ? dml(po.tgl_kirim) : '? ' + MONL[pd(P.reqFrom).getUTCMonth()]) + ')';
  const kirimFname = ext => 'PO TAKAKI ' + tglPO() + '.' + ext;
  function kirimData() {
    const C = calc(), pos = P.pos, T = C.T;
    const rows = C.rows.map(x => ({ plu: x.r.plu, desk: x.r.desk, core: x.r.core, frc: x.r.frc, s1: x.r.s1, qc: x.r.qc, pal: pos.map(po => palOf(po.id, x.r.plu)), ctn: x.ctn, pcs: x.ctn.map(c => c * (x.r.frc || 0)), d1: x.d1, d2: x.d2 }));
    const pcs = pos.map((po, k) => rows.reduce((a, r) => a + r.pcs[k], 0));
    return { rows, pos, T, pcs, d1: T.qc > 0 ? T.s1 / T.qc : null, d2: T.qc > 0 ? T.s2 / T.qc : null, avg: rows.length ? T.s1 / rows.length : 0 };
  }
  const KFF = 'font-family:Calibri,Arial,sans-serif;', KB = 'border:1px solid #333;';
  const KS = {
    h: KB + 'background-color:#ffe600;font-weight:bold;text-align:center;', hb: KB + 'background-color:#cfe8f7;font-weight:bold;text-align:center;',
    hw: KB + 'background-color:#ffffff;font-weight:bold;text-align:center;', hn: 'border:0;background-color:#ffffff;text-align:center;', nb: 'border:0;background-color:#ffffff;',
    l: KB + 'text-align:left;', c: KB + 'text-align:center;', r: KB + 'text-align:right;', core: KB + 'background-color:#e3f5e8;text-align:left;',
    tl: KB + 'background-color:#ffe600;font-weight:bold;text-align:left;', ty: KB + 'background-color:#ffe600;font-weight:bold;text-align:right;', tr: KB + 'font-weight:bold;text-align:right;',
    tc: KB + 'font-weight:bold;text-align:center;', av: 'border:0;background-color:#ffffff;font-weight:bold;text-align:center;'
  };
  const kc = (t, k, at) => '<td ' + (at || '') + ' style="' + KFF + 'padding:2px 7px;font-size:12px;color:#111;white-space:nowrap;vertical-align:middle;' + KS[k] + '">' + t + '</td>';
  // dokumen (judul + tabel) bergaya inline: sama untuk tampilan halaman dan JPG; web = true menambah isian tanggal kirim di header PO
  function kirimDoc(web) {
    const D = kirimData(), pos = D.pos, np = pos.length, d1 = dmy(hdrD()), T = D.T;
    const pcsT = D.pcs.reduce((a, b) => a + b, 0), q = v => v == null ? '-' : n0(v);
    let h = '<div style="' + KFF + 'display:inline-block;background-color:#ffffff;padding:10px 12px"><div style="font-weight:bold;font-size:20px;color:#000">PO TAKAKI (U/ DCF SBY)</div>'
      + '<div style="font-style:italic;font-size:12px;color:#000;padding-bottom:6px">Tanggal PO : ' + E(tglPOText()) + '</div>'
      + '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse"><thead>'
      + '<tr>' + kc('', 'nb', 'colspan="5"') + (np ? kc('PO TAKAKI', 'hw', 'colspan="' + 3 * np + '"') : '') + kc('', 'nb', 'colspan="2"') + '</tr>'
      + '<tr>' + kc('PLU_DC', 'hw', 'rowspan="2"') + kc('DESCRIPTION', 'hw', 'rowspan="2"') + kc('FRC', 'hw', 'rowspan="2"') + kc('EST. STOCK<br>AKHIR DCF<br>' + E(d1), 'h', 'rowspan="2"') + kc('QPD<br>(CTN)', 'hb', 'rowspan="2"')
      + pos.map((po, i) => kc(E(kirimLabel(po, i)) + (web ? '<br><input type="date" class="pt-dt" data-po="' + E(po.id) + '" value="' + E(po.tgl_kirim || '') + '" style="font-size:11px;width:118px" title="Tanggal kirim PO ini (sama dengan Hitung PO)">' : ''), 'h', 'colspan="3"')).join('')
      + kc('DSI DCF', 'h', 'colspan="2"') + '</tr>'
      + '<tr>' + pos.map(() => kc('PALLET', 'h') + kc('CTN', 'h') + kc('PCS', 'h')).join('') + kc('AWAL', 'h') + kc('AKHIR', 'h') + '</tr></thead><tbody>';
    D.rows.forEach(r => {
      const ck = r.core ? 'core' : 'l';
      h += '<tr>' + kc(E(r.plu), ck) + kc(E(r.desk), ck) + kc(r.frc ? n0(r.frc) : '-', 'c') + kc(n0(r.s1), 'r') + kc(q1(r.qc), 'r')
        + pos.map((po, k) => kc(fmtP1(r.pal[k]), 'c') + kc(r.ctn[k] ? n0(r.ctn[k]) : '-', 'c') + kc(r.pcs[k] ? n0(r.pcs[k]) : '-', 'c')).join('')
        + kc(q(r.d1), 'c') + kc(q(r.d2), 'c') + '</tr>';
    });
    h += '<tr>' + kc('Grand Total', 'tl', 'colspan="3"') + kc(n0(T.s1), 'ty') + kc(q1(T.qc), 'tr')
      + pos.map((po, k) => kc(fmtP1(T.pal[k]), 'tc') + kc(T.ctn[k] ? n0(T.ctn[k]) : '-', 'tc') + kc(D.pcs[k] ? n0(D.pcs[k]) : '-', 'tc')).join('')
      + kc(q(D.d1), 'tc') + kc(q(D.d2), 'tc') + '</tr>'
      + '<tr>' + kc('AVERAGE STOCK DCF', 'hn', 'colspan="3"') + kc(n0(D.avg) + ' CTN', 'av', 'colspan="2"') + pos.map(po => kc(E(po.kendaraan), 'av', 'colspan="3"')).join('') + kc('', 'nb', 'colspan="2"') + '</tr>'
      + '</tbody></table></div>';
    return h;
  }
  function kirimPage() {
    let h = '<div class="pt-card"><div class="pt-row"><div><label class="k">Tanggal PO</label><br><input type="date" class="in" id="ptTgl" value="' + E(tglPO()) + '"></div>'
      + '<button class="b s" id="ptTglNow" title="Kembali otomatis ke hari ini">Hari ini</button>'
      + '<span class="pt-s" style="padding-bottom:6px">Data (item, stock, PO 1-' + Math.max(1, P.pos.length) + ') diambil dari Hitung PO. Tanggal kirim tiap PO bisa diisi langsung di header tabel.</span></div></div>';
    if (!P.pos.length) h += '<div class="card empty" style="margin-top:10px">Belum ada PO. Tambah PO (mobil) di tab <b>Hitung PO</b> terlebih dulu.</div>';
    h += '<div class="pt-wrap" style="margin-top:10px">' + kirimDoc(true) + '</div>';
    return h;
  }
  async function downloadKirimJpg() { await htmlToJpg(kirimDoc(false), kirimFname('jpg')); }
  async function downloadKirimXlsx() {
    const EJ = await loadExcelJS(), D = kirimData(), pos = D.pos, np = pos.length, n = D.rows.length, T = D.T;
    const wb = new EJ.Workbook(), ws = wb.addWorksheet('PO TAKAKI', { properties: { tabColor: { argb: 'FFFFE600' } } });
    const L = c => { let t = ''; while (c > 0) { const m = (c - 1) % 26; t = String.fromCharCode(65 + m) + t; c = Math.floor((c - 1) / 26); } return t; };
    const solid = a => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });
    const bs = { style: 'thin', color: { argb: 'FF333333' } }, bx = { top: bs, left: bs, bottom: bs, right: bs };
    const Y = 'FFFFE600', BL = 'FFCFE8F7', CORE = 'FFE3F5E8';
    const put = (r, c, v, o) => { const cell = ws.getCell(r, c); if (v !== undefined && v !== null) cell.value = v; o = o || {};
      cell.font = Object.assign({ name: 'Calibri', size: 10 }, o.font || {}); cell.alignment = { vertical: 'middle', horizontal: o.h || 'right', wrapText: !!o.wrap };
      if (!o.nb) cell.border = bx; if (o.fill) cell.fill = solid(o.fill); if (o.nf) cell.numFmt = o.nf; return cell; };
    const merge = (r1, c1, r2, c2, v, o) => { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) put(r, c, null, o); if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2); put(r1, c1, v, o); };
    const cd1 = 6 + 3 * np, cd2 = cd1 + 1, R0 = 7, RG = R0 + n, RA = RG + 1, NC = cd2;
    const NI = '#,##0;-#,##0;"-"', NP = '#,##0.0#;-#,##0.0#;"-"', NQ = '#,##0.0';
    ws.getCell(1, 1).value = 'PO TAKAKI (U/ DCF SBY)'; ws.getCell(1, 1).font = { name: 'Calibri', size: 16, bold: true };
    ws.getCell(2, 1).value = 'Tanggal PO : ' + tglPOText(); ws.getCell(2, 1).font = { name: 'Calibri', size: 10, italic: true };
    const hw = { font: { bold: true }, h: 'center', wrap: true, fill: 'FFFFFFFF' }, hy = { font: { bold: true }, h: 'center', wrap: true, fill: Y }, hb = { font: { bold: true }, h: 'center', wrap: true, fill: BL };
    if (np) merge(4, 6, 4, 5 + 3 * np, 'PO TAKAKI', hw);
    merge(5, 1, 6, 1, 'PLU_DC', hw); merge(5, 2, 6, 2, 'DESCRIPTION', hw); merge(5, 3, 6, 3, 'FRC', hw);
    merge(5, 5, 6, 5, 'QPD (CTN)', hb);
    merge(5, 4, 6, 4, 'EST. STOCK AKHIR DCF ' + dmy(hdrD()), hy);
    pos.forEach((po, k) => { const pc = 6 + 3 * k; merge(5, pc, 5, pc + 2, kirimLabel(po, k), hy); put(6, pc, 'PALLET', hy); put(6, pc + 1, 'CTN', hy); put(6, pc + 2, 'PCS', hy); });
    merge(5, cd1, 5, cd2, 'DSI DCF', hy); put(6, cd1, 'AWAL', hy); put(6, cd2, 'AKHIR', hy);
    ws.getRow(6).height = 42;
    D.rows.forEach((r, i) => {
      const x = R0 + i, f = r.core ? CORE : null, ctns = pos.map((po, k) => L(8 + 3 * k - 1) + x);   // kolom CTN tiap PO
      put(x, 1, r.plu, { h: 'left', nf: '@', fill: f }); put(x, 2, r.desc || r.desk, { h: 'left', fill: f }); put(x, 3, r.frc || '-', { h: 'center' });
      put(x, 4, r.s1, { nf: NI }); put(x, 5, r.qc, { nf: NQ });
      pos.forEach((po, k) => { const pc = 6 + 3 * k;
        put(x, pc, r.pal[k] || 0, { h: 'center', nf: NP }); put(x, pc + 1, r.ctn[k] || 0, { h: 'center', nf: NI });
        put(x, pc + 2, { formula: L(pc + 1) + x + '*' + (r.frc || 0), result: r.pcs[k] }, { h: 'center', nf: NI }); });
      const sum = ctns.length ? '+' + ctns.join('+') : '';
      put(x, cd1, { formula: 'IF(E' + x + '>0,D' + x + '/E' + x + ',0)', result: r.d1 || 0 }, { h: 'center', nf: NI });
      put(x, cd2, { formula: 'IF(E' + x + '>0,(D' + x + sum + ')/E' + x + ',0)', result: r.d2 || 0 }, { h: 'center', nf: NI });
    });
    const rng = c => L(c) + R0 + ':' + L(c) + (RG - 1), tot = pos.map((po, k) => L(7 + 3 * k) + RG);
    merge(RG, 1, RG, 3, 'Grand Total', { font: { bold: true }, h: 'left', fill: Y });
    put(RG, 4, { formula: n ? 'SUM(' + rng(4) + ')' : '0', result: T.s1 }, { nf: NI, font: { bold: true }, fill: Y }); put(RG, 5, { formula: n ? 'SUM(' + rng(5) + ')' : '0', result: T.qc }, { nf: NQ, font: { bold: true } });
    pos.forEach((po, k) => { const pc = 6 + 3 * k;
      put(RG, pc, { formula: n ? 'SUM(' + rng(pc) + ')' : '0', result: T.pal[k] }, { h: 'center', nf: NP, font: { bold: true } });
      put(RG, pc + 1, { formula: n ? 'SUM(' + rng(pc + 1) + ')' : '0', result: T.ctn[k] }, { h: 'center', nf: NI, font: { bold: true } });
      put(RG, pc + 2, { formula: n ? 'SUM(' + rng(pc + 2) + ')' : '0', result: D.pcs[k] }, { h: 'center', nf: NI, font: { bold: true } }); });
    put(RG, cd1, { formula: 'IF(E' + RG + '>0,D' + RG + '/E' + RG + ',0)', result: D.d1 || 0 }, { h: 'center', nf: NI, font: { bold: true } });
    put(RG, cd2, { formula: 'IF(E' + RG + '>0,(D' + RG + (tot.length ? '+' + tot.join('+') : '') + ')/E' + RG + ',0)', result: D.d2 || 0 }, { h: 'center', nf: NI, font: { bold: true } });
    merge(RA, 1, RA, 3, 'AVERAGE STOCK DCF', { nb: true, h: 'center' });
    merge(RA, 4, RA, 5, { formula: n ? 'ROUND(D' + RG + '/' + n + ',0)&" CTN"' : '"0 CTN"', result: n0(D.avg) + ' CTN' }, { nb: true, h: 'center', font: { bold: true } });
    pos.forEach((po, k) => merge(RA, 6 + 3 * k, RA, 8 + 3 * k, po.kendaraan, { nb: true, h: 'center', font: { bold: true } }));
    const wd = { 1: 11, 2: 32, 3: 6, 4: 15, 5: 8 }; for (let c = 1; c <= NC; c++) ws.getColumn(c).width = wd[c] || 9;
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 6, showGridLines: false }];
    try { ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }; } catch (e) { /* opsional */ }
    const buf = await wb.xlsx.writeBuffer();
    saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), kirimFname('xlsx'));
  }
  async function doDownload(f) {
    const b = Q('#ptDl'); if (b) b.disabled = true;
    try { if (P.tab === 'kirim') { if (f === 'jpg') await downloadKirimJpg(); else await downloadKirimXlsx(); } else if (f === 'jpg') await downloadJpg(); else await downloadXlsx(); }
    catch (e) { msg('Gagal download ' + (f === 'jpg' ? 'JPG' : 'Excel') + ': ' + e.message, true); }
    const b2 = Q('#ptDl'); if (b2) b2.disabled = false;
  }

  // ---------------- aksi ----------------
  // lebar kolom teks REQUEST PENGIRIMAN mengikuti isinya
  const fitRq = t => {
    if (!t) return; const cs = getComputedStyle(t), sp = document.createElement('span');
    sp.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:-9999px;font-family:' + cs.fontFamily + ';font-size:' + cs.fontSize + ';font-weight:' + cs.fontWeight;
    sp.textContent = t.value || ' '; document.body.appendChild(sp);
    t.style.width = (Math.ceil(sp.getBoundingClientRect().width) + 16) + 'px'; sp.remove();
  };
  const bindHead = () => { const b = Q('#ptRl'); if (b) b.onclick = () => load(true); fitRq(Q('#ptRq')); };
  async function addPO() {
    if (P.pos.length >= MAXPO) return;
    try {
      const urut = P.pos.reduce((m, p) => Math.max(m, p.urut), 0) + 1, last = P.pos[P.pos.length - 1];
      const r = must(await sbc().from('potakaki_po').insert({ periode: P.periode, urut, kendaraan: last ? last.kendaraan : 'BUILT-UP', ctn_pallet: P.cfg.cp }).select().single());
      P.pos.push(r); paint();
    } catch (e) { msg('Gagal menambah PO: ' + e.message, true); }
  }
  // confirm() bawaan diblokir di iframe Google Sites -> pakai dialog sendiri (pbConfirm di index.html)
  const ask = (text, fn, okText) => { if (window.pbConfirm) window.pbConfirm(text, fn, okText); else if (confirm(text)) fn(); };
  function delPO(id) {
    const i = P.pos.findIndex(p => String(p.id) === String(id)); if (i < 0) return;
    const po = P.pos[i];
    ask('Hapus PO ' + (i + 1) + ' beserta isinya?', async () => {
      try {
        must(await sbc().from('potakaki_po').delete().eq('id', po.id));
        [...P.pal.keys()].forEach(k => { if (k.startsWith(po.id + '|')) P.pal.delete(k); });
        const j = P.pos.findIndex(p => p.id === po.id); if (j >= 0) P.pos.splice(j, 1); paint();
      } catch (e) { msg('Gagal menghapus PO: ' + e.message, true); }
    }, 'Hapus');
  }
  function applyReco() {
    const R = reco(); if (!R.veh.length || P.busy) return;
    const has = P.pos.length && [...P.pal.values()].some(v => v > 0);
    const go = async () => {
      if (P.busy) return;
      P.busy = true; const b = Q('#ptApply'); if (b) b.disabled = true;
      try {
        const s = sbc();
        if (P.pos.length) must(await s.from('potakaki_po').delete().eq('periode', P.periode));
        const ins = must(await s.from('potakaki_po').insert(R.plan.map((m, i) => ({ periode: P.periode, urut: i + 1, kendaraan: m.kendaraan, ctn_pallet: P.cfg.cp }))).select());
        ins.sort((a, b2) => a.urut - b2.urut);
        const items = []; ins.forEach((po, i) => Object.keys(R.plan[i].items).forEach(plu => { if (R.plan[i].items[plu] > 0) items.push({ po_id: po.id, plu_dc: plu, pallet: R.plan[i].items[plu] }); }));
        if (items.length) must(await s.from('potakaki_po_item').insert(items));
        P.pos = ins; P.pal = new Map(); items.forEach(r => P.pal.set(pk(r.po_id, r.plu_dc), r.pallet));
        msg('Rekomendasi diterapkan: ' + ins.length + ' PO — pallet masih bisa diedit');
      } catch (e) { msg('Gagal menerapkan: ' + e.message, true); await load(false); }
      P.busy = false; paint();
    };
    if (P.pos.length) ask('Ganti ' + P.pos.length + ' PO yang ada' + (has ? ' (termasuk isinya)' : '') + ' dengan rekomendasi ' + R.veh.length + ' PO?', go, 'Ganti');
    else go();
  }
  // hapus / tambah item pada tabel (daftar item yang dihapus tersimpan di potakaki_cfg, key item_hidden)
  async function setHidden(h) {
    await saveCfg('item_hidden', [...h]); P.hid = h; P.rows = P.all.filter(r => !h.has(r.plu)); paint();
  }
  async function rmItem(plu) { try { const h = new Set(P.hid); h.add(plu); await setHidden(h); } catch (e) { msg('Gagal menghapus item: ' + e.message, true); } }
  async function addItem(plu) { if (!plu) return; try { const h = new Set(P.hid); h.delete(plu); await setHidden(h); } catch (e) { msg('Gagal menambah item: ' + e.message, true); } }
  async function saveCfg(key, value) {
    const r = await sbc().from('potakaki_cfg').upsert({ key, value }, { onConflict: 'key' });
    if (r.error) throw new Error(r.error.message);
  }
  function bindBody() {
    const el = root(); if (!el || el.dataset.bound) return; el.dataset.bound = '1';
    document.addEventListener('click', () => { const w = Q('#ptDm'); if (w) w.classList.remove('open'); });
    el.addEventListener('focusin', e => { if (e.target.classList && (e.target.classList.contains('pt-p') || e.target.id === 'ptCp')) e.target.select(); });
    el.addEventListener('input', e => { if (e.target.id === 'ptRq') { e.target.size = rqSize(e.target.value); fitRq(e.target); } });
    el.addEventListener('keydown', e => { if (e.target.id === 'ptRq' && e.key === 'Enter') e.target.blur(); });
    el.addEventListener('click', e => {
      const sg = e.target.closest('#ptSeg button'); if (sg) { e.stopPropagation(); P.tab = sg.dataset.t; return paint(); }
      if (e.target.closest('#ptTglNow')) { P.tglPO = ''; return paint(); }
      const rm = e.target.closest('.pt-rm'); if (rm) { e.stopPropagation(); return rmItem(rm.dataset.rm); }
      const x = e.target.closest('.pt-x'); if (x) { e.stopPropagation(); return delPO(x.dataset.del); }
      const dl = e.target.closest('#ptDl'); if (dl) { e.stopPropagation(); const w = dl.closest('.dmw'), o = w.classList.contains('open'); w.classList.toggle('open', !o); return; }
      const da = e.target.closest('#ptDm .dmn a'); if (da) { e.stopPropagation(); const w = da.closest('.dmw'); if (w) w.classList.remove('open'); return doDownload(da.dataset.f); }
      if (e.target.closest('#ptAdd')) return addPO();
      if (e.target.closest('#ptApply')) return applyReco();
    });
    el.addEventListener('change', async e => {
      const t = e.target, c = t.classList; if (!c) return;
      const po = t.dataset.po ? P.pos.find(p => String(p.id) === String(t.dataset.po)) : null;
      try {
        if (c.contains('pt-p')) {                        // pallet (desimal)
          const v = numIn(t.value), plu = t.dataset.p;
          if (!po) return; if (isNaN(v)) { msg('Angka tidak valid', true); t.value = fmtP(palOf(po.id, plu)); return; }
          must(await sbc().from('potakaki_po_item').upsert({ po_id: po.id, plu_dc: plu, pallet: v }, { onConflict: 'po_id,plu_dc' }));
          P.pal.set(pk(po.id, plu), v); t.value = fmtP(v); recalc();
        } else if (c.contains('pt-kd') && po) {          // kendaraan
          must(await sbc().from('potakaki_po').update({ kendaraan: t.value }).eq('id', po.id)); po.kendaraan = t.value; recalc();
        } else if (c.contains('pt-dt') && po) {          // tanggal kirim
          const v = t.value || null; must(await sbc().from('potakaki_po').update({ tgl_kirim: v }).eq('id', po.id)); po.tgl_kirim = v; if (P.tab === 'kirim') paint();
        } else if (t.id === 'ptTgl') {                   // tanggal PO (Kirim PO); kosong = hari ini
          P.tglPO = t.value || ''; paint();
        } else if (t.id === 'ptRq') {                    // teks REQUEST PENGIRIMAN (kosong = otomatis)
          const v = String(t.value).replace(/\s+/g, ' ').trim(), store = v && v !== defLine() ? v : '';
          await saveCfg('request_text|' + P.periode, store); P.reqCustom = store; t.value = reqLine(); t.size = rqSize(t.value); fitRq(t);
        } else if (t.id === 'ptAddItem') {               // tambah item yang pernah dihapus
          await addItem(t.value);
        } else if (t.id === 'ptCp') {                    // ctn per pallet (semua PO)
          const v = numIn(t.value); if (isNaN(v) || v <= 0) { msg('Angka tidak valid', true); t.value = String(P.cfg.cp).replace('.', ','); return; }
          await saveCfg('ctn_pallet', v); P.cfg.cp = v;
          if (P.pos.length) must(await sbc().from('potakaki_po').update({ ctn_pallet: v }).eq('periode', P.periode));
          P.pos.forEach(po => { po.ctn_pallet = v; }); t.value = String(v).replace('.', ','); recalc();
        } else if (t.id === 'ptTg') {                    // target DSI
          const v = numIn(t.value); if (isNaN(v) || v <= 0) { msg('Target DSI tidak valid', true); t.value = String(P.cfg.target).replace('.', ','); return; }
          await saveCfg('target_dsi', v); P.cfg.target = v; const rc = Q('#ptReco'); if (rc) rc.innerHTML = recoHtml();
        } else if (t.id === 'ptMd') {
          P.mode = t.value; const rc = Q('#ptReco'); if (rc) rc.innerHTML = recoHtml();
        } else if (c.contains('pt-cap')) {               // tonase kendaraan
          const v = numIn(String(t.value).replace(/\./g, '')); if (isNaN(v) || v <= 0) { msg('Angka tidak valid', true); t.value = n0(P.cfg.kend[t.dataset.k]); return; }
          const kend = Object.assign({}, P.cfg.kend, { [t.dataset.k]: v }); await saveCfg('kendaraan', kend); P.cfg.kend = kend; t.value = n0(v); recalc();
        }
      } catch (er) { msg('Gagal menyimpan: ' + er.message, true); }
    });
  }
  function open() {
    if (!adm()) return;
    css(); bindBody();
    if (!P.ready || P.err || Date.now() - (P.at || 0) > 60000) load(false);   // data lebih dari 1 menit: muat ulang
    else { try { const C = window.PBSTOKDCF.calcStok(); if (C.to2 && addD(C.to2, 2) !== P.periode) { load(false); return; }   // data Stock DCF berganti periode: muat ulang
      setDates(C);   // jumlah minggu Est. PB tambahan bisa berubah: tanggal judul kolom ikut
      P.all = mapRows(C.rows); P.rows = P.all.filter(r => !P.hid.has(r.plu)); } catch (e) { /* pakai data sebelumnya */ } paint(); }
  }
  window.PBPOTAKAKI = { open, downloadJpg, downloadXlsx, reload: () => load(true), _t: { tgtOf, recommend, pickVehicles, needCtn, unitsCap, toCtn, numIn } };
})();
