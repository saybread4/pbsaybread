-- Migration "toko_mingguan_seperti_zona_t" (sudah diterapkan ke Supabase).
-- Toko kirim mingguan yang zonanya berganti tiap minggu diperlakukan seperti zona T.
-- Daftar toko ada di tabel settings, key = toko_mingguan. Menambah toko baru:
--   update settings set value = value || '"KODE"'::jsonb where key = 'toko_mingguan';
-- Menghapus toko dari daftar:
--   update settings set value = value - 'KODE' where key = 'toko_mingguan';   -- (atau tulis ulang array-nya)
-- Isi lengkap fungsi/view: lihat Supabase -> Database -> Functions: is_toko_mingguan, tgl_kirim_zona, arsip_pb_put, pb_kirim_trg, view v_pb_zona_t.
insert into settings(key, value) values ('toko_mingguan', '["TIMX","TQ16","T4BL"]'::jsonb) on conflict (key) do nothing;
