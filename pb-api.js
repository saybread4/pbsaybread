/* PB SAY BREAD - jembatan data ke Supabase (pengganti google.script.run).
   Tampilan (index.html) tidak berubah: ia tetap memanggil run('namaFungsi', [...]). */
(function () {
  // Kunci publik (aman dibuka): akses data dijaga RLS di database.
  const SB_URL = 'https://bhdmmyyceggqnxwzbvwm.supabase.co';
  const SB_KEY = 'sb_publishable_Iy1TPv_bSac7P2NLSBCh-w_BhfMpKTv';
  const MAIL = '@pb.saybread.local';
  const SESI = 'SESSION berakhir, silakan login kembali.';
  // sesi login hilang saat tab ditutup, seperti web lama
  const sb = supabase.createClient(SB_URL, SB_KEY, { auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true } });

  const err = e => new Error((e && e.message) || 'Terjadi kesalahan');
  async function rpc(fn, args) { const { data, error } = await sb.rpc(fn, args || {}); if (error) throw err(error); return data; }
  async function setSetting(k, v) {
    const { error } = await sb.from('settings').upsert({ key: k, value: v });
    if (error) throw new Error(/row-level security/i.test(error.message) ? 'Hanya administrator yang boleh mengubah pengaturan ini.' : error.message);
  }
  async function me() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error(SESI);
    const { data, error } = await sb.from('users').select('username,nama,cab,aktif').eq('id', session.user.id).maybeSingle();
    if (error || !data || !data.aktif) throw new Error(SESI);
    const cabs = String(data.cab).split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
    return { name: data.nama || data.username, cabs: cabs, admin: cabs.includes('ALL') };
  }
  async function isOpen() {
    const { data } = await sb.from('settings').select('value').eq('key', 'web_open').maybeSingle();
    return !(data && data.value === false);
  }

  // ---------- Pembuat file Excel di browser (pengganti export lewat Google Sheets) ----------
  const EXCELJS = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = EXCELJS;
      s.onload = () => window.ExcelJS ? ok(window.ExcelJS) : no(new Error('Pustaka Excel gagal dimuat.'));
      s.onerror = () => no(new Error('Pustaka Excel gagal dimuat. Periksa koneksi internet lalu coba lagi.'));
      document.head.appendChild(s);
    });
  }
  const proper = s => String(s == null ? '' : s).toLowerCase().replace(/(^|[\s(\-\/&.])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const isoDate = iso => { const p = String(iso).split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); };
  const slash = iso => iso ? String(iso).split('-').reverse().join('/') : '';
  const kc = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const cmpRow = (a, b) => (a.src === b.src ? 0 : a.src === 'SYS' ? -1 : 1) || kc(a.cab, b.cab) || kc(a.jd || '9999', b.jd || '9999') || kc(a.zn, b.zn) || kc(a.kode, b.kode) || (a.ord - b.ord);
  async function toB64(wb) {
    const buf = new Uint8Array(await wb.xlsx.writeBuffer()); let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const NUMFMT = '_(* #,##0_);_(* -#,##0_);_(* "-"_);_(@_)';
  function styleSheet(ws, ncol, widths, hdrFill) {
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      for (let c = 1; c <= ncol; c++) {
        const cell = row.getCell(c);
        cell.font = Object.assign({ name: 'Calibri', size: 11 }, rn === 1 ? { bold: true } : {});
        cell.alignment = Object.assign({ vertical: 'middle' }, rn === 1 ? { horizontal: 'center', wrapText: true } : {});
      }
    });
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = Math.round(w / 7 * 10) / 10; });
    ws.getRow(1).height = 25.5;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (hdrFill) for (let c = 1; c <= ncol; c++) ws.getRow(1).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hdrFill } };
  }
  // Susun workbook rekap: sheet FIX PB (+ PERLU REVISI bila ada baris tidak sesuai jadwal)
  async function buildRekapBook(d, lenient) {
    const names = d.names || {}, nameOf = k => String(names[k] || k).toUpperCase();
    const rows = d.rows || [];
    const good = rows.filter(r => !r.why).sort(cmpRow), bad = rows.filter(r => r.why && r.fn > 0).sort(cmpRow);
    if (!good.length && !lenient) throw new Error('Tidak ada PB yang sesuai jadwal minggu depan. Periksa jadwal / zona.');
    const EJ = await loadExcelJS(), wb = new EJ.Workbook();
    const ws = wb.addWorksheet('FIX PB');
    ws.addRow(['Kode', 'Toko', 'Plu', 'Desc', 'Cabang', 'Jadwal Kirim', 'Zona', 'FIX PB', 'KETR']);
    good.forEach(x => ws.addRow([x.kode, x.toko, x.plu, proper(x.ds), nameOf(x.cab), x.jd ? isoDate(x.jd) : '', x.zn, x.fn, x.ket]));
    styleSheet(ws, 9, [55, 215, 70, 215, 95, 80, 45, 80, 190]);
    const n = good.length + 1;
    for (let r = 1; r <= n; r++) {
      ws.getCell(r, 1).numFmt = '@'; ws.getCell(r, 3).numFmt = '@';
      ws.getCell(r, 8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      if (r > 1) {
        ws.getCell(r, 6).numFmt = 'm/d/yyyy'; ws.getCell(r, 8).numFmt = NUMFMT;
        ws.getCell(r, 6).alignment = { vertical: 'middle', horizontal: 'center' }; ws.getCell(r, 7).alignment = { vertical: 'middle', horizontal: 'center' };
      }
    }
    for (let c = 1; c <= 9; c++) ws.getCell(1, c).border = { bottom: { style: 'thin' } };
    if (bad.length) {
      const rv = wb.addWorksheet('PERLU REVISI', { properties: { tabColor: { argb: 'FFDC2626' } } });
      rv.addRow(['Kode', 'Toko', 'Plu', 'Desc', 'Cabang', 'Zona', 'Jadwal', 'FIX PB', 'KETR', 'ALASAN (mohon direvisi)']);
      bad.forEach(x => rv.addRow([x.kode, x.toko, x.plu, proper(x.ds), nameOf(x.cab), x.zn, slash(x.jd), x.fn, x.ket, x.why]));
      styleSheet(rv, 10, [55, 215, 70, 215, 95, 45, 80, 70, 190, 330], 'FFFECACA');
      for (let r = 1; r <= bad.length + 1; r++) { rv.getCell(r, 1).numFmt = '@'; rv.getCell(r, 3).numFmt = '@'; if (r > 1) rv.getCell(r, 10).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFB91C1C' } }; }
    }
    return { wb: wb, good: good.length, bad: bad.length };
  }


  // ---------- Download Master: FIX PB + PERLU REVISI + PIVOT + STOCK-DC vs PB + OUTBOUND + PB PER ZONA ----------
  const dmy = iso => { const p = String(iso).split('-'); return p[2] + '.' + p[1]; };
  function numCols(ws, from, to, rows) {
    for (let r = 2; r <= rows; r++) for (let c = from; c <= to; c++) ws.getCell(r, c).numFmt = NUMFMT;
  }
  function boldRow(ws, r, ncol, fill) {
    for (let c = 1; c <= ncol; c++) { const cell = ws.getCell(r, c); cell.font = { name: 'Calibri', size: 11, bold: true }; if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }; }
  }
  async function buildMasterBook(d) {
    const b = await buildRekapBook({ names: d.names, rows: d.rows }, true), wb = b.wb, HF = 'FFE0E7FF', TF = 'FFE4E8FB';
    const pv = d.pivot || {}, pc = pv.cabs || [];
    if ((pv.items || []).length) {                                   // PIVOT: item x cabang
      const ws = wb.addWorksheet('PIVOT PB'), nc = 3 + pc.length;
      ws.addRow(['Plu', 'Desc'].concat(pc.map(c => String(c.nama).toUpperCase()), ['TOTAL']));
      pv.items.forEach(i => ws.addRow([i.plu, proper(i.ds)].concat(i.v, [i.t])));
      ws.addRow(['', 'TOTAL'].concat(pv.tot, [pv.gt]));
      styleSheet(ws, nc, [70, 215].concat(pc.map(() => 90), [90]), HF);
      const n = pv.items.length + 2; numCols(ws, 3, nc, n); boldRow(ws, n, nc, TF);
      for (let r = 1; r <= n; r++) ws.getCell(r, 1).numFmt = '@';
    }
    const sp = d.stock || {}, sc = sp.cabs || [];
    if ((sp.items || []).length) {                                   // STOCK-DC vs PB + jatah per cabang
      const ws = wb.addWorksheet('STOCK-DC vs PB'), nc = 6 + sc.length * 3, hd = ['Plu', 'Desc', 'STOCK-DC', 'TOTAL PB', 'SELISIH', 'STATUS'];
      sc.forEach(c => { const u = String(c.nama).toUpperCase(); hd.push(u + ' PB', u + ' JATAH', u + ' KURANGI'); });
      ws.addRow(hd);
      sp.items.forEach(i => {
        const row = [i.plu, proper(i.ds), i.stock, i.pb, i.sel, i.sel < 0 ? 'KURANG' : 'CUKUP'];
        sc.forEach((c, ci) => { const pb = i.pbc[ci], j = i.jat[ci]; row.push(pb || 0, pb ? j : 0, pb - j > 0 ? pb - j : 0); });
        ws.addRow(row);
      });
      const tot = ['', 'TOTAL', 0, 0, 0, '']; sp.items.forEach(i => { tot[2] += i.stock; tot[3] += i.pb; tot[4] += i.sel; });
      sc.forEach((c, ci) => { let a = 0, j = 0; sp.items.forEach(i => { a += i.pbc[ci]; j += i.jat[ci]; }); tot.push(a, j, a - j); });
      ws.addRow(tot);
      styleSheet(ws, nc, [70, 215, 80, 80, 80, 70].concat(sc.flatMap(() => [75, 75, 80])), HF);
      const n = sp.items.length + 2; numCols(ws, 3, 5, n); numCols(ws, 7, nc, n); boldRow(ws, n, nc, TF);
      for (let r = 1; r <= n; r++) ws.getCell(r, 1).numFmt = '@';
      sp.items.forEach((i, k) => { const cell = ws.getCell(k + 2, 6); cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: i.sel < 0 ? 'FFB91C1C' : 'FF15803D' } }; cell.alignment = { vertical: 'middle', horizontal: 'center' }; });
    }
    const ob = d.outbound || {}, od = ob.dates || [];
    if ((ob.items || []).length) {                                   // OUTBOUND: PB & sisa stok per tanggal kirim
      const ws = wb.addWorksheet('OUTBOUND'), nc = 3 + od.length * 2 + 1, hd = ['Plu', 'Desc', 'STOCK AKHIR'];
      od.forEach(x => hd.push('PB ' + dmy(x), 'STOK ' + dmy(x))); hd.push('TOTAL PB');
      ws.addRow(hd);
      const pbT = od.map(() => 0), stT = od.map(() => 0);
      ob.items.forEach(i => {
        let st = i.stock; const row = [i.plu, proper(i.ds), i.stock];
        od.forEach((x, k) => { st -= i.pb[k]; pbT[k] += i.pb[k]; stT[k] += st; row.push(i.pb[k], st); });
        row.push(i.tot); ws.addRow(row);
      });
      const tot = ['', 'TOTAL', ob.items.reduce((a, i) => a + i.stock, 0)];
      od.forEach((x, k) => tot.push(pbT[k], stT[k])); tot.push(ob.items.reduce((a, i) => a + i.tot, 0));
      ws.addRow(tot);
      styleSheet(ws, nc, [70, 215, 90].concat(od.flatMap(() => [65, 75]), [80]), HF);
      const n = ob.items.length + 2; numCols(ws, 3, nc, n); boldRow(ws, n, nc, TF);
      for (let r = 1; r <= n; r++) ws.getCell(r, 1).numFmt = '@';
    }
    if ((ob.zones || []).length) {                                   // PB PER ZONA
      const ws = wb.addWorksheet('PB PER ZONA');
      ws.addRow(['Cabang', 'Tanggal Kirim', 'Zona', 'Jml Toko per Zona', 'PB (in ctn)', 'Jml Toko yang PB', 'Avg PB/Toko', 'Jarak Group', 'Area Kirim']);
      ob.zones.forEach(z => ws.addRow([z.nama, z.jd ? isoDate(z.jd) : '', z.zn, z.n, z.pb, z.np, Math.round(z.avg), z.jarak, z.area]));
      const gn = ob.zones.reduce((a, z) => a + z.n, 0), gp = ob.zones.reduce((a, z) => a + z.pb, 0), gnp = ob.zones.reduce((a, z) => a + z.np, 0);
      ws.addRow(['TOTAL', '', '', gn, gp, gnp, gnp ? Math.round(gp / gnp) : 0, '', '']);
      styleSheet(ws, 9, [150, 90, 50, 95, 80, 95, 85, 85, 200], HF);
      const n = ob.zones.length + 2; numCols(ws, 4, 7, n); boldRow(ws, n, 9, TF);
      for (let r = 2; r < n; r++) { ws.getCell(r, 2).numFmt = 'dd/mm/yyyy'; ws.getCell(r, 2).alignment = { vertical: 'middle', horizontal: 'center' }; ws.getCell(r, 3).alignment = { vertical: 'middle', horizontal: 'center' }; if (ob.zones[r - 2].pb > 300) ws.getCell(r, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } }; }
    }
    return { wb: wb, bad: b.bad };
  }

  // ---------- Jadwal Kirim: gabungan data langsung (database) + arsip beku (padanan getJadwal lama) ----------
  const normK = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const monIso = iso => {
    const p = String(iso).split('-').map(Number), dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    return dt.toISOString().slice(0, 10);
  };
  const todayJkt = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  function slotOf(cm) {
    const list = Object.keys(cm).map(k => cm[k]).sort((a, b) => a.m - b.m), slots = [], used = {};
    list.forEach(c => { if (c.m > 0 && !slots[c.m - 1]) { slots[c.m - 1] = c; used[c.k] = 1; } });
    list.forEach(c => { if (used[c.k]) return; let i = 0; while (slots[i]) i++; slots[i] = c; });
    const arr = [];
    for (let i = 0; i < slots.length; i++) arr.push(slots[i] ? { k: slots[i].k, z: slots[i].z, n: slots[i].n, np: slots[i].np, pb: slots[i].pb } : null);
    return arr;
  }
  function mergeJadwal(live, arc, today) {
    const curMon = monIso(today);
    const A = { cells: {}, zset: {}, pbs: {} };
    (arc.rows || []).forEach(r => {
      const d = r[0], z = r[1], zk = normK(z);
      const c = ((A.cells[d] = A.cells[d] || {})[zk] = A.cells[d][zk] || { k: zk, z: z, m: Math.round(Number(r[2]) || 0), n: 0, np: 0, pb: 0 });
      A.zset[zk] = 1; c.n += Number(r[4]) || 0; c.np += Number(r[5]) || 0; c.pb += Number(r[6]) || 0;
    });
    (arc.pbs || []).forEach(r => { if (r[0] < curMon) return; const k = r[0] + '|' + normK(r[1]); (A.pbs[k] = A.pbs[k] || {})[String(r[2]).toUpperCase()] = Number(r[3]) || 0; });
    // sel dari data langsung (dijumlahkan semua CAB yang boleh dilihat pengguna)
    const lv = {};
    (live.days || []).forEach(dy => (dy.k || []).forEach((zk, idx) => {
      if (!zk) return;
      const ag = (live.agg || {})[zk] || {}, own = (live.zpbd || {})[zk] === dy.d;
      let n = 0, np = 0, pb = 0;
      Object.keys(ag).forEach(cab => { n += ag[cab].n; if (own) { np += ag[cab].np; pb += ag[cab].pb; } });
      (lv[dy.d] = lv[dy.d] || {})[zk] = { k: zk, z: (live.zlab || {})[zk] || zk, m: idx + 1, n: n, np: np, pb: pb };
    }));
    // minggu depan dst. = data langsung (nilai tidak turun ke 0 bila PB sudah dihapus); minggu berjalan & lewat = arsip beku
    const dates = {}, zset = {};
    Object.keys(A.cells).forEach(d => dates[d] = 1);
    Object.keys(lv).forEach(d => dates[d] = 1);
    const zch = live.zch || {};
    const days = Object.keys(dates).sort().map(d => {
      const arcD = A.cells[d] || {}, l = lv[d] || {}, future = monIso(d) > curMon, out = {};
      const keys = (future && lv[d]) ? Object.keys(l) : Object.keys(Object.assign({}, arcD, l));
      keys.forEach(zk => {
        const ch = zch[zk + '|' + monIso(d)];
        if (ch && ch !== d) return;   // zona sudah punya tanggal lain di minggu ini
        const a = arcD[zk], x = l[zk];
        if (future && x) out[zk] = { k: zk, z: x.z, m: x.m, n: x.n > 0 ? x.n : (a ? a.n : 0), np: x.np > 0 ? x.np : (a ? a.np : 0), pb: x.pb > 0 ? x.pb : (a ? a.pb : 0) };
        else out[zk] = a || x;
        zset[zk] = 1;
      });
      return { d: d, c: slotOf(out) };
    });
    const un = [];
    Object.keys(live.ztot || {}).forEach(zk => {
      const t = live.ztot[zk];
      if (!zset[zk] && !A.zset[zk] && (t[1] > 0 || t[2] > 0)) un.push(t);
    });
    un.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'id', { numeric: true }));
    return { today: today, updated: live.updated, sel: live.sel, days: days, pbs: A.pbs, zst: live.zst, zpbd: live.zpbd, unsched: un };
  }

  const belum = nama => () => Promise.reject(new Error('Fitur "' + nama + '" sedang dipindahkan ke Supabase dan belum aktif.'));

  const API = {
    async login(u, p) {
      u = String(u || '').trim().toLowerCase();
      if (!u) throw new Error('Username atau password salah.');
      const { error } = await sb.auth.signInWithPassword({ email: u + MAIL, password: String(p || '') });
      if (error) throw new Error('Username atau password salah.');
      const user = await me();
      return { token: 'sb', user: user, open: await isOpen() };
    },
    async logout() { await sb.auth.signOut(); return true; },
    async getStatus() { return { open: await isOpen() }; },
    async getData() { return rpc('get_data'); },
    async savePB(token, ed) {
      const p = (ed || []).map(e => ({ id: e.id || '', kode: e.kode, ds: e.ds, v: e.v, auto: !!e.auto }));
      await rpc('simpan_pb', { p: p });
      return true;
    },
    async setWebOpen(token, open) { await setSetting('web_open', !!open); return { open: !!open }; },
    async setDataUpd(token, iso) {
      if (!/^\d{4}-\d\d-\d\d$/.test(String(iso))) throw new Error('Tanggal tidak valid.');
      await setSetting('data_upd', iso); return true;
    },
    async setWeeks(token, list, auto) {
      await setSetting('week_mode', auto ? 'AUTO' : 'MANUAL');
      if (!auto) await setSetting('week_sel', list || []);
      return true;
    },
    async gantiData(token, tabel, rows, mode, tgl) {
      return rpc('ganti_data', { p_tabel: tabel, p: rows, p_mode: mode, p_tgl: tgl || null });
    },
    async uploadCsvPB(token, rows) { return rpc('upload_csv_pb', { p: rows }); },
    async getManual() { return rpc('get_manual'); },
    async addManual(token, o) { await rpc('add_manual', { o: o }); return true; },
    async delManual(token, id) { await rpc('del_manual', { p_id: String(id) }); return true; },
    async updateManualGroup(token, o) { await rpc('update_manual_group', { o: o }); return true; },
    async getItemAdmin() { return rpc('get_item_admin'); },
    async setManItems(token, list, news) { await rpc('set_man_items', { p_list: list || [], p_news: news || [] }); return true; },
    async getRekapCab() { return rpc('get_rekap_cab'); },
    async getBadPB() { return rpc('get_bad_pb'); },
    async delCsvPB(token, cab) { await rpc('del_csv_pb', { p_cab: String(cab || '') }); return true; },
    async exportRekapCab(token, force) {
      const d = await rpc('export_rekap', { p_force: !!force });
      const b = await buildRekapBook(d);
      return { name: 'Alokasi Dough Per Toko ' + d.title + '.xlsx', b64: await toB64(b.wb), rows: b.good, bad: b.bad, partial: d.pend || [] };
    },
    async getJadwal(token, force) {
      if (force) { try { await rpc('snap_jadwal', { p_force: true }); } catch (e) { /* hanya admin yang mengarsipkan */ } }
      const r = await Promise.all([rpc('jadwal_live'), rpc('arsip_read')]);
      return mergeJadwal(r[0], r[1], todayJkt());
    },
    async getPivotCab(token, force) { return rpc('get_pivot_cab', { p_force: !!force }); },
    async getStockPlan(token, force) { return rpc('get_stock_plan', { p_force: !!force }); },
    async getOutbound(token, force, w) { return rpc('get_outbound', { p_force: !!force, p_w: w === 'cur' ? 'cur' : 'next' }); },
    async exportMaster() {
      const d = await rpc('export_master'), m = await buildMasterBook(d);
      return { name: 'Master PB ' + d.title + '.xlsx', b64: await toB64(m.wb), bad: m.bad };
    },
    async getInfo() { return rpc('get_info'); },
    async getJadwalSheet() { return rpc('get_jadwal_sheet'); },
    async saveJadwalDates(token, edits) { await rpc('save_jadwal_dates', { p_edits: edits || [] }); return true; },
    async snapNow() { try { await rpc('snap_jadwal', { p_force: false }); } catch (e) { /* abaikan */ } return true; }   // tidak diperlukan lagi: data dihitung langsung di database
  };

  window.PBAPI = {
    sb: sb,
    call(fn, args, ok, fail) {
      (API[fn] || belum(fn))(...args).then(r => ok(r), e => fail(e));
    }
  };
})();
