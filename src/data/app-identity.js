/* Identitas produk dan pembuat aplikasi. PERMANEN.

   Berkas ini adalah satu-satunya sumber nama produk dan identitas pengembang. Nilainya
   ditanam di kode dan TIDAK PERNAH dibaca dari database, backup sekolah, atau form mana pun,
   sehingga sekolah pengguna tidak dapat menggantinya — termasuk dengan menyunting berkas
   backup lalu me-restore-nya.

   Identitas sekolah adalah hal yang berbeda dan bersifat dinamis: sumbernya masterData.school
   melalui getSchoolMaster(). Jangan pernah mencampur keduanya di satu tempat penyimpanan. */

export const APP_NAME='e-Rapor';

/* Tagline resmi produk. e-Rapor dipakai banyak sekolah, jadi nama produk TIDAK PERNAH memuat
   nama sekolah mana pun. Nama sekolah adalah identitas dinamis dari Setup Awal. */
export const APP_TAGLINE='Solusi Digital Pengelolaan Rapor Sekolah';

/* Panel pemilik sistem memakai nama dan ikon sendiri supaya pintasannya di layar utama tidak
   tertukar dengan aplikasi sekolah. Ini hanya penamaan; keamanannya tetap sama. */
export const OWNER_APP_NAME='Owner e-Rapor';
export const DEVELOPER_NAME='FAHMI DJAWAS, S.Pd.';
export const DEVELOPER_ROLE='Developer & UI/UX Designer e-Rapor';
export const DEVELOPER_CREDIT_LEAD='Dirancang & Dikembangkan oleh';
export const COPYRIGHT='© 2026 — Semua Hak Dilindungi';
export const DEVELOPER_PHOTO='./assets/fahmi-djawas.jpg';
export const FOOTER_CREDIT='Dashboard didesain oleh FAHMI DJAWAS. © 2026 Semua hak dilindungi';

/* Nama berkas backup lama yang pernah dipakai sebelum produk digenerickan. Dipertahankan
   hanya untuk memvalidasi berkas backup lama supaya tetap dapat direstore. */
export const LEGACY_APP_NAMES=Object.freeze(['e-Rapor SDN Satria Jaya 01']);
export const ACCEPTED_BACKUP_APP_NAMES=Object.freeze([APP_NAME,...LEGACY_APP_NAMES]);

/* ------------------------------------------------------- Kontak resmi dan pembelian lisensi

   Nomor WhatsApp resmi hanya ditulis SATU KALI di sini. Seluruh tombol beli lisensi dan hubungi
   pengembang menyusun tautannya dari nilai ini, sehingga penggantian nomor di kemudian hari
   cukup dilakukan pada satu baris. */

export const CONTACT_WHATSAPP='6287776015915';
export const CONTACT_WHATSAPP_DISPLAY='0877-7601-5915';

export const PURCHASE_MESSAGE='Halo, saya ingin membeli lisensi e-Rapor untuk sekolah saya.';
export const SUPPORT_MESSAGE='Halo Pak Fahmi, saya ingin bertanya mengenai aplikasi e-Rapor.';

export function whatsappUrl(message='',phone=CONTACT_WHATSAPP){
  const teks=String(message||'').trim();
  return `https://wa.me/${phone}${teks?`?text=${encodeURIComponent(teks)}`:''}`;
}

export const PURCHASE_URL=whatsappUrl(PURCHASE_MESSAGE);
export const SUPPORT_URL=whatsappUrl(SUPPORT_MESSAGE);

/* Kalimat promosi dan daftar keunggulan. Hanya memuat kemampuan yang benar-benar sudah ada di
   aplikasi; tidak ada satu pun klaim fitur yang belum tersedia. */
export const PROMO_HEADLINE='Dapatkan e-Rapor untuk Sekolah Anda';
export const PROMO_PARAGRAPHS=Object.freeze([
  'Kelola administrasi dan penilaian sekolah dengan lebih praktis melalui e-Rapor.',
  'e-Rapor dirancang untuk membantu sekolah dan guru mengelola data siswa, penilaian, capaian pembelajaran, kegiatan Intrakurikuler, Kokurikuler, Ekstrakurikuler, hingga penyusunan rapor secara lebih mudah, rapi, dan terintegrasi.',
  'Setiap sekolah dapat menyesuaikan identitas sekolah, data akademik, akun Admin dan Guru, serta berbagai pengaturan sesuai kebutuhan sekolah.',
  'Dapatkan lisensi resmi e-Rapor untuk sekolah Anda.',
]);
export const PROMO_HIGHLIGHTS=Object.freeze([
  'Identitas sekolah dapat disesuaikan',
  'Pengelolaan Admin & Guru',
  'Data siswa dan administrasi kelas',
  'Penilaian dan deskripsi rapor otomatis',
  'TP semua mata pelajaran',
  'Intrakurikuler',
  'Kokurikuler',
  'Ekstrakurikuler',
  'Cetak Rapor & Leger',
  'Backup & Restore data',
  'Sistem lisensi resmi',
  'Pembaruan aplikasi resmi',
  'Offline-first',
  'Data akademik tetap tersimpan lokal di perangkat',
]);
