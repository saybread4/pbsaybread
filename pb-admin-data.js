/* PB SAY BREAD - menu "Kelola Data" (administrator): upload (tambah/perbarui atau ganti), lihat, edit, hapus. */
(function () {
  const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const MI = { JAN:1, FEB:2, MAR:3, APR:4, MAY:5, MEI:5, JUN:6, JUL:7, AUG:8, AGU:8, AGT:8, SEP:9, OCT:10, OKT:10, NOV:11, DEC:12, DES:12 };
  const nk = h => String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');

  // Kode toko yang oleh Excel diubah jadi tanggal (7-Feb, Feb-7, 2026-02-07) dikembalikan ke bentuk FEB7.
  function kodeToko(v) {
    const s = String(v == null ? '' : v).trim().toUpperCase(); let m;
    if (!s) return { v: '' };
    if ((m = s.match(/^(\d{1,2})[-\/ ]([A-Z]{3})$/)) && MI[m[2]]) return { v: MON[MI[m[2]] - 1] + Number(m[1]), fix: 1 };
    if ((m = s.match(/^([A-Z]{3})[-\/ ](\d{1,2})$/)) && MI[m[1]]) return { v: MON[MI[m[1]] - 1] + Number(m[2]), fix: 1 };
    if ((m = s.match(/^(\d{4})-(\d\d)-(\d\d)(?:[ T].*)?$/))) return { v: MON[Number(m[2]) - 1] + Number(m[3]), fix: 1 };
    return { v: s };
  }
  let NF = 'auto';   // format angka: auto | id (1.234,56) | en (1,234.56)
  function angka(v) {
    let s = String(v == null ? '' : v).trim().replace(/\s/g, '');
    if (s === '') return 0;
    if (NF === 'id') s = s.replace(/\./g, '').replace(',', '.');
    else if (NF === 'en') s = s.replace(/,/g, '');
    else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
    const n = Number(s); return isNaN(n) ? NaN : n;
  }
  function tanggal(v) {
    const s = String(v == null ? '' : v).trim().toUpperCase(); let m;
    const pad = n => String(n).padStart(2, '0');
    if ((m = s.match(/^(\d{4})-(\d\d)-(\d\d)/))) return m[1] + '-' + m[2] + '-' + m[3];
    if ((m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/))) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(m[2]) + '-' + pad(m[1]);
    if ((m = s.match(/^(\d{1,2})[- ]([A-Z]{3})[- ](\d{2,4})$/)) && MI[m[2]]) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(MI[m[2]]) + '-' + pad(m[1]);
    return null;
  }
  function plu(v) {
    const s = String(v == null ? '' : v).trim();
    if (/^\d+\.0+$/.test(s)) return s.replace(/\.0+$/, '');
    return s;
  }

  // k: nama kolom di database, a: nama judul yang dikenali, t: jenis, r: wajib, u: harus unik (baris pertama dipakai)
  const T = {
    stock:         { n: 'STOCK',         tgl: true,  c: [{k:'kode',a:'kode',t:'kode',r:1},{k:'toko',a:'toko'},{k:'plu',a:'plu',t:'plu'},{k:'deskripsi',a:'deskripsi,description,item',r:1},{k:'jenis',a:'jenis'},{k:'stock_qty',a:'stockqty,stock,qty,stok',t:'num',r:1}] },
    sales:         { n: 'SALES',         tgl: true,  c: [{k:'kode',a:'kode',t:'kode',r:1},{k:'deskripsi',a:'deskripsi,description,item',r:1},{k:'sales_qty',a:'salesqty,sales,qty',t:'num',r:1}] },
    stock_dc:      { n: 'STOCK-DC',      tgl: true,  c: [{k:'plu',a:'pludc,plu',t:'plu',r:1,u:1},{k:'description',a:'description,deskripsi',r:1},{k:'stok_akh',a:'stokakh,stok,stock',t:'num',r:1}] },
    toko_zona:     { n: 'TOKO PER ZONA', c: [{k:'kode',a:'kode',t:'kode',r:1,u:1},{k:'toko',a:'toko'},{k:'cab',a:'cab',t:'upper',r:1},{k:'zona',a:'zona'},{k:'ket',a:'ket,keterangan',p:1}] },
    bas:           { n: 'BAS',           c: [{k:'kode',a:'kode',t:'kode',r:1,u:1},{k:'toko',a:'toko'},{k:'bas',a:'bas'}] },
    toko_per_item: { n: 'TOKO PER ITEM', c: [{k:'cab',a:'cab',t:'upper',r:1},{k:'kode',a:'kode',t:'kode',r:1},{k:'toko',a:'toko'},{k:'deskripsi',a:'deskripsi,item',r:1},{k:'frac',a:'frac',t:'num',r:1}] },
    item:          { n: 'ITEM',          c: [{k:'plu',a:'plu',t:'plu',r:1,u:1},{k:'deskripsi',a:'deskripsi',r:1},{k:'jenis',a:'jenis'},{k:'frc',a:'frc,frac',t:'num'}] },
    zona:          { n: 'ZONA',          c: [{k:'zona',a:'zona',r:1,u:1},{k:'nama_zona',a:'namazona'},{k:'area',a:'area'},{k:'tipe_kiriman',a:'tipekiriman'}] },
    jadwal:        { n: 'JADWAL',        c: [{k:'zona',a:'zona',r:1},{k:'minggu',a:'minggu',t:'upper',r:1},{k:'tanggal',a:'jadwal,tanggal,tgl',t:'tgl',r:1},{k:'mobil',a:'mobil',t:'int'}] }
  };

  function parse(t) {
    t = String(t).replace(/^\uFEFF/, '');
    const h = t.split(/\r?\n/)[0] || '';
    const cnt = ch => (h.match(new RegExp(ch === '\t' ? '\t' : '\\' + ch, 'g')) || []).length;
    const d = cnt('\t') > 0 ? '\t' : (cnt(';') > cnt(',') ? ';' : ',');
    const rows = []; let r = [], c = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
      else if (ch === '"' && c === '') q = true;
      else if (ch === d) { r.push(c); c = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; if (r.some(x => x.trim())) rows.push(r); r = []; }
      else c += ch;
    }
    if (c || r.length) { r.push(c); if (r.some(x => x.trim())) rows.push(r); }
    return rows;
  }

  function analisa(tabel, text) {
    const cfg = T[tabel], rs = parse(text), out = { rows: [], err: [], fix: 0, dup: 0, skip: 0 };
    if (rs.length < 2) { out.err.push('Tidak ada data. Baris pertama harus judul kolom, lalu datanya.'); return out; }
    const H = rs[0].map(nk), idx = {};
    for (const c of cfg.c) {
      idx[c.k] = H.findIndex(h => c.a.split(',').includes(h));
      if (idx[c.k] < 0 && c.r) out.err.push('Kolom "' + c.a.split(',')[0].toUpperCase() + '" tidak ditemukan di baris judul.');
    }
    if (out.err.length) { out.err.push('Judul yang terbaca: ' + rs[0].map(x => x.trim()).filter(Boolean).join(', ')); return out; }
    const seen = new Set();
    rs.slice(1).forEach((r, i) => {
      const ln = 'Baris ' + (i + 2) + ': ', o = {}; let bad = null;
      for (const c of cfg.c) {
        const raw = idx[c.k] < 0 ? '' : String(r[idx[c.k]] == null ? '' : r[idx[c.k]]).trim();
        let v = raw;
        if (c.t === 'kode') { const x = kodeToko(raw); v = x.v; if (x.fix) out.fix++; }
        else if (c.t === 'plu') { v = plu(raw); if (/^\d(\.\d+)?E\+?\d+$/i.test(v)) bad = bad || ln + 'PLU "' + v + '" berformat ilmiah (format kolom PLU di Excel harus Text).'; }
        else if (c.t === 'upper') v = raw.toUpperCase();
        else if (c.t === 'num') { v = angka(raw); if (isNaN(v)) bad = bad || ln + c.k + ' "' + raw + '" bukan angka.'; }
        else if (c.t === 'int') { v = raw === '' ? null : Math.round(angka(raw)); if (v !== null && isNaN(v)) bad = bad || ln + 'mobil "' + raw + '" bukan angka.'; }
        else if (c.t === 'tgl') { v = tanggal(raw); if (!v) bad = bad || ln + 'tanggal "' + raw + '" tidak dikenali (pakai 2026-11-09 atau 09/11/2026).'; }
        if (c.r && (v === '' || v === null) && !bad) bad = ln + 'kolom ' + c.k + ' kosong.';
        o[c.k] = v;
      }
      if (cfg.c.every(c => o[c.k] === '' || o[c.k] === null || o[c.k] === 0) && !bad) { out.skip++; return; }
      if (bad) { out.err.push(bad); return; }
      const uk = cfg.c.filter(c => c.u).map(c => String(o[c.k]).toUpperCase()).join('|');
      if (uk) { if (seen.has(uk)) { out.dup++; return; } seen.add(uk); }
      for (const c of cfg.c) if (c.p && idx[c.k] < 0) delete o[c.k];
      out.rows.push(o);
    });
    if (!out.rows.length && !out.err.length) out.err.push('Tidak ada baris data yang valid.');
    return out;
  }

  const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  const fmt = n => Number(n || 0).toLocaleString('id-ID');
  const call = (fn, o) => new Promise((ok, no) => run(fn, [TOKEN, o], ok, no));
  const callA = (fn, ...a) => new Promise((ok, no) => run(fn, [TOKEN, ...a], ok, no));

  // Pengaturan tampilan Lihat / Edit / Hapus per tabel
  // pk: kunci baris, kc: kolom kode toko (untuk filter), q: kolom yang dicari, o: urutan,
  // c: kolom (t: jenis, r: wajib, nul: boleh kosong/null, ro: tidak bisa diubah)
  const V = {
    stock:         { pk: 'id', kc: 'kode', q: ['kode','toko','plu','deskripsi'], o: ['kode','deskripsi'], c: [{k:'kode',h:'KODE',t:'kode',r:1},{k:'toko',h:'TOKO'},{k:'plu',h:'PLU'},{k:'deskripsi',h:'DESKRIPSI',r:1},{k:'jenis',h:'JENIS'},{k:'stock_qty',h:'STOCK QTY',t:'num'}] },
    sales:         { pk: 'id', kc: 'kode', q: ['kode','deskripsi'], o: ['kode','deskripsi'], c: [{k:'kode',h:'KODE',t:'kode',r:1},{k:'deskripsi',h:'DESKRIPSI',r:1},{k:'sales_qty',h:'SALES QTY',t:'num'}] },
    stock_dc:      { pk: 'plu', pkText: 1, kc: null, q: ['plu','description'], o: ['plu'], c: [{k:'plu',h:'PLU',t:'plu',r:1},{k:'description',h:'DESCRIPTION'},{k:'stok_akh',h:'STOK AKHIR',t:'num'}] },
    toko_zona:     { pk: 'kode', pkText: 1, kc: 'kode', q: ['kode','toko','cab','zona','ket'], o: ['cab','kode'], c: [{k:'kode',h:'KODE',t:'kode',r:1},{k:'toko',h:'TOKO'},{k:'cab',h:'CAB',t:'upper',r:1},{k:'zona',h:'ZONA'},{k:'ket',h:'KET'}] },
    bas:           { pk: 'kode', pkText: 1, kc: 'kode', q: ['kode','toko','bas'], o: ['kode'], c: [{k:'kode',h:'KODE',t:'kode',r:1},{k:'toko',h:'TOKO'},{k:'bas',h:'BAS'}] },
    toko_per_item: { pk: 'id', kc: 'kode', q: ['cab','kode','toko','deskripsi'], o: ['cab','kode','deskripsi'], c: [{k:'cab',h:'CAB',t:'upper'},{k:'kode',h:'KODE',t:'kode',r:1},{k:'toko',h:'TOKO'},{k:'deskripsi',h:'DESKRIPSI',r:1},{k:'frac',h:'FRAC',t:'num',nul:1}] },
    item:          { pk: 'id', kc: null, q: ['plu','deskripsi','jenis'], o: ['deskripsi'], c: [{k:'plu',h:'PLU',t:'plu',nul:1},{k:'deskripsi',h:'DESKRIPSI',r:1},{k:'jenis',h:'JENIS'},{k:'frc',h:'FRC',t:'num'},{k:'aktif',h:'AKTIF',t:'bool'},{k:'manual',h:'MANUAL',t:'bool'}] },
    zona:          { pk: 'zona', pkText: 1, kc: null, q: ['zona','nama_zona','area','tipe_kiriman'], o: ['zona'], c: [{k:'zona',h:'ZONA',r:1},{k:'nama_zona',h:'NAMA ZONA'},{k:'area',h:'AREA'},{k:'tipe_kiriman',h:'TIPE KIRIMAN'}] },
    jadwal:        { pk: 'id', kc: null, q: ['zona','minggu'], o: ['zona','tanggal'], c: [{k:'zona',h:'ZONA',r:1},{k:'minggu',h:'MINGGU',t:'upper',r:1},{k:'tanggal',h:'TANGGAL',t:'date',r:1},{k:'mobil',h:'MOBIL',t:'int',nul:1}] }
  };
  const WARN = { item: 'Pengaturan item (aktif / manual) ikut kembali ke bawaan.' };

  function normVal(c, raw) {
    raw = String(raw == null ? '' : raw).trim();
    const need = () => (c.r && raw === '') ? c.h + ' wajib diisi.' : null;
    let er = need(); if (er) return { er };
    if (c.t === 'kode') return { v: kodeToko(raw).v };
    if (c.t === 'upper') return { v: raw.toUpperCase() };
    if (c.t === 'plu') { if (raw === '' && c.nul) return { v: null }; return { v: plu(raw) }; }
    if (c.t === 'num') { if (raw === '') return { v: c.nul ? null : 0 }; const n = angka(raw); return isNaN(n) ? { er: c.h + ' "' + raw + '" bukan angka.' } : { v: n }; }
    if (c.t === 'int') { if (raw === '') return { v: null }; const n = angka(raw); return isNaN(n) ? { er: c.h + ' "' + raw + '" bukan angka.' } : { v: Math.round(n) }; }
    if (c.t === 'date') { const d = tanggal(raw); return d ? { v: d } : { er: 'Tanggal "' + raw + '" tidak dikenali (pakai 2026-11-09 atau 09/11/2026).' }; }
    if (c.t === 'bool') return { v: raw === 'true' };
    return { v: raw };
  }
  const showVal = (c, v) => v == null ? '' : c.t === 'bool' ? (v ? 'Ya' : 'Tidak') : c.t === 'num' || c.t === 'int' ? Number(v).toLocaleString('id-ID', { maximumFractionDigits: 4 }) : String(v);

  function injectCss() {
    if (document.getElementById('pbKd')) return;
    const st = document.createElement('style'); st.id = 'pbKd';
    st.textContent = `
.kd{background:#fff;color:var(--tx,#111);border-radius:14px;max-width:1000px;width:100%;max-height:94vh;overflow:auto;box-shadow:0 12px 36px rgba(0,0,0,.32)}
.kd-h{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#fff;z-index:3}
.kd-h b{font-size:15px;display:flex;align-items:center;gap:6px}
.kd-x{border:1px solid #d5dfd9;background:#f2f5f3;border-radius:8px;width:34px;height:30px;cursor:pointer;font-size:15px}
.kd-b{padding:14px 18px 18px}
.kd-g{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.kd label.k{display:block;font-size:12px;font-weight:600;color:var(--mu,#666);margin:0 0 3px}
.kd-tabs{display:flex;gap:8px;margin:12px 0 12px}
.kd-tab{border:1px solid #d5dfd9;background:#f2f5f3;color:#1f2d27;border-radius:99px;padding:7px 16px;font:inherit;font-weight:700;cursor:pointer}
.kd-tab.on{background:#0f766e;border-color:#0f766e;color:#fff}
.kd h4{margin:14px 0 6px;font-size:13px}
.kd-r{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;font-size:13px}
.kd-r label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:500;color:inherit;font-size:13px}
.kd-r input[type=radio]{accent-color:#0f766e;width:16px;height:16px}
.kd-hint{font-size:12px;color:var(--mu,#666);margin:4px 0}
.kd-warn{font-size:12.5px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;border-radius:8px;padding:6px 10px;margin:6px 0}
.kd-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
.kd-bar .sp{flex:1}
.kd .b.kdg{background:#0f766e;color:#fff;border:0;box-shadow:none}
.kd .b.kdg:disabled{background:#9fcfca;cursor:not-allowed}
.kd .b.kdd{background:#fff;color:#b91c1c;border:1px solid #fca5a5}
.kd .b.kdd:disabled{opacity:.45;cursor:not-allowed}
.kd .b.kdd:not(:disabled):hover{background:#fef2f2}
.kd-t{border:1px solid #e5e7eb;border-radius:10px;overflow:auto;max-height:44vh}
.kd-t table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:560px}
.kd-t th{position:sticky;top:0;background:#1e2a5a;color:#fff;text-align:left;padding:6px 8px;font-size:11.5px;z-index:1;white-space:nowrap}
.kd-t td{padding:4px 8px;border-top:1px solid #eef0f3;vertical-align:middle}
.kd-t tr:hover td{background:#f8faff}
.kd-t td.r,.kd-t th.r{text-align:right}
.kd-t td.a{white-space:nowrap;text-align:right}
.kd-t td .in{padding:3px 6px;font-size:12.5px;min-width:70px}
.kd-t tr.ed td{background:#fffbe6}
.kd-pg{display:flex;align-items:center;gap:8px;justify-content:space-between;flex-wrap:wrap;margin-top:8px;font-size:12.5px}
.kd-pb{height:12px;background:#e5e7eb;border-radius:99px;overflow:hidden}.kd-pb i{display:block;height:100%;background:linear-gradient(90deg,#0f766e,#14b8a6);border-radius:99px;transition:width .3s}
.kd-ok{background:#ecfdf5;border:1px solid #10b981;color:#065f46;border-radius:10px;padding:10px 12px;font-size:13.5px}
.kd-er{color:#b00020;font-size:12.5px}
.kd .b.sm{padding:3px 9px;font-size:12px}
@media(max-width:640px){.kd-g{grid-template-columns:1fr}}`;
    document.head.appendChild(st);
  }

  window.openData = function () {
    injectCss();
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px';
    ov.innerHTML = `<div class="kd">
  <div class="kd-h"><b>${ic('up')}Kelola Data (Administrator)</b><button class="kd-x" id="kX" title="Tutup">✕</button></div>
  <div class="kd-b">
    <div class="kd-g">
      <div><label class="k">Tabel</label><select class="in" id="dT">${Object.keys(T).map(k => `<option value="${k}">${T[k].n}</option>`).join('')}</select></div>
      <div><label class="k">Kode toko (opsional, pisah koma)</label><input class="in" id="kK" placeholder="mis. F7P3, FEB7"></div>
    </div>
    <div class="kd-hint" id="kCnt">Menghitung…</div>
    <div class="kd-tabs"><button class="kd-tab on" id="kTU">Upload</button><button class="kd-tab" id="kTV">Lihat / Edit / Hapus</button></div>

    <div id="kPU">
      <h4 style="margin-top:2px">1. Sumber data</h4>
      <div class="kd-r">
        <label><input type="radio" name="kSrc" value="file" checked> File CSV</label>
        <label><input type="radio" name="kSrc" value="paste"> Tempel dari Excel</label>
        <button class="b s sm" id="kTpl">${ic('down')}Unduh template CSV</button>
      </div>
      <div class="kd-hint" id="dH"></div>
      <div id="kSF"><div class="drop" id="dDrop"><input type="file" id="dF" accept=".csv,.txt,.tsv,text/csv,text/plain"><div class="note" style="padding:6px 0 0">atau seret file ke sini</div></div></div>
      <div id="kSP" style="display:none"><textarea class="in" id="dP" rows="5" style="width:100%;font-family:monospace;font-size:12px" placeholder="Salin sel dari Excel termasuk baris judul, lalu tempel di sini.&#10;KODE&#9;TOKO&#9;..."></textarea></div>
      <div id="dTglW" style="display:none;margin-top:8px"><label class="k">Tanggal data (STOCK/SALES jadi "Data Update"; STOCK-DC jadi tanggal stock akhir)</label><input type="date" class="in" id="dTgl" value="${today()}" style="max-width:220px"></div>

      <h4>2. Cara pengisian</h4>
      <div class="kd-r">
        <label><input type="radio" name="kMode" value="upsert" checked> Tambah / perbarui (kunci sama ditimpa, data lain tetap)</label>
        <label><input type="radio" name="kMode" value="replace"> Ganti seluruh isi tabel (isi lama dihapus dulu)</label>
      </div>
      <div class="kd-hint" id="kModeH"></div>
      <div class="kd-r" style="margin-top:8px"><label>Format angka
        <select class="in" id="kNF" style="width:auto"><option value="auto">Otomatis</option><option value="id">Indonesia (1.234,56)</option><option value="en">Internasional (1,234.56)</option></select></label></div>
      <div id="dPrev" style="margin-top:10px"></div>
      <div style="margin-top:12px"><button class="b kdg" id="dOk" disabled>${ic('up')}Mulai upload</button></div>
    </div>

    <div id="kPV" style="display:none">
      <div class="kd-bar">
        <input class="in" id="kQ" placeholder="Cari…" style="max-width:260px">
        <button class="b s" id="kAdd">${ic('plus')}Tambah baris</button>
        <button class="b s" id="kRef">${ic('refresh')}Muat ulang</button>
        <span class="sp"></span>
        <button class="b kdd" id="kDS" disabled>${ic('trash')}Hapus terpilih (0)</button>
        <button class="b kdd" id="kDA">${ic('trash')}Hapus semua hasil</button>
      </div>
      <div class="kd-hint" id="kVI"></div>
      <div class="kd-t" id="kVT"></div>
      <div class="kd-pg" id="kPg"></div>
    </div>
  </div></div>`;
    document.body.appendChild(ov);
    const $o = s => ov.querySelector(s);
    let R = null, lastText = '', lastName = '', busy = false, dirty = false, tab = 'u';
    const tabel = () => $o('#dT').value;
    const kodeOK = () => !!V[tabel()].kc;
    const kodeList = () => !kodeOK() ? [] : $o('#kK').value.split(/[,;\s]+/).map(x => kodeToko(x).v).filter(Boolean);
    const mode = () => ov.querySelector('input[name=kMode]:checked').value;
    const src = () => ov.querySelector('input[name=kSrc]:checked').value;

    const close = () => {
      if (busy) return toast('Tunggu sampai proses selesai.', true);
      document.removeEventListener('keydown', onKey); ov.remove();
      if (dirty) { try { loadData(true); } catch (x) { /* abaikan */ } }
    };
    const onKey = ev => { if (ev.key === 'Escape' && !document.getElementById('pbCf')) close(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', ev => { ov._dn = ev.target === ov; });
    ov.addEventListener('click', ev => { if (ev.target === ov && ov._dn) close(); });
    $o('#kX').onclick = close;

    // ---------- jumlah baris ----------
    let cntT = 0;
    const refreshCount = async () => {
      const tk = ++cntT, t = tabel(), kl = kodeList();
      $o('#kCnt').textContent = 'Menghitung…';
      try {
        const n = await callA('dataCount', { t, kodeCol: V[t].kc, kode: kl });
        if (tk !== cntT) return;
        $o('#kCnt').textContent = fmt(n) + ' baris ' + (kl.length ? 'untuk kode toko yang dipilih (' + kl.length + ' kode)' : 'di tabel ini');
      } catch (x) { if (tk === cntT) $o('#kCnt').textContent = 'Gagal menghitung: ' + ((x && x.message) || x); }
    };

    // ---------- UPLOAD ----------
    const hint = () => {
      const c = T[tabel()];
      $o('#dH').innerHTML = 'Kolom: <b>' + c.c.map(x => x.a.split(',')[0].toUpperCase()).join(', ') + '</b>' + (c.c.some(x => !x.r) ? ' (yang tidak wajib boleh kosong)' : '') + '. Baris pertama harus judul kolom.';
      $o('#dTglW').style.display = c.tgl ? '' : 'none';
      $o('#kK').disabled = !kodeOK();
      $o('#kK').placeholder = kodeOK() ? 'mis. F7P3, FEB7' : 'tabel ini tidak memakai kode toko';
      if (!kodeOK()) $o('#kK').value = '';
      modeHint();
    };
    const modeHint = () => {
      const t = tabel(), kl = kodeList(), cfg = T[t];
      let h = '';
      if (mode() === 'upsert') h = 'Baris dengan kunci yang sama diperbarui, baris baru ditambahkan, data lain tidak disentuh.';
      else {
        h = kl.length ? 'Hanya baris milik ' + kl.length + ' kode toko yang dipilih yang dihapus lalu diisi ulang.' : 'SELURUH isi ' + cfg.n + ' dihapus lalu diganti dengan isi file.';
        if (WARN[t]) h += ' ' + WARN[t];
        if (t === 'toko_zona' && kl.length) h += ' Kolom KET toko tersebut ikut terhapus bila file tidak punya kolom KET.';
      }
      $o('#kModeH').innerHTML = mode() === 'replace' ? '<div class="kd-warn">' + e(h) + '</div>' : e(h);
      $o('#kModeH').className = mode() === 'replace' ? '' : 'kd-hint';
    };
    const cek = () => {
      R = null; $o('#dOk').disabled = true;
      if (!String(lastText).trim()) { $o('#dPrev').innerHTML = ''; return; }
      const t = tabel(), a = analisa(t, lastText);
      let h = '';
      if (a.err.length) h += '<div class="kd-er"><b>' + a.err.length + ' masalah, perbaiki lalu coba lagi:</b><br>' + a.err.slice(0, 8).map(e).join('<br>') + (a.err.length > 8 ? '<br>…' : '') + '</div>';
      else {
        let rows = a.rows, skipK = 0; const kl = kodeList();
        if (kl.length) { const set = new Set(kl); const n0 = rows.length; rows = rows.filter(r => set.has(String(r.kode).toUpperCase())); skipK = n0 - rows.length; }
        if (!rows.length) h += '<div class="kd-er">Tidak ada baris yang cocok dengan kode toko yang dipilih.</div>';
        else {
          R = rows;
          const hasKet = t === 'toko_zona' && rows.length && Object.prototype.hasOwnProperty.call(rows[0], 'ket');
          h += '<div class="note"><b>' + e(lastName || 'Data tempelan') + '</b>: ' + fmt(rows.length) + ' baris siap diunggah ke ' + T[t].n + '.</div>';
          if (skipK) h += '<div class="note">' + ic('info') + skipK + ' baris dilewati karena kode tokonya tidak ada di filter.</div>';
          if (a.fix) h += '<div class="note">' + ic('check') + a.fix + ' kode toko yang berubah jadi tanggal sudah dikembalikan (mis. 7-Feb menjadi FEB7).</div>';
          if (a.dup) h += '<div class="note">' + ic('info') + a.dup + ' baris dobel dilewati (baris pertama dipakai).</div>';
          if (a.skip) h += '<div class="note">' + ic('info') + a.skip + ' baris kosong dilewati.</div>';
          if (t === 'toko_zona' && !hasKet) h += '<div class="note">' + ic('info') + 'File tanpa kolom KET: isi KET yang sudah tersimpan dipertahankan.</div>';
          const cols = T[t].c;
          h += '<div class="kd-t" style="max-height:none;margin-top:6px"><table><thead><tr>' + cols.map(c => '<th>' + e(c.a.split(',')[0].toUpperCase()) + '</th>').join('') + '</tr></thead><tbody>' +
            rows.slice(0, 5).map(r => '<tr>' + cols.map(c => '<td>' + e(r[c.k] == null ? '' : r[c.k]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' +
            (rows.length > 5 ? '<div class="note">Pratinjau 5 dari ' + fmt(rows.length) + ' baris.</div>' : '');
          $o('#dOk').disabled = false;
        }
      }
      $o('#dPrev').innerHTML = h;
    };
    const setSrc = () => { $o('#kSF').style.display = src() === 'file' ? '' : 'none'; $o('#kSP').style.display = src() === 'paste' ? '' : 'none'; };
    const resetUp = () => { R = null; lastText = ''; lastName = ''; $o('#dF').value = ''; $o('#dP').value = ''; $o('#dPrev').innerHTML = ''; $o('#dOk').disabled = true; };
    ov.querySelectorAll('input[name=kSrc]').forEach(r => r.onchange = () => { setSrc(); resetUp(); });
    ov.querySelectorAll('input[name=kMode]').forEach(r => r.onchange = () => modeHint());
    $o('#kNF').onchange = () => { NF = $o('#kNF').value; cek(); };
    $o('#dP').oninput = () => { lastText = $o('#dP').value; lastName = ''; cek(); };
    const file = f => { if (!f) return; const rd = new FileReader(); rd.onload = () => { lastText = rd.result; lastName = f.name; cek(); }; rd.onerror = () => toast('Gagal membaca file', true); rd.readAsText(f, 'utf-8'); };
    $o('#dF').onchange = ev => file(ev.target.files[0]);
    const dz = $o('#dDrop');
    ['dragenter', 'dragover'].forEach(n => dz.addEventListener(n, ev => { ev.preventDefault(); dz.classList.add('on'); }));
    ['dragleave', 'drop'].forEach(n => dz.addEventListener(n, ev => { ev.preventDefault(); dz.classList.remove('on'); }));
    dz.addEventListener('drop', ev => file(ev.dataTransfer.files[0]));
    $o('#kTpl').onclick = () => {
      const t = tabel(), head = T[t].c.map(c => c.a.split(',')[0].toUpperCase()).join(',');
      save(new Blob(['\uFEFF' + head + '\r\n'], { type: 'text/csv;charset=utf-8' }), 'template_' + t + '.csv');
    };
    $o('#dOk').onclick = () => {
      if (!R || busy) return;
      const t = tabel(), cfg = T[t], tgl = cfg.tgl ? $o('#dTgl').value : null, md = mode(), kl = kodeList();
      if (cfg.tgl && !tgl) return toast('Pilih tanggal data', true);
      let msg;
      if (md === 'upsert') msg = fmt(R.length) + ' baris akan ditambahkan / diperbarui di ' + cfg.n + '. Data lain tetap. Lanjut?';
      else msg = (kl.length ? 'Baris ' + cfg.n + ' milik ' + kl.length + ' kode toko yang dipilih' : 'Isi ' + cfg.n + ' yang lama') + ' akan DIHAPUS dan diganti dengan ' + fmt(R.length) + ' baris baru.' + (WARN[t] ? ' ' + WARN[t] : '') + ' Lanjut?';
      const go = async () => {
        busy = true; const btn = $o('#dOk'), pv = $o('#dPrev'), CH = 500, tot = R.length;
        const lock = x => { ov.querySelectorAll('.kd-b input,.kd-b select,.kd-b textarea,.kd-b button').forEach(el => { if (el !== btn) el.disabled = x; }); $o('#kX').disabled = x; };
        const bar = pct => { pv.innerHTML = '<div style="font-size:13px;margin-bottom:6px"><b>Mengunggah ' + e(cfg.n) + '…</b> ' + pct + '%</div><div class="kd-pb"><i style="width:' + pct + '%"></i></div><div class="note" style="padding:4px 0 0">Jangan tutup jendela ini sampai selesai.</div>'; };
        lock(true); btn.disabled = true; btn.textContent = 'Mengunggah 0%'; bar(0);
        try {
          let first = true;
          if (md === 'replace' && kl.length) { await callA('dataDeleteFilter', { t, pk: V[t].pk, kodeCol: V[t].kc, kode: kl }); first = false; }
          for (let i = 0; i < tot; i += CH) {
            const part = R.slice(i, i + CH);
            if (md === 'upsert') await callA('upsertData', t, part, tgl);
            else await callA('gantiData', t, part, first ? 'replace' : 'append', tgl);
            first = false;
            const pct = Math.round(Math.min(i + CH, tot) / tot * 100); bar(pct); btn.textContent = 'Mengunggah ' + pct + '%';
          }
          dirty = true;
          pv.innerHTML = '<div class="kd-ok"><b>✔ Berhasil!</b> ' + e(cfg.n) + ': ' + fmt(tot) + ' baris ' + (md === 'upsert' ? 'ditambahkan / diperbarui' : 'tersimpan') + ' (100%).</div>';
          btn.textContent = 'Selesai'; toast(cfg.n + ': ' + fmt(tot) + ' baris tersimpan');
          busy = false; lock(false); $o('#kK').disabled = !kodeOK(); btn.disabled = true; R = null; refreshCount(); vState.dirty = true;
        } catch (er) {
          busy = false; lock(false); $o('#kK').disabled = !kodeOK(); btn.innerHTML = ic('up') + 'Mulai upload'; btn.disabled = false;
          pv.innerHTML = '<div class="kd-er"><b>Gagal:</b> ' + e((er && er.message) || er) + '<br>Periksa data lalu ulangi unggahan.</div>';
          dirty = true; toast('Gagal di tengah jalan: ' + ((er && er.message) || er), true);
        }
      };
      btn.innerHTML = ic('up') + 'Mulai upload';
      if (typeof pbConfirm === 'function') pbConfirm(msg, go, md === 'replace' ? 'Ya, ganti' : 'Ya, upload'); else go();
    };

    // ---------- LIHAT / EDIT / HAPUS ----------
    const vState = { page: 0, size: 50, q: '', total: 0, rows: [], sel: new Set(), edit: null, add: false, load: 0, dirty: true };
    const vOpt = () => { const t = tabel(), v = V[t]; return { t, pk: v.pk, cols: v.c.map(c => c.k), order: v.o, kodeCol: v.kc, kode: kodeList(), q: vState.q, qcols: v.q }; };
    const inputFor = (c, val, isNew) => {
      if (c.t === 'bool') return '<select class="in" data-k="' + c.k + '"><option value="true"' + (val ? ' selected' : '') + '>Ya</option><option value="false"' + (!val ? ' selected' : '') + '>Tidak</option></select>';
      return '<input class="in" data-k="' + c.k + '" ' + (c.t === 'date' ? 'type="date"' : '') + ' value="' + e(val == null ? '' : val) + '"' + (c.t === 'num' || c.t === 'int' ? ' style="text-align:right"' : '') + '>';
    };
    const renderV = () => {
      const t = tabel(), v = V[t], cols = v.c, S = vState;
      const pages = Math.max(1, Math.ceil(S.total / S.size));
      $o('#kVI').textContent = S.total ? 'Menampilkan ' + fmt(S.page * S.size + 1) + '–' + fmt(Math.min(S.total, (S.page + 1) * S.size)) + ' dari ' + fmt(S.total) + ' baris.' : 'Tidak ada baris.';
      let h = '<table><thead><tr><th style="width:28px"><input type="checkbox" id="kSA"' + (S.rows.length && S.rows.every(r => S.sel.has(String(r[v.pk]))) ? ' checked' : '') + '></th>' +
        cols.map(c => '<th' + (c.t === 'num' || c.t === 'int' ? ' class="r"' : '') + '>' + e(c.h) + '</th>').join('') + '<th></th></tr></thead><tbody>';
      if (S.add) h += '<tr class="ed" data-new="1"><td></td>' + cols.map(c => '<td>' + inputFor(c, c.t === 'bool' ? true : '', true) + '</td>').join('') +
        '<td class="a"><button class="b kdg sm" data-act="addsave">Simpan</button> <button class="b s sm" data-act="addcancel">Batal</button></td></tr>';
      S.rows.forEach(r => {
        const id = String(r[v.pk]);
        if (S.edit === id) h += '<tr class="ed" data-id="' + e(id) + '"><td></td>' + cols.map(c => '<td>' + ((v.pkText && c.k === v.pk) ? e(r[c.k]) : inputFor(c, r[c.k])) + '</td>').join('') +
          '<td class="a"><button class="b kdg sm" data-act="save">Simpan</button> <button class="b s sm" data-act="cancel">Batal</button></td></tr>';
        else h += '<tr data-id="' + e(id) + '"><td><input type="checkbox" class="ksel"' + (S.sel.has(id) ? ' checked' : '') + '></td>' +
          cols.map(c => '<td' + (c.t === 'num' || c.t === 'int' ? ' class="r"' : '') + '>' + e(showVal(c, r[c.k])) + '</td>').join('') +
          '<td class="a"><button class="b s sm" data-act="edit">' + ic('pencil') + 'Edit</button> <button class="b kdd sm" data-act="del">' + ic('trash') + 'Hapus</button></td></tr>';
      });
      if (!S.rows.length && !S.add) h += '<tr><td colspan="' + (cols.length + 2) + '" style="text-align:center;color:#888;padding:18px">Tidak ada data.</td></tr>';
      $o('#kVT').innerHTML = h + '</tbody></table>';
      $o('#kPg').innerHTML = '<div>Baris per halaman <select class="in" id="kSz" style="width:auto;display:inline-block">' + [25, 50, 100, 200].map(n => '<option' + (n === S.size ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
        '<div style="display:flex;gap:6px;align-items:center"><button class="b s sm" id="kP0"' + (S.page <= 0 ? ' disabled' : '') + '>«</button><button class="b s sm" id="kP1"' + (S.page <= 0 ? ' disabled' : '') + '>‹ Sebelumnya</button><span>Halaman ' + (S.page + 1) + ' / ' + fmt(pages) + '</span><button class="b s sm" id="kP2"' + (S.page >= pages - 1 ? ' disabled' : '') + '>Berikutnya ›</button><button class="b s sm" id="kP3"' + (S.page >= pages - 1 ? ' disabled' : '') + '>»</button></div>';
      const n = S.sel.size; const ds = $o('#kDS'); ds.disabled = !n; ds.innerHTML = ic('trash') + 'Hapus terpilih (' + n + ')';
      const bind = (id, fn) => { const el = $o(id); if (el) el.onclick = fn; };
      bind('#kP0', () => go0(0)); bind('#kP1', () => go0(S.page - 1)); bind('#kP2', () => go0(S.page + 1)); bind('#kP3', () => go0(pages - 1));
      const sz = $o('#kSz'); if (sz) sz.onchange = () => { S.size = Number(sz.value); S.page = 0; loadV(); };
    };
    const go0 = p => { vState.page = Math.max(0, p); loadV(); };
    const loadV = async () => {
      const S = vState, tk = ++S.load; S.edit = null; S.add = false; S.sel = new Set(); S.dirty = false;
      $o('#kVI').textContent = 'Memuat…';
      try {
        const o = vOpt(); o.from = S.page * S.size; o.to = o.from + S.size - 1;
        const r = await callA('dataList', o); if (tk !== S.load) return;
        S.rows = r.rows; S.total = r.total;
        if (!S.rows.length && S.page > 0) { S.page = Math.max(0, Math.ceil(S.total / S.size) - 1); return loadV(); }
        renderV();
      } catch (x) { if (tk === S.load) { $o('#kVI').innerHTML = '<span class="kd-er">Gagal memuat: ' + e((x && x.message) || x) + '</span>'; } }
    };
    const after = async (msg) => { dirty = true; toast(msg); refreshCount(); await loadV(); };
    const readRow = tr => {
      const row = {}, v = V[tabel()];
      for (const c of v.c) {
        const el = tr.querySelector('[data-k="' + c.k + '"]'); if (!el) continue;
        const n = normVal(c, el.value); if (n.er) { toast(n.er, true); return null; } row[c.k] = n.v;
      }
      return row;
    };
    const delAsk = (msg, fn, txt) => { if (typeof pbConfirm === 'function') pbConfirm(msg, fn, txt || 'Ya, hapus'); else fn(); };
    const doDelete = (ids, label) => delAsk('Hapus ' + label + '? Tindakan ini tidak bisa dibatalkan.', async () => {
      busy = true;
      try { const n = await callA('dataDelete', { t: tabel(), pk: V[tabel()].pk, ids }); busy = false; await after(fmt(n) + ' baris dihapus'); }
      catch (x) { busy = false; toast('Gagal menghapus: ' + ((x && x.message) || x), true); }
    });
    $o('#kVT').addEventListener('click', async ev => {
      const S = vState, v = V[tabel()];
      if (ev.target.id === 'kSA') { S.rows.forEach(r => { const id = String(r[v.pk]); if (ev.target.checked) S.sel.add(id); else S.sel.delete(id); }); return renderV(); }
      if (ev.target.classList.contains('ksel')) { const id = ev.target.closest('tr').dataset.id; if (ev.target.checked) S.sel.add(id); else S.sel.delete(id); const ds = $o('#kDS'); ds.disabled = !S.sel.size; ds.innerHTML = ic('trash') + 'Hapus terpilih (' + S.sel.size + ')'; return; }
      const b = ev.target.closest('button[data-act]'); if (!b) return;
      const tr = b.closest('tr'), id = tr.dataset.id, act = b.dataset.act;
      if (act === 'edit') { S.edit = id; S.add = false; return renderV(); }
      if (act === 'cancel') { S.edit = null; return renderV(); }
      if (act === 'addcancel') { S.add = false; return renderV(); }
      if (act === 'del') { const r = S.rows.find(x => String(x[v.pk]) === id); return doDelete([r[v.pk]], '1 baris' + (v.pkText ? ' (' + r[v.pk] + ')' : '')); }
      if (act === 'save' || act === 'addsave') {
        const row = readRow(tr); if (!row) return;
        b.disabled = true;
        try {
          if (act === 'save') { if (v.pkText) delete row[v.pk]; await callA('dataSave', { t: tabel(), pk: v.pk, id: S.rows.find(x => String(x[v.pk]) === id)[v.pk], row }); await after('Perubahan disimpan'); }
          else { await callA('dataInsert', { t: tabel(), row }); S.add = false; await after('Baris ditambahkan'); }
        } catch (x) { b.disabled = false; toast((x && x.message) || x, true); }
      }
    });
    $o('#kAdd').onclick = () => { vState.add = true; vState.edit = null; renderV(); const f = $o('#kVT tr[data-new] input,#kVT tr[data-new] select'); if (f) f.focus(); };
    $o('#kRef').onclick = () => loadV();
    $o('#kDS').onclick = () => { const v = V[tabel()], ids = vState.rows.filter(r => vState.sel.has(String(r[v.pk]))).map(r => r[v.pk]); if (ids.length) doDelete(ids, fmt(ids.length) + ' baris terpilih'); };
    $o('#kDA').onclick = () => {
      const t = tabel(), kl = kodeList(), S = vState, cfg = T[t];
      if (!S.total) return toast('Tidak ada baris untuk dihapus.', true);
      const filt = kl.length || S.q;
      const desc = filt ? fmt(S.total) + ' baris hasil filter' + (kl.length ? ' (kode toko: ' + kl.join(', ') + ')' : '') + (S.q ? ' (kata kunci "' + S.q + '")' : '') : 'SEMUA ' + fmt(S.total) + ' baris di tabel ' + cfg.n;
      const run1 = async () => {
        busy = true;
        try { const n = await callA('dataDeleteFilter', vOpt()); busy = false; await after(fmt(n) + ' baris dihapus'); }
        catch (x) { busy = false; toast('Gagal menghapus: ' + ((x && x.message) || x), true); }
      };
      delAsk('Hapus ' + desc + '? Tindakan ini tidak bisa dibatalkan.', () => {
        if (filt) run1(); else setTimeout(() => delAsk('Yakin? Seluruh isi tabel ' + cfg.n + ' akan dikosongkan.', run1, 'Ya, kosongkan'), 50);
      });
    };
    let qT = null;
    $o('#kQ').oninput = () => { clearTimeout(qT); qT = setTimeout(() => { vState.q = $o('#kQ').value.trim(); vState.page = 0; loadV(); }, 350); };
    $o('#kQ').onkeydown = ev => { if (ev.key === 'Enter') { clearTimeout(qT); vState.q = $o('#kQ').value.trim(); vState.page = 0; loadV(); } };

    // ---------- tab & pemilih tabel ----------
    const showTab = t => {
      tab = t; $o('#kTU').classList.toggle('on', t === 'u'); $o('#kTV').classList.toggle('on', t === 'v');
      $o('#kPU').style.display = t === 'u' ? '' : 'none'; $o('#kPV').style.display = t === 'v' ? '' : 'none';
      if (t === 'v' && vState.dirty) loadV();
    };
    $o('#kTU').onclick = () => showTab('u'); $o('#kTV').onclick = () => showTab('v');
    $o('#dT').onchange = () => { hint(); resetUp(); refreshCount(); vState.page = 0; vState.q = ''; $o('#kQ').value = ''; vState.dirty = true; if (tab === 'v') loadV(); };
    let kT = null;
    $o('#kK').oninput = () => { clearTimeout(kT); kT = setTimeout(() => { modeHint(); refreshCount(); cek(); vState.page = 0; vState.dirty = true; if (tab === 'v') loadV(); }, 400); };
    hint(); setSrc(); refreshCount();
  };
})();
