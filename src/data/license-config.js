/* Konfigurasi lisensi sisi aplikasi sekolah.

   Kedua nilai di bawah BUKAN rahasia:
   - LICENSE_API_BASE hanya alamat server lisensi;
   - LICENSE_PUBLIC_JWK adalah kunci PUBLIK untuk memverifikasi Activation Token.

   Kunci privat penandatangan TIDAK PERNAH berada di berkas ini, di bundle, maupun di APK.
   Kunci itu hanya hidup di server lisensi dan dibaca dari environment.

   Isi LICENSE_PUBLIC_JWK dengan keluaran:
     node server/scripts/generate-signing-key.mjs */

export const LICENSE_API_BASE='';
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
