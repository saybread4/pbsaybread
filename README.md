# PB SAY BREAD

Web PB (permintaan barang) SAY BREAD. Situs statis (tanpa build) dengan database Supabase.

## Isi
| File | Fungsi |
|---|---|
| `index.html` | Tampilan seluruh halaman |
| `pb-api.js` | Jembatan ke Supabase (`run('namaFungsi', ...)`) + pembuat file Excel di browser |
| `pb-admin-data.js` | Menu Unggah Data (administrator) |
| `pb-stokdcf.js` | Menu **Stock DCF** (administrator): sub halaman Stock & Data ED |
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
- **PO TAKAKI**: menu baru di kanan Stock DCF (`pb-stokdcf.js`), isi halaman menyusul.
