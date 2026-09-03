/* Konfigurasi lisensi sisi aplikasi sekolah.

   Kedua nilai di bawah BUKAN rahasia:
   - LICENSE_API_BASE hanya alamat server lisensi;
   - LICENSE_PUBLIC_JWK adalah kunci PUBLIK untuk memverifikasi Activation Token.

   Kunci privat penandatangan TIDAK PERNAH berada di berkas ini, di bundle, maupun di APK.
   Kunci itu hanya hidup di server lisensi dan dibaca dari environment.

   Isi LICENSE_PUBLIC_JWK dengan keluaran:
     node server/scripts/generate-signing-key.mjs */

/* Alamat server lisensi produksi. Bukan rahasia: ini hanya alamat HTTP yang sama dengan yang
   dibuka di peramban. Nilai ini SENGAJA ditanam agar APK hasil build membawa alamat yang benar;
   sebelumnya nilainya kosong sehingga aplikasi Android menjawab "Server lisensi belum
   dikonfigurasi pada aplikasi ini" dan aktivasi tidak pernah bisa dijalankan. */
export const LICENSE_API_BASE='https://e-rapor-sdn-satria-jaya-01-cloud.vercel.app';

/* Kunci PUBLIK untuk memverifikasi tanda tangan Activation Token. Diisi saat build produksi
   oleh scripts/set-license-config.mjs dari environment LICENSE_PUBLIC_JWK, yang nilainya
   dicetak oleh server/scripts/generate-signing-key.mjs bersama kunci privatnya.

   Kunci PRIVAT tidak pernah berada di sini, di bundle, di aset Android, maupun di APK. */
export const LICENSE_PUBLIC_JWK=null;

/* Aplikasi memeriksa ulang lisensi ke server paling sering setiap 14 hari, dan memberi masa
   tenggang 14 hari lagi bila perangkat sedang tanpa internet. Selama masa itu aplikasi tetap
   dapat dipakai penuh. */
export const LICENSE_CHECK_INTERVAL_DAYS=14;
export const LICENSE_GRACE_PERIOD_DAYS=14;

/* Kunci penyimpanan lisensi sengaja TERPISAH dari DB_KEY aplikasi. Karena backup hanya
   mengekspor isi DB_KEY, lisensi dan Installation ID otomatis tidak pernah ikut ke berkas
   backup dan tidak dapat berpindah perangkat lewat restore. */
export const INSTALLATION_STORAGE_KEY='erapor_installation_v1';
export const LICENSE_STORAGE_KEY='erapor_license_v1';
