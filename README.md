# PB SAY BREAD

Web PB (permintaan barang) SAY BREAD. Situs statis (tanpa build) dengan database Supabase.

## Isi
| File | Fungsi |
|---|---|
| `index.html` | Tampilan seluruh halaman |
| `pb-api.js` | Jembatan ke Supabase (`run('namaFungsi', ...)`) + pembuat file Excel di browser |
| `pb-admin-data.js` | Menu Unggah Data (administrator) |
| `pb-stokdcf.js` | Menu **Stock DCF** (administrator): sub halaman Stock & Data ED |
| `pb-potakaki.js` | Menu **PO TAKAKI** (hanya administrator): PO per mobil, rekomendasi jumlah PO |
| `migrasi-po-takaki.sql` | Tabel & fungsi database halaman PO TAKAKI (jalankan sekali di Supabase SQL Editor) |
| `_headers` | Header keamanan & anti-cache untuk Cloudflare Pages |

Database: project Supabase **PB SAY BREAD**. Kunci yang ada di `pb-api.js` adalah kunci *publishable* (aman dibuka); akses data dijaga RLS dan fungsi database.

## Deploy ke Cloudflare Pages
1. Buat repo GitHub baru (boleh private), unggah seluruh isi folder ini ke root repo.
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pilih repo.
3. Pengaturan build:
   - Framework preset: **None**
   - Build command: *(kosongkan)*
   - Build output directory: `/`
4. **Save and Deploy**. Alamat: `https://<nama-project>.pages.dev`.
5. Setiap `git push` ke branch `main` otomatis memperbarui situs.

## Setelah deploy
- Supabase → **Authentication → URL Configuration**: isi *Site URL* dengan alamat Pages.
- Tanpa Git: Pages → **Upload assets** → seret folder ini.

## Pembuat
Fahrur Rozy

## Catatan performa & keamanan
- **Input PB**: hanya ±400 baris pertama yang dibuka otomatis; klik nama toko untuk membuka, atau pakai filter / tombol "Buka semua". Membuka ribuan baris sekaligus membuat browser berat.
- `savePB` mengirim perubahan per 150 baris (batas waktu query Supabase ±8 detik).
- Skrip `supabase-js`, `pb-api.js`, `pb-admin-data.js` dimuat dengan `defer` sehingga halaman login tampil tanpa menunggu CDN.
- `_headers`: CSP masih mode *Report-Only*. Setelah Console (F12) bersih, ganti menjadi `Content-Security-Policy`.
- Database: indeks ekspresi `toko_per_item_norm_idx`, `pb_norm_web_idx`, `toko_zona_norm_idx`, `bas_norm_idx` mempercepat `simpan_pb`; EXECUTE fungsi RPC untuk `anon` sudah dicabut.

## Toko kirim mingguan (seperti zona T)
Toko yang dikirim tiap minggu tetapi zonanya berganti (mis. MINGGU 1 = YH/ZL, MINGGU 2 = Y) didaftarkan di tabel `settings`, key `toko_mingguan` (array kode toko, saat ini `TIMX`, `TQ16`, `T4BL`).
- Tanggal kirim PB toko ini = jadwal **zona toko saat ini** (`toko_zona`). **Ganti zona toko di TOKO PER ZONA setiap minggu**, sama seperti sebelumnya.
- PB minggu lalu otomatis diarsipkan (`arsip_pb_toko_item`) dan **ditambahkan ke STOCK** (tanda `+n` di kolom STOCK), persis seperti zona T.
- Tambah toko: `update settings set value = value || '"KODE"'::jsonb where key = 'toko_mingguan';`
- Logika ada di database: `pb_kirim_trg`, `arsip_pb_put`, `is_toko_mingguan`, `tgl_kirim_zona`, view `v_pb_zona_t`.

## Stock DCF
Menu paling belakang di navigasi, tampil untuk semua user login. **User biasa hanya melihat**; unggah data, kolom CORE, kolom AKTIF (Data Exp Date) dan edit Rekap PO hanya untuk administrator (dijaga RLS di database). Satuan = CTN. Tiga sub halaman (kiri ke kanan):
- **Data Exp Date**: unggah file Monitoring Stock Takaki (sheet `data ED`); tanggal dari sel B2 bisa diubah sebelum Simpan. Sisa hari simpan < 40 hari kuning tipis, < 30 hari merah tipis. Kolom AKTIF (dan urutan AKTIF di atas) hanya tampil untuk administrator.
- **Stock**: PLU, DESKRIPSI, STOCK, **QPD (Ctn)** (= sales per hari ÷ FRC), **DSI** (= STOCK ÷ QPD Ctn), lalu (dengan jarak) PB minggu berjalan, Est. STOCK Sabtu, PO ON GOING (tgl PO <= Sabtu - 3 hari), **Est. STOCK 15 Nov** (h-1 jadwal kirim minggu depan = Est. STOCK Sabtu + PO on going), **PB minggu depan** (Senin-Sabtu, mis. 16-21 Nov), PO on going berikutnya (mis. 12-18 Nov) dan **Est. STOCK 22 Nov** (= Est. STOCK 15 Nov - PB minggu depan, min. 0, + PO on going berikutnya). PB diambil otomatis dari `get_outbound` (`cur` dan `next`). Baris hijau = item core (centang kolom CORE). Urutan: core dulu, lalu sales tertinggi (`stokdcf_sales()`). QPD dari `stokdcf_qpd()` (lihat `migrasi-stokdcf-qpd.sql`).
- **Rekap PO** (PO on going per tanggal): urutan item sama dengan Stock; angka dan tanggal bisa diedit (klik tanggal di judul, pilih/ketik tanggal baru, Enter; kolom otomatis urut tanggal); bisa tempel dari Excel atau unggah CSV/xlsx.
- Tabel: `stokdcf_item`, `stokdcf_ed`, `stokdcf_po` (hanya admin, RLS `is_admin()`). Skema ada di `migrasi-stok-dcf.sql` (aman dijalankan ulang, tidak menghapus data).

## Stock-DC vs PB (Rekap Cabang)
Stok yang dipakai = **Est. STOCK h-1 jadwal kirim minggu depan** dari Stock DCF (mis. Est. STOCK 15 Nov), bukan lagi sheet STOCK-DC. Menu unggah/lihat **STOCK-DC** di Data dihapus. Pembagian JATAH per cabang dihitung ulang di browser (`allocJatah`, sama dengan fungsi database `alloc_jatah`). Item PB yang tidak ada di daftar Stock DCF dianggap stok 0 dan diberi peringatan. Sheet STOCK-DC VS PB di Download Master memakai stok yang sama.

## Simulasi Outbound & PO TAKAKI
- **Simulasi Outbound**: STOCK AKHIR minggu depan = **Est. STOCK 15 Nov** (Stock DCF), minggu berjalan = STOCK per tanggal Data Exp Date. Sheet SIMULASI di Download Master memakai angka yang sama. Tabel `stock_dc` di Supabase tidak dipakai lagi.
- **PO TAKAKI** (hanya administrator): lihat bagian di bawah.

## PO TAKAKI (hanya administrator)
Menu di kanan Stock DCF, isi mengikuti Excel *EST. PO TAKAKI JATIM*. Satuan CTN; PALLET boleh desimal (koma/titik). **Jalankan `migrasi-po-takaki.sql` di Supabase dulu** (hanya menambah tabel `potakaki_po`, `potakaki_po_item`, `potakaki_cfg` dan fungsi `potakaki_info()`; RLS `is_admin()`).
- **Periode** = request pengiriman Senin-Sabtu setelah Est. STOCK terakhir di Stock DCF (mis. Est. STOCK 22 Nov -> request 23-28 Nov). Data PO disimpan per periode.
- **PO 1, PO 2, ...** = satu mobil per PO (maks. 12). Tiap PO punya pilihan kendaraan (TRONTON / JUMBO / BUILT-UP), tanggal kirim, dan ctn per pallet (default 77, biru = bisa diedit). CTN = PALLET x ctn/plt, dibulatkan. Tombol **+ Tambah PO (mobil)**; x di header PO untuk menghapus.
- **STOCK (jika tanpa forecast)** = Est. STOCK terakhir (Stock DCF); **STOCK (jika ada forecast)** = STOCK + TOTAL PO. **BUFFER %** = (STOCK - rata-rata PB/minggu) / rata-rata PB/minggu, minimal 0. **DSI** = STOCK / QPD (Ctn). **QPD (Ctn)** = sales per hari / FRC. **JML TOKO JUAL** = jumlah toko yang punya item (tabel `toko_per_item`). **AVERAGE OUTB (PB) PER WEEK** = rata-rata PB (CTN) per minggu dari `arsip_pb_item`, maks. 4 minggu terakhir yang tersedia.
- **Rekomendasi**: kebutuhan CTN = jumlah per item `max(0, target DSI x QPD - STOCK)`. Jumlah PO = kombinasi kendaraan paling sedikit yang muat (lalu yang paling pas). **Terapkan rekomendasi** mengisi pallet per item (kelipatan 1/2 pallet): *Kendaraan diisi penuh* meratakan DSI (water-filling) atau *Pas sampai target DSI*. Setelah itu pallet tetap bisa diedit; baris bawah tabel menampilkan sisa kapasitas tiap mobil (merah bila melebihi tonase).
- Target DSI (default 30 hari) dan tonase kendaraan (ctn) bisa diubah di halaman, tersimpan di `potakaki_cfg`.
- **Teks REQUEST PENGIRIMAN** di bawah judul bisa diklik dan diubah sendiri (tersimpan per periode di `potakaki_cfg`, key `request_text|<tanggal periode>`; kosongkan lalu Enter = kembali otomatis). Ikut tampil di JPG & Excel.
- **Item core**: warna hijau dan urutan baris otomatis mengikuti Stock DCF (kolom CORE di Stock DCF); tidak diubah dari halaman ini.
- **Rekomendasi DSI**: item core ditargetkan DSI = Target DSI, item lainnya = Target DSI - 5 hari (konstanta `GAP` di `pb-potakaki.js`). Berlaku di rekomendasi, isi otomatis, dan hitungan "Item DSI < target".
- **Hapus / tambah item**: tombol × di kiri tiap baris menyembunyikan item dari tabel (total, rekomendasi, JPG & Excel ikut tanpa item itu); item yang dihapus bisa dikembalikan lewat pilihan *+ Tambah item…* di atas tabel. Tersimpan di `potakaki_cfg` key `item_hidden`.
- **CTN per pallet** satu isian di atas tabel, berlaku untuk semua PO (tidak ada lagi di header PO).
- **Baris Muatan kendaraan**: menampilkan nama kendaraan; bila muatan 100% hanya nama (mis. TRONTON), bila belum penuh ditambah `Sisa x / kapasitas (%)`. Header JPG/Excel tidak lagi memuat nama kendaraan dan ctn/plt (di Excel baris 3 ctn/plt disembunyikan, rumus tetap jalan).
- **Download** (satu tombol, pilihan JPG atau Excel .xlsx): JPG = gambar tabel seperti Excel; Excel = tabel yang sama dengan rumus (CTN = ROUND(pallet x ctn/plt), STOCK ada forecast, buffer, DSI) + kapasitas & sisa tiap mobil. Excel memakai pustaka ExcelJS dari cdn.jsdelivr.net (sama seperti download Master PB).
