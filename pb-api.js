/* PB SAY BREAD - jembatan data ke Supabase.
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
  async function buildRekapBook(d, lenient, wbIn) {
    const names = d.names || {}, nameOf = k => String(names[k] || k).toUpperCase();
    const rows = d.rows || [];
    const good = rows.filter(r => !r.why).sort(cmpRow), bad = rows.filter(r => r.why && r.fn > 0).sort(cmpRow);
    if (!good.length && !lenient) throw new Error('Tidak ada PB yang sesuai jadwal minggu depan. Periksa jadwal / zona.');
    const EJ = await loadExcelJS(), wb = wbIn || new EJ.Workbook();
    const ws = wb.addWorksheet('FIX PB');
    ws.addRow(['Kode', 'Toko', 'Plu', 'Desc', 'Cabang', 'Jadwal Kirim', 'Zona', 'FIX PB', 'KETR']);
    good.forEach(x => ws.addRow([x.kode, x.toko, x.plu, proper(x.ds), nameOf(x.cab), x.jd ? isoDate(x.jd) : '', x.zn, x.fn, x.ket]));
    styleSheet(ws, 9, [55, 190, 62, 190, 85, 71, 41, 71, 167]);   // lebar mengikuti Master contoh
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
      styleSheet(rv, 10, [55, 190, 62, 190, 85, 41, 71, 62, 167, 290], 'FFFECACA');
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
  // ----- pembantu gaya untuk 6 sheet Master (JADWAL, SIMULASI OUTBOUND, PB PER CABANG, STOCK-DC VS PB, FIX PB, PERLU REVISI) -----
  const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const BLN3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const HARI = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
  const p2 = n => String(n).padStart(2, '0');
  const isoParts = iso => String(iso).split('-').map(Number);
  const addDaysIso = (iso, n) => { const t = isoParts(iso), dt = new Date(Date.UTC(t[0], t[1] - 1, t[2] + n)); return dt.toISOString().slice(0, 10); };
  const dowIso = iso => { const t = isoParts(iso); return new Date(Date.UTC(t[0], t[1] - 1, t[2])).getUTCDay(); };
  const longId = iso => { const t = isoParts(iso); return p2(t[2]) + ' ' + BLN[t[1] - 1] + ' ' + t[0]; };
  const shortId = iso => { const t = isoParts(iso); return p2(t[2]) + ' ' + BLN3[t[1] - 1] + ' ' + t[0]; };
  const dotYY = iso => { const t = isoParts(iso); return p2(t[2]) + '.' + p2(t[1]) + '.' + String(t[0]).slice(2); };
  const fid = n => Math.round(Number(n) || 0).toLocaleString('id-ID');
  const nowJkt = () => { const f = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }); const m = f.match(/(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/); return m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5]; };
  const solid = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb } });
  const bside = (c, st) => ({ style: st || 'thin', color: { argb: c } });
  const boxB = c => ({ top: bside(c), left: bside(c), bottom: bside(c), right: bside(c) });
  // tulis satu sel lengkap dengan gaya
  function put(ws, r, c, v, o) {
    o = o || {}; const cell = ws.getCell(r, c);
    if (v !== undefined && v !== null) cell.value = v;
    cell.font = { name: 'Calibri', size: o.sz || 11, bold: !!o.b, color: { argb: o.fc || 'FF000000' } };
    if (o.bg) cell.fill = solid(o.bg);
    cell.alignment = { horizontal: o.h || 'left', vertical: 'middle', wrapText: !!o.wrap };
    if (o.bd) cell.border = o.bdx || boxB(o.bd);
    if (o.nf) cell.numFmt = o.nf;
    return cell;
  }
  // gabung sel + beri gaya ke seluruh sel dalam rentang (agar garis & warna rata)
  function putM(ws, r1, c1, r2, c2, v, o) {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) put(ws, r, c, (r === r1 && c === c1) ? v : null, o);
    if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
  }
  const NF0 = '#,##0', NFDASH = '#,##0;-#,##0;"-"', NFPAR = '#,##0;(#,##0)', NFSEL = '+#,##0;-#,##0;0';

  // ---- sheet 1: JADWAL (minggu ini + minggu depan) ----
  function sheetJadwal(wb, jw, who, today) {
    const ws = wb.addWorksheet('JADWAL'); ws.views = [{ showGridLines: false }];
    ws.getColumn(1).width = 22; for (let c = 2; c <= 8; c++) ws.getColumn(c).width = 14.5;
    const BD = 'FFB8BFD6';
    putM(ws, 1, 1, 1, 8, 'JADWAL KIRIM SAY BREAD', { sz: 15, b: true, fc: 'FF312E81' });
    putM(ws, 2, 1, 2, 8, who + ' \u00b7 dibuat ' + nowJkt(), { fc: 'FF555555' });
    let r = 4;
    const curMon = monIso(today), weeks = [{ mon: curMon, lb: 'MINGGU INI (BERJALAN)' }, { mon: addDaysIso(curMon, 7), lb: 'MINGGU DEPAN' }];
    weeks.forEach(w => {
      const dd = (jw.days || []).filter(x => monIso(x.d) === w.mon);
      if (!dd.length) return;
      const dates = []; for (let i = 0; i < 7; i++) dates.push(addDaysIso(w.mon, i));
      const by = {}; dd.forEach(x => by[x.d] = x.c || []);
      let nz = 0, nt = 0, np = 0, nm = 0;
      dd.forEach(x => { nm = Math.max(nm, (x.c || []).length); (x.c || []).forEach(c => { if (c) { nz++; nt += Number(c.n) || 0; np += Number(c.pb) || 0; } }); });
      putM(ws, r, 1, r, 8, w.lb + ' \u00b7 ' + longId(w.mon) + ' \u2013 ' + longId(dates[6]) + ' \u00b7 ' + nz + ' zona \u00b7 ' + fid(nt) + ' toko \u00b7 ' + fid(np) + ' PB final', { sz: 12, b: true, fc: 'FFFFFFFF', bg: 'FF3730A3' });
      ws.getRow(r).height = 18; r++;
      put(ws, r, 1, 'HARI', { b: true, fc: 'FFFFFFFF', bg: 'FF1E1B4B', h: 'center', bd: BD });
      dates.forEach((d, i) => put(ws, r, i + 2, HARI[dowIso(d)] + (d === today ? ' (HARI INI)' : ''), { b: true, fc: 'FFFFFFFF', bg: 'FF312E81', h: 'center', bd: BD }));
      r++;
      put(ws, r, 1, 'TANGGAL', { b: true, fc: 'FFFFFFFF', bg: 'FF1E1B4B', h: 'center', bd: BD });
      dates.forEach((d, i) => put(ws, r, i + 2, shortId(d), { fc: 'FFFFFFFF', bg: 'FF4338CA', h: 'center', bd: BD, nf: '@' }));
      r++;
      const tt = dates.map(() => 0), tp = dates.map(() => 0);
      for (let m = 0; m < nm; m++) {
        put(ws, r, 1, 'ZONA KIRIM MOBIL ' + (m + 1), { b: true, bg: 'FFDFF5E8', bd: BD });
        put(ws, r + 1, 1, 'TOTAL TOKO', { fc: 'FF666666', bg: 'FFF4FBF7', bd: BD });
        put(ws, r + 2, 1, 'TOTAL PB FINAL', { fc: 'FF666666', bg: 'FFF4FBF7', bd: BD });
        dates.forEach((d, i) => {
          const c = (by[d] || [])[m], col = i + 2;
          put(ws, r, col, c ? String(c.z) : null, { sz: 12, b: true, bg: 'FFDFF5E8', h: 'center', bd: BD, nf: '@' });
          put(ws, r + 1, col, c ? Number(c.n) || 0 : null, { b: true, bg: 'FFFFFFFF', h: 'center', bd: BD });
          put(ws, r + 2, col, c ? Number(c.pb) || 0 : null, { b: true, fc: 'FF1F8F52', bg: 'FFF4FBF7', h: 'center', bd: BD });
          if (c) { tt[i] += Number(c.n) || 0; tp[i] += Number(c.pb) || 0; }
        });
        ws.getRow(r).height = 16.5; r += 3;
      }
      put(ws, r, 1, 'TOTAL TOKO / HARI', { b: true, bg: 'FFE3E6F8', bd: BD });
      put(ws, r + 1, 1, 'TOTAL PB FINAL / HARI', { b: true, bg: 'FFE3E6F8', bd: BD });
      dates.forEach((d, i) => {
        const has = (by[d] || []).some(x => x);
        put(ws, r, i + 2, has ? tt[i] : null, { b: true, bg: 'FFEEF0FB', h: 'center', bd: BD });
        put(ws, r + 1, i + 2, has ? tp[i] : null, { b: true, fc: 'FF1F8F52', bg: 'FFEEF0FB', h: 'center', bd: BD });
      });
      r += 3;
    });
    return ws;
  }

  // ---- sheet 2: SIMULASI OUTBOUND (tabel item x tanggal + PB PER ZONA) ----
  function sheetSimulasi(wb, ob, title) {
    const ws = wb.addWorksheet('SIMULASI OUTBOUND'); ws.views = [{ showGridLines: false }];
    const od = ob.dates || [], nd = od.length, last = 3 + nd * 2 + 1, BD = 'FFC7CBE4';
    [13.2, 27, 12, 10.1, 8.9, 10.1, 9.1, 11.4, 28.9, 9.1].forEach((w, i) => ws.getColumn(i + 1).width = w);
    for (let c = 11; c <= last; c++) ws.getColumn(c).width = 9.1;
    put(ws, 1, 1, 'SIMULASI OUTBOUND', { sz: 17, b: true, fc: 'FF3730A3' });
    put(ws, 2, 1, 'PERIODE : ' + (title || ob.title || ''), { sz: 12, fc: 'FF475569' });
    const H = { b: true, fc: 'FFFFFFFF', bg: 'FF3730A3', h: 'center', bd: BD, wrap: true }, HY = { b: true, fc: 'FF3B2F00', bg: 'FFFDE68A', h: 'center', bd: BD, wrap: true };
    putM(ws, 4, 1, 5, 1, 'PLU', H); putM(ws, 4, 2, 5, 2, 'DESKRIPSI', H);
    putM(ws, 4, 3, 5, 3, 'STOCK AKHIR\n' + dotYY(ob.stockDate), HY);
    od.forEach((d, k) => {
      const c = 4 + k * 2;
      putM(ws, 4, c, 4, c + 1, isoDate(d), Object.assign({ nf: 'dd.mm.yyyy' }, H));
      put(ws, 5, c, 'PB', H); put(ws, 5, c + 1, 'STOK', HY);
    });
    putM(ws, 4, last, 5, last, 'TOTAL PB', Object.assign({}, H, { bg: 'FF6D28D9' }));
    ws.getRow(4).height = 16.5; ws.getRow(5).height = 15;
    const stk = od.map(() => 0), pbT = od.map(() => 0);
    ob.items.forEach((it, ri) => {
      const r = 6 + ri, zb = ri % 2 ? 'FFF7F8FD' : 'FFFFFFFF'; let st = it.stock;
      put(ws, r, 1, String(it.plu || ''), { fc: 'FF64748B', bg: zb, h: 'center', bd: BD, nf: '@' });
      put(ws, r, 2, it.ds, { bg: zb, bd: BD });
      put(ws, r, 3, it.stock, { bg: 'FFFFF7CC', h: 'right', bd: BD, nf: NF0 });
      od.forEach((d, k) => {
        st -= it.pb[k]; stk[k] += st; pbT[k] += it.pb[k]; const c = 4 + k * 2;
        put(ws, r, c, it.pb[k] ? it.pb[k] : '-', { bg: zb, h: 'right', bd: BD, nf: NF0 });
        put(ws, r, c + 1, st, { bg: 'FFFFF7CC', h: 'right', bd: BD, nf: NFPAR, fc: st < 0 ? 'FFC00000' : 'FF000000' });
      });
      put(ws, r, last, it.tot, { b: true, bg: 'FFEDE9FE', h: 'right', bd: BD, nf: NF0 });
    });
    let r = 6 + ob.items.length; const TOT = { b: true, bg: 'FFE0E7FF', bd: BD, h: 'right', nf: NF0 };
    putM(ws, r, 1, r, 2, 'TOTAL', Object.assign({}, TOT, { h: 'center', nf: null }));
    put(ws, r, 3, ob.items.reduce((a, i) => a + i.stock, 0), TOT);
    od.forEach((d, k) => { const c = 4 + k * 2; put(ws, r, c, pbT[k], TOT); put(ws, r, c + 1, stk[k], Object.assign({}, TOT, { nf: NFPAR, fc: stk[k] < 0 ? 'FFC00000' : 'FF000000' })); });
    put(ws, r, last, ob.items.reduce((a, i) => a + i.tot, 0), TOT);
    // PB PER ZONA
    r += 2; put(ws, r, 1, 'PB PER ZONA', { sz: 13, b: true, fc: 'FF3730A3' }); r++;
    const zh = ['CABANG', 'TANGGAL KIRIM', 'ZONA', 'JML TOKO\nPER ZONA', 'PB\n(IN CTN)', 'JML TOKO\nYANG PB', 'AVG\nPB/TOKO', 'JARAK\nGROUP', 'AREA KIRIM'];
    zh.forEach((t, i) => put(ws, r, i + 1, t, Object.assign({}, H, i >= 7 ? { bg: 'FF0F766E' } : {})));
    ws.getRow(r).height = 24; r++;
    let prev = '', gn = 0, gp = 0, gnp = 0;
    (ob.zones || []).forEach((z, ri) => {
      gn += z.n; gp += z.pb; gnp += z.np;
      const first = z.jd !== prev; prev = z.jd; const zb = ri % 2 ? 'FFF7F8FD' : 'FFFFFFFF';
      const bdx = boxB(BD); if (first && ri > 0) bdx.top = bside('FF3730A3', 'medium');
      const o = (e) => Object.assign({ bg: zb, bd: BD, bdx: bdx }, e);
      put(ws, r, 1, z.nama, o());
      put(ws, r, 2, z.jd ? isoDate(z.jd) : '', o({ b: true, nf: 'dddd, dd mmmm yyyy' }));
      put(ws, r, 3, z.zn, o({ b: true, h: 'center' }));
      put(ws, r, 4, z.n, o({ h: 'right', nf: NF0 }));
      put(ws, r, 5, z.pb, z.pb > 300 ? o({ b: true, bg: 'FFFECACA', fc: 'FF991B1B', h: 'right', nf: NF0 }) : o({ b: true, h: 'right', nf: NF0 }));
      put(ws, r, 6, z.np, o({ h: 'right', nf: NF0 }));
      put(ws, r, 7, Math.round(z.avg), o({ h: 'right', nf: NF0 }));
      const bj = Object.assign({}, bdx, { left: bside('FF0F766E', 'medium') });
      put(ws, r, 8, z.jarak || '', { bg: 'FFCCFBF1', fc: 'FF134E4A', h: 'center', bd: BD, bdx: bj });
      put(ws, r, 9, z.area || '', { bg: 'FFCCFBF1', fc: 'FF134E4A', bd: BD, bdx: bdx });
      r++;
    });
    putM(ws, r, 1, r, 3, 'TOTAL', Object.assign({}, TOT, { h: 'center', nf: null }));
    put(ws, r, 4, gn, TOT); put(ws, r, 5, gp, TOT); put(ws, r, 6, gnp, TOT); put(ws, r, 7, gnp ? Math.round(gp / gnp) : 0, TOT);
    return ws;
  }

  // ---- sheet 3: PB PER CABANG (item x cabang) ----
  function sheetPivot(wb, pv, title) {
    const ws = wb.addWorksheet('PB PER CABANG'); ws.views = [{ showGridLines: false }];
    const pc = pv.cabs || [], nc = 3 + pc.length, BD = 'FFC7CBE4';
    ws.getColumn(1).width = 10.8; ws.getColumn(2).width = 28.9; for (let c = 3; c <= nc; c++) ws.getColumn(c).width = 12;
    put(ws, 1, 1, 'PB PER CABANG', { sz: 17, b: true, fc: 'FF3730A3' });
    put(ws, 2, 1, 'Minggu depan \u00b7 kirim ' + (title || ''), { sz: 12, fc: 'FF475569' });
    const H = { b: true, fc: 'FFFFFFFF', bg: 'FF3730A3', h: 'center', bd: BD };
    ['PLU', 'DESKRIPSI'].concat(pc.map(c => String(c.nama).toUpperCase()), ['TOTAL']).forEach((t, i) => put(ws, 4, i + 1, t, H));
    pv.items.forEach((it, ri) => {
      const r = 5 + ri;
      put(ws, r, 1, String(it.plu || ''), { fc: 'FF64748B', bg: 'FFFFFFFF', h: 'center', bd: BD, nf: '@' });
      put(ws, r, 2, it.ds, { bg: 'FFFFFFFF', bd: BD });
      it.v.forEach((v, k) => put(ws, r, 3 + k, v, { bg: 'FFFFFFFF', h: 'right', bd: BD, nf: NF0 }));
      put(ws, r, nc, it.t, { b: true, bg: 'FFEDE9FE', h: 'right', bd: BD, nf: NF0 });
    });
    const r = 5 + pv.items.length, T = { b: true, bg: 'FFE0E7FF', bd: BD, h: 'right', nf: NF0 };
    putM(ws, r, 1, r, 2, 'TOTAL', Object.assign({}, T, { h: 'center', nf: null }));
    pv.tot.forEach((v, k) => put(ws, r, 3 + k, v, T)); put(ws, r, nc, pv.gt, T);
    return ws;
  }

  // ---- sheet 4: STOCK-DC VS PB (urut SELISIH paling kecil / paling kurang di atas) ----
  function sheetStock(wb, sp, title, stockDate) {
    const ws = wb.addWorksheet('STOCK-DC VS PB'); ws.views = [{ showGridLines: false }];
    const sc = sp.cabs || [], nc = 5 + sc.length * 3, BD = 'FFCDD3E6';
    ws.getColumn(1).width = 30; [10.8, 10.8, 10.8, 10.1].forEach((w, i) => ws.getColumn(i + 2).width = w);
    for (let c = 6; c <= nc; c++) ws.getColumn(c).width = 9.5;
    put(ws, 1, 1, 'STOCK-DC vs PB', { sz: 17, b: true, fc: 'FF3730A3' });
    put(ws, 2, 1, 'PERIODE : ' + (title || '') + (stockDate ? ' \u00b7 STOCK AKHIR ' + dotYY(stockDate) : ''), { sz: 12, fc: 'FF475569' });
    const H = { b: true, fc: 'FFFFFFFF', bg: 'FF3730A3', h: 'center', bd: BD };
    ['DESKRIPSI', 'STOCK-DC', 'TOTAL PB', 'SELISIH', 'STATUS'].forEach((t, i) => putM(ws, 4, i + 1, 5, i + 1, t, H));
    sc.forEach((c, ci) => {
      const b = 6 + ci * 3;
      putM(ws, 4, b, 4, b + 2, String(c.nama).toUpperCase(), Object.assign({}, H, { bg: 'FF4F46E5' }));
      put(ws, 5, b, 'PB', H); put(ws, 5, b + 1, 'JATAH', H); put(ws, 5, b + 2, 'KURANGI', Object.assign({}, H, { bg: 'FFB91C1C' }));
    });
    const items = sp.items.slice().sort((a, b) => (a.sel - b.sel) || (b.pb - a.pb) || String(a.ds).localeCompare(String(b.ds)));
    items.forEach((i, ri) => {
      const r = 6 + ri, bad = i.sel < 0;
      put(ws, r, 1, i.ds, { bg: 'FFFFFFFF', bd: BD });
      put(ws, r, 2, i.stock, { bg: 'FFFFFFFF', h: 'right', bd: BD, nf: NFDASH });
      put(ws, r, 3, i.pb, { bg: 'FFFFFFFF', h: 'right', bd: BD, nf: NFDASH });
      put(ws, r, 4, i.sel, { b: true, fc: bad ? 'FFB91C1C' : 'FF15803D', bg: 'FFFFFFFF', h: 'right', bd: BD, nf: NFSEL });
      put(ws, r, 5, bad ? 'KURANG' : 'CUKUP', { b: true, fc: bad ? 'FFB91C1C' : 'FF15803D', bg: bad ? 'FFFEE2E2' : 'FFDCFCE7', h: 'center', bd: BD });
      sc.forEach((c, ci) => {
        const b = 6 + ci * 3, pb = i.pbc[ci], j = i.jat[ci];
        put(ws, r, b, pb ? pb : '-', { bg: 'FFFFFFFF', h: 'right', bd: BD, nf: NFDASH });
        put(ws, r, b + 1, pb ? j : '-', { bg: 'FFFFFFFF', h: 'right', bd: BD, nf: NFDASH });
        put(ws, r, b + 2, pb > j ? j - pb : null, { b: true, fc: 'FFB91C1C', bg: pb > j ? 'FFFEE2E2' : 'FFFFFFFF', h: 'right', bd: BD, nf: NFDASH });
      });
    });
    const r = 6 + items.length, T = { b: true, bg: 'FFE4E8FB', bd: BD, h: 'right' };
    const ts = items.reduce((a, i) => a + i.stock, 0), tp = items.reduce((a, i) => a + i.pb, 0);
    put(ws, r, 1, 'TOTAL', Object.assign({}, T, { h: 'center' }));
    put(ws, r, 2, ts, Object.assign({ nf: NFDASH }, T)); put(ws, r, 3, tp, Object.assign({ nf: NFDASH }, T)); put(ws, r, 4, ts - tp, Object.assign({ nf: NFSEL }, T)); put(ws, r, 5, null, T);
    sc.forEach((c, ci) => {
      const b = 6 + ci * 3; let a = 0, j = 0; items.forEach(i => { a += i.pbc[ci]; j += i.jat[ci]; });
      put(ws, r, b, a, Object.assign({ nf: NFDASH }, T)); put(ws, r, b + 1, j, Object.assign({ nf: NFDASH }, T)); put(ws, r, b + 2, j - a, Object.assign({ nf: NFDASH }, T));
    });
    return ws;
  }

  async function buildMasterBook(d, jw, who, today) {
    const EJ = await loadExcelJS(), wb = new EJ.Workbook(), ob = d.outbound || {};
    if (jw && (jw.days || []).length) sheetJadwal(wb, jw, who, today);
    if ((ob.items || []).length) sheetSimulasi(wb, ob, d.title);
    const pv = d.pivot || {};
    if ((pv.items || []).length) sheetPivot(wb, pv, d.title);
    const sp = d.stock || {};
    if ((sp.items || []).length) sheetStock(wb, sp, d.title, ob.stockDate);
    const b = await buildRekapBook({ names: d.names, rows: d.rows }, true, wb);   // FIX PB + PERLU REVISI
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
      for (let i = 0; i < p.length; i += 150) await rpc('simpan_pb', { p: p.slice(i, i + 150) });   // per batch agar tidak kena batas waktu query
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
      const d = await rpc('export_master'), today = todayJkt();
      let jw = null, who = 'Administrator \u00b7 SEMUA CAB';
      try { const r = await Promise.all([rpc('jadwal_live'), rpc('arsip_read')]); jw = mergeJadwal(r[0], r[1], today); } catch (e) { jw = null; }   // sheet JADWAL dilewati bila gagal dimuat
      try { const u = await me(); who = u.name + ' \u00b7 ' + (u.admin ? 'SEMUA CAB' : u.cabs.join(', ')); } catch (e) { /* pakai teks bawaan */ }
      const m = await buildMasterBook(d, jw, who, today);
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
