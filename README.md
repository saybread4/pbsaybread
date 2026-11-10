# PB SAY BREAD

Web PB (permintaan barang) SAY BREAD. Situs statis (tanpa build) dengan database Supabase.

## Isi
| File | Fungsi |
|---|---|
| `index.html` | Tampilan seluruh halaman |
| `pb-api.js` | Jembatan ke Supabase (`run('namaFungsi', ...)`) + pembuat file Excel di browser |
| `pb-admin-data.js` | Menu Unggah Data (administrator) |
| `pb-dcf.js` | Menu **Stok & Order DCF** (administrator): stok DC, rekomendasi order Takaki, inbound/PO on going |
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

## Stok & Order DCF (administrator)
Menu muncul otomatis hanya untuk administrator. Satuan semua angka = CTN.
- **Stok DC** = stok Takaki (unggah file Monitoring Stock, sheet `data ED`) + inbound sejak tanggal mulai − outbound PB per tanggal (minggu berjalan & depan dari web, sesudahnya rata-rata 4 minggu).
- **Order Takaki**: rekomendasi = target DSI (default 30 hari) × rata-rata outbound 4 minggu ÷ 7 − estimasi stok akhir periode kirim (termasuk PO on going). Dibulatkan pallet penuh (77 ctn); sisa ≥ 50% pallet dibulatkan naik, sisa kecil tetap ctn. Dibagi ke tanggal kirim, bisa diedit manual, disimpan, dan diunduh sebagai Excel PO Takaki.
- **Inbound / PO On Going**: matriks tanggal × item. Tanggal sampai hari ini = sudah tiba; sesudahnya = on going. Tombol "Jadikan PO on going" di daftar PO tersimpan memasukkan PO ke inbound.
- Riwayat outbound mingguan bertambah otomatis dari web setiap menu dibuka.
- Tabel & kebijakan akses: `migrasi-dcf-stok-order.sql`.
