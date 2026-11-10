/* PB SAY BREAD - menu "Stock DCF" (administrator).  Semua satuan CTN.
   Sub halaman: Stock (monitoring stok DCF) dan Data ED (unggah sheet "data ED" Excel Takaki).
   Tabel Supabase: stokdcf_item, stokdcf_pb, stokdcf_ed (lihat migrasi-stok-dcf.sql). Hanya admin. */
(function () {
  'use strict';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const MONL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const pd = s => new Date(s + 'T00:00:00Z');
  const iso = d => d.toISOString().slice(0, 10);
  const fd = s => s ? String(pd(s).getUTCDate()).padStart(2, '0') + ' ' + MON[pd(s).getUTCMonth()] + ' ' + pd(s).getUTCFullYear() : '';
  const fdl = s => s ? pd(s).getUTCDate() + ' ' + MONL[pd(s).getUTCMonth()] + ' ' + pd(s).getUTCFullYear() : '';
  const n0 = v => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const Q = (s, r) => (r || document).querySelector(s);
  const sbc = () => window.PBAPI.sb;
  const gTok = () => (typeof TOKEN !== 'undefined' ? TOKEN : null), gD = () => (typeof D !== 'undefined' ? D : null);
  const msg = (m, err) => { if (window.toast) window.toast(m, err); else alert(m); };
  const must = r => { if (r.error) throw new Error(r.error.message); return r.data; };

  const X = { tab: 'stok', ready: false, items: [], ed: [], pb: {}, pbLabel: '10-14', snap: null, file: null };

  // ---------------- data ----------------
  async function loadAll() {
    const s = sbc();
    const [it, ed, pb, st] = await Promise.all([
      s.from('stokdcf_item').select('*').order('urut'),
      s.from('stokdcf_ed').select('*').order('tgl_exp').limit(10000),
      s.from('stokdcf_pb').select('*'),
      s.from('settings').select('key,value').eq('key', 'stokdcf_pb_label')]);
    X.items = must(it); X.ed = must(ed);
    X.pb = {}; must(pb).forEach(r => X.pb[r.plu_dc] = Number(r.qty) || 0);
    const l = must(st)[0]; X.pbLabel = l && l.value != null ? String(l.value) : '10-14';
    X.snap = X.ed.length ? X.ed.reduce((m, b) => b.tgl_data > m ? b.tgl_data : m, '0000-00-00') : null;
    X.ready = true;
  }
  const stokOf = pc => X.ed.reduce((t, b) => String(b.plu_cust).trim() === pc ? t + Number(b.stok || 0) : t, 0);

  // ---------------- tampilan ----------------
  const root = () => Q('#vStokDcf');
  const TH = 'padding:5px 8px;font-size:12px;white-space:nowrap;position:sticky;top:0;z-index:2;color:#111;border:1px solid #333;text-align:center;background:#fff;font-weight:700';
  const TD = 'padding:3px 8px;border:1px solid #333;white-space:nowrap;font-size:13px;text-align:right';
  const TDL = 'padding:3px 8px;border:1px solid #333;white-space:nowrap;font-size:13px;text-align:left';
  const YEL = '#ffffcc', RED = '#ffc7ce', REDT = '#9c0006';

  function shell() {
    const tabs = [['stok', 'Stock'], ['ed', 'Data ED']];
    root().innerHTML = '<div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 style="margin:0;color:var(--br)">Stock DCF</h3><span id="sdSub" class="note" style="padding:0"></span><span style="flex:1"></span>'
      + '<span id="sdSeg" style="display:inline-flex;gap:4px">' + tabs.map(t => '<button class="b ' + (X.tab === t[0] ? 'p' : 's') + '" data-t="' + t[0] + '">' + t[1] + '</button>').join('') + '</span>'
      + '<button class="b s" id="sdRl">Muat ulang</button></div></div><div id="sdBody"></div>';
    Q('#sdSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; X.tab = b.dataset.t; shell(); paint(); };
    Q('#sdRl').onclick = () => start();
  }
  function paint() {
    if (!X.ready) return;
    Q('#sdSub').textContent = X.snap ? 'Data ED per ' + fdl(X.snap) + ' · satuan CTN' : 'Belum ada data ED — unggah di sub halaman Data ED';
    (X.tab === 'ed' ? paintED : paintStok)();
  }

  // ===== Sub halaman: Stock =====
  function paintStok() {
    const rows = X.items.filter(i => i.aktif).map(i => {
      const qty = stokOf(String(i.plu_cust).trim()), pb = X.pb[i.plu_dc] || 0;
      return { i, qty, pb, sisa: Math.max(0, qty - pb) };
    });
    const T = rows.reduce((t, r) => ({ qty: t.qty + r.qty, pb: t.pb + (r.pb > 0 ? r.pb : 0), sisa: t.sisa + r.sisa }), { qty: 0, pb: 0, sisa: 0 });
    let h = '<div class="card" style="margin-top:12px"><div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px"><div><div style="font-weight:800;font-size:16px">MONITORING STOK DCF JATIM</div>'
      + '<div style="font-style:italic;font-weight:700">STOK DCF ' + (X.snap ? E(fdl(X.snap)) : '-') + '</div></div><span style="flex:1"></span>'
      + '<div><label class="k">Periode PB</label><input class="in" id="sdLbl" value="' + E(X.pbLabel) + '" style="width:100px"></div></div>'
      + '<div style="overflow:auto"><table style="border-collapse:collapse"><thead><tr>'
      + '<th style="' + TH + '" rowspan="2">PLU DC</th><th style="' + TH + '" rowspan="2">DESCRIPTION</th><th style="' + TH + '" rowspan="2">QTY STK</th><th style="' + TH + '">PB</th><th style="' + TH + '">SISA</th></tr>'
      + '<tr><th style="' + TH + ';top:30px">' + E(X.pbLabel) + '</th><th style="' + TH + ';top:30px">STOK</th></tr></thead><tbody>'
      + rows.map(r => {
        const bg = r.i.sorot ? 'background:' + YEL : '';
        return '<tr data-p="' + E(r.i.plu_dc) + '"><td style="' + TDL + ';' + bg + '">' + E(r.i.plu_dc) + '</td><td style="' + TDL + ';' + bg + '">' + E(r.i.deskripsi) + '</td>'
          + '<td style="' + TD + '">' + n0(r.qty) + '</td>'
          + '<td style="' + TD + ';padding:0"><input type="number" min="0" data-pb value="' + r.pb + '" style="width:80px;border:0;text-align:right;font:inherit;padding:3px 8px;background:transparent"></td>'
          + '<td style="' + TD + (r.sisa === 0 ? ';background:' + RED + ';color:' + REDT : '') + '">' + n0(r.sisa) + '</td></tr>';
      }).join('')
      + '<tr style="font-weight:800"><td style="' + TDL + '" colspan="2">Grand Total</td><td style="' + TD + '">' + n0(T.qty) + '</td><td style="' + TD + '">' + n0(T.pb) + '</td><td style="' + TD + '">' + n0(T.sisa) + '</td></tr>'
      + '</tbody></table></div>'
      + '<div class="note" style="padding:8px 0 0">QTY STK = jumlah stok per PLU_CUST dari Data ED. PB diisi manual (klik angkanya). SISA STOK = QTY STK − PB (minimal 0, merah bila 0).</div></div>';
    Q('#sdBody').innerHTML = h;
    Q('#sdLbl').onchange = async e => {
      const v = e.target.value.trim() || '-';
      const r = await sbc().from('settings').upsert({ key: 'stokdcf_pb_label', value: v });
      if (r.error) return msg('Gagal menyimpan: ' + r.error.message, true);
      X.pbLabel = v; paintStok(); msg('Periode PB disimpan');
    };
    Q('#sdBody').onchange = async e => {
      const t = e.target, tr = t.closest('tr[data-p]'); if (!t.hasAttribute('data-pb') || !tr) return;
      const v = Number(t.value); if (!(v >= 0)) { msg('Angka tidak valid', true); return paintStok(); }
      const r = await sbc().from('stokdcf_pb').upsert({ plu_dc: tr.dataset.p, qty: v });
      if (r.error) return msg('Gagal menyimpan: ' + r.error.message, true);
      X.pb[tr.dataset.p] = v; paintStok();
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
    const th = t => '<th style="' + TH + '">' + t + '</th>';
    let h = '<div class="card" style="margin-top:12px"><h3 style="margin:0 0 6px;color:var(--br)">Unggah data ED</h3>'
      + '<div class="note" style="padding:0 0 8px">Pilih file <b>Monitoring Stock Takaki DCF SBY (.xlsx)</b>. Yang dibaca hanya sheet <b>data ED</b> (PLU_CUST kolom A, deskripsi B, stok C, inbound J, ED K). Tanggal terisi otomatis dari sel B2 dan bisa Anda ubah. Data ED lama diganti.</div>'
      + '<div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap"><div><label class="k">File Excel</label><br><input type="file" id="sdF" accept=".xlsx"></div>'
      + '<div><label class="k">Tanggal data</label><input type="date" class="in" id="sdTgl" value="' + (X.snap || '') + '" style="width:150px"></div>'
      + '<button class="b p" id="sdSave" disabled>Simpan</button>'
      + (X.snap ? '<button class="b s" id="sdTglOnly" title="Ubah tanggal data yang sudah tersimpan tanpa unggah ulang">Ubah tanggal saja</button>' : '') + '</div>'
      + '<div id="sdFs" class="note" style="padding:8px 0 0"></div>'
      + '<div class="note" style="padding:4px 0 0">Tersimpan: ' + (X.snap ? n0(X.ed.length) + ' baris per <b>' + fdl(X.snap) + '</b>' : 'kosong') + '</div></div>';
    if (X.ed.length) {
      h += '<div class="card" style="margin-top:12px"><div style="overflow:auto;max-height:70vh"><table style="border-collapse:collapse"><thead><tr>'
        + ['PLU_CUST', 'DESCRIPTION', 'STOK', 'INBOUND', 'EXP DATE', 'MASA SIMPAN', 'SISA HARI SIMPAN', 'AKTIF'].map(th).join('') + '</tr></thead><tbody>'
        + X.ed.map(b => {
          const pc = String(b.plu_cust).trim(), ms = dayDiff(b.tgl_inbound, b.tgl_exp), sh = dayDiff(X.snap, b.tgl_exp);
          return '<tr><td style="' + TDL + '">' + E(pc) + '</td><td style="' + TDL + '">' + E(b.deskripsi) + '</td><td style="' + TD + '">' + n0(b.stok) + '</td>'
            + '<td style="' + TD + ';text-align:center">' + E(fd(b.tgl_inbound)) + '</td><td style="' + TD + ';text-align:center">' + E(fd(b.tgl_exp)) + '</td>'
            + '<td style="' + TD + '">' + (ms == null ? '' : ms + ' Hari') + '</td>'
            + '<td style="' + TD + (sh != null && sh <= 30 ? ';background:' + RED + ';color:' + REDT : '') + '">' + (sh == null ? '' : sh + ' Hari') + '</td>'
            + '<td style="' + TD + ';text-align:center">' + (known.has(pc) ? 'AKTIF' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    Q('#sdBody').innerHTML = h;
    Q('#sdF').onchange = e => pickFile(e.target.files[0]);
    Q('#sdSave').onclick = saveED;
    const o = Q('#sdTglOnly'); if (o) o.onclick = async () => {
      const t = Q('#sdTgl').value; if (!t) return msg('Isi tanggal dulu', true);
      const r = await sbc().from('stokdcf_ed').update({ tgl_data: t }).gt('id', 0);
      if (r.error) return msg('Gagal: ' + r.error.message, true); msg('Tanggal data diubah'); start();
    };
  }

  // ---------------- pemasangan menu ----------------
  async function start() {
    const body = Q('#sdBody'); if (body) body.innerHTML = '<div class="card empty" style="margin-top:12px"><span class="spin"></span><div>Memuat Stock DCF…</div></div>';
    try { await loadAll(); shell(); paint(); }
    catch (e) { shell(); Q('#sdBody').innerHTML = '<div class="card empty" style="color:#b00020;margin-top:12px">Gagal memuat: ' + E(e.message) + '<br><span class="note">Pastikan <b>migrasi-stok-dcf.sql</b> sudah dijalankan di Supabase.</span></div>'; }
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
    setInterval(() => { const d = gD(), adm = !!(d && d.user && d.user.admin && gTok()); b.style.display = adm ? '' : 'none'; if (!adm && X.ready) X.ready = false; }, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.PBSTOKDCF = { X, start, parseED };
})();
