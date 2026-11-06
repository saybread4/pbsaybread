/* PB SAY BREAD - menu "Unggah Data" (administrator).
   Bisa dari file CSV atau tempel langsung dari Excel. Isi tabel lama DIGANTI dengan isi baru. */
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
  function angka(v) {
    let s = String(v == null ? '' : v).trim().replace(/\s/g, '');
    if (s === '') return 0;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
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
    toko_zona:     { n: 'TOKO PER ZONA', c: [{k:'kode',a:'kode',t:'kode',r:1,u:1},{k:'toko',a:'toko'},{k:'cab',a:'cab',t:'upper',r:1},{k:'zona',a:'zona'}] },
    bas:           { n: 'BAS',           c: [{k:'kode',a:'kode',t:'kode',r:1,u:1},{k:'toko',a:'toko'},{k:'cab_pnl',a:'cabpnl'},{k:'cabang',a:'cabang'},{k:'bam',a:'bam'},{k:'bas',a:'bas'}] },
    toko_per_item: { n: 'TOKO PER ITEM', c: [{k:'cab',a:'cab',t:'upper',r:1},{k:'kode',a:'kode',t:'kode',r:1},{k:'toko',a:'toko'},{k:'deskripsi',a:'deskripsi,item',r:1},{k:'frac',a:'frac',t:'num',r:1}] },
    item:          { n: 'ITEM',          c: [{k:'plu',a:'plu',t:'plu',r:1,u:1},{k:'deskripsi',a:'deskripsi',r:1},{k:'jenis',a:'jenis'},{k:'frc',a:'frc,frac',t:'num'}] },
    zona:          { n: 'ZONA',          c: [{k:'zona',a:'zona',r:1,u:1},{k:'nama_zona',a:'namazona'},{k:'area',a:'area'},{k:'tipe_kiriman',a:'tipekiriman'}] },
    arsip_pb:      { n: 'ARSIP PB (Jadwal Kirim)', c: [{k:'tanggal',a:'tanggal,tgl',t:'tgl',r:1,u:1},{k:'zona',a:'zona',r:1,u:1},{k:'cab',a:'cab',t:'upper'},{k:'kode',a:'kode',t:'kode',r:1,u:1},{k:'toko',a:'toko'},{k:'pb_final',a:'pbfinal,pb',t:'num',r:1}] },
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
      out.rows.push(o);
    });
    if (!out.rows.length && !out.err.length) out.err.push('Tidak ada baris data yang valid.');
    return out;
  }

  const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };

  window.openData = function () {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = '<div style="background:#fff;color:var(--tx,#111);border-radius:12px;padding:18px;max-width:560px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,.3)">' +
      '<b style="font-size:15px">'+ic('up')+'Unggah Data</b>' +
      '<div style="font-size:12px;color:var(--mu,#666);margin:4px 0 10px">Isi tabel yang dipilih akan <b>diganti seluruhnya</b> dengan data baru. Baris pertama harus judul kolom seperti di sheet Excel.</div>' +
      '<label>Data yang diunggah</label><select class="in" id="dT">' + Object.keys(T).map(k => '<option value="' + k + '">' + T[k].n + '</option>').join('') + '</select>' +
      '<div class="note" id="dH" style="padding:4px 0 8px"></div>' +
      '<div id="dTglW" style="display:none;margin-bottom:8px"><label>Tanggal data (STOCK/SALES jadi "Data Update"; STOCK-DC jadi tanggal stock akhir)</label><input type="date" class="in" id="dTgl" value="' + today() + '"></div>' +
      '<div class="drop" id="dDrop"><input type="file" id="dF" accept=".csv,.txt,.tsv,text/csv,text/plain"><div class="note" style="padding:6px 0 0">atau seret file ke sini</div></div>' +
      '<label style="margin-top:8px">Atau tempel dari Excel (salin sel termasuk baris judul)</label><textarea class="in" id="dP" rows="4" style="width:100%;font-family:monospace;font-size:12px" placeholder="KODE\tTOKO\t..."></textarea>' +
      '<div id="dPrev" style="margin-top:8px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="b s" id="dC">Tutup</button><button class="b p" id="dOk" disabled>Unggah</button></div></div>';
    document.body.appendChild(ov);
    const $o = s => ov.querySelector(s);
    let R = null;
    ov.onclick = ev => { if (ev.target === ov) ov.remove(); };
    $o('#dC').onclick = () => ov.remove();
    const hint = () => {
      const c = T[$o('#dT').value];
      $o('#dH').innerHTML = 'Kolom: <b>' + c.c.map(x => x.a.split(',')[0].toUpperCase()).join(', ') + '</b>' + (c.c.some(x => !x.r) ? ' (yang tidak wajib boleh kosong)' : '');
      $o('#dTglW').style.display = c.tgl ? '' : 'none';
    };
    const cek = (text, nama) => {
      R = null; $o('#dOk').disabled = true; const tabel = $o('#dT').value;
      if (!String(text).trim()) { $o('#dPrev').innerHTML = ''; return; }
      const a = analisa(tabel, text);
      let h = '';
      if (a.err.length) h += '<div style="color:#b00020;font-size:12.5px"><b>' + a.err.length + ' masalah, perbaiki lalu coba lagi:</b><br>' + a.err.slice(0, 8).map(e).join('<br>') + (a.err.length > 8 ? '<br>…' : '') + '</div>';
      else {
        R = a.rows;
        h += '<div class="note"><b>' + e(nama || 'Data tempelan') + '</b>: ' + a.rows.length.toLocaleString('id-ID') + ' baris siap diunggah ke ' + T[tabel].n + '.</div>';
        if (a.fix) h += '<div class="note">'+ic('check')+'' + a.fix + ' kode toko yang berubah jadi tanggal sudah dikembalikan (mis. 7-Feb menjadi FEB7).</div>';
        if (a.dup) h += '<div class="note">'+ic('info')+'' + a.dup + ' baris dobel dilewati (baris pertama dipakai).</div>';
        if (a.skip) h += '<div class="note">'+ic('info')+'' + a.skip + ' baris kosong dilewati.</div>';
        $o('#dOk').disabled = false;
      }
      $o('#dPrev').innerHTML = h;
    };
    $o('#dT').onchange = () => { hint(); $o('#dPrev').innerHTML = ''; R = null; $o('#dOk').disabled = true; $o('#dF').value = ''; $o('#dP').value = ''; };
    $o('#dP').oninput = () => cek($o('#dP').value);
    const file = f => { if (!f) return; const rd = new FileReader(); rd.onload = () => cek(rd.result, f.name); rd.onerror = () => toast('Gagal membaca file', true); rd.readAsText(f, 'utf-8'); };
    $o('#dF').onchange = ev => file(ev.target.files[0]);
    const dz = $o('#dDrop');
    ['dragenter', 'dragover'].forEach(n => dz.addEventListener(n, ev => { ev.preventDefault(); dz.classList.add('on'); }));
    ['dragleave', 'drop'].forEach(n => dz.addEventListener(n, ev => { ev.preventDefault(); dz.classList.remove('on'); }));
    dz.addEventListener('drop', ev => file(ev.dataTransfer.files[0]));
    $o('#dOk').onclick = async () => {
      if (!R) return;
      const tabel = $o('#dT').value, cfg = T[tabel], tgl = cfg.tgl ? $o('#dTgl').value : null;
      if (cfg.tgl && !tgl) return toast('Pilih tanggal data', true);
      if (!confirm('Isi ' + cfg.n + ' yang lama akan DIGANTI dengan ' + R.length.toLocaleString('id-ID') + ' baris baru. Lanjut?')) return;
      const btn = $o('#dOk'); btn.disabled = true;
      const CH = 4000;
      try {
        for (let i = 0; i < R.length; i += CH) {
          btn.textContent = 'Mengunggah ' + Math.min(i + CH, R.length).toLocaleString('id-ID') + '/' + R.length.toLocaleString('id-ID') + '…';
          await new Promise((ok, no) => run('gantiData', [TOKEN, tabel, R.slice(i, i + CH), i === 0 ? 'replace' : 'append', tgl], ok, no));
        }
        ov.remove(); toast('' + cfg.n + ': ' + R.length.toLocaleString('id-ID') + ' baris tersimpan');
        loadData(true);
      } catch (er) {
        btn.textContent = 'Unggah'; btn.disabled = false;
        toast('Gagal di tengah jalan: ' + ((er && er.message) || er) + '. Unggah ulang file yang sama sampai berhasil.', true);
      }
    };
    hint();
  };
})();
