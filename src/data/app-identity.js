/* Identitas produk dan pembuat aplikasi. PERMANEN.

   Berkas ini adalah satu-satunya sumber nama produk dan identitas pengembang. Nilainya
   ditanam di kode dan TIDAK PERNAH dibaca dari database, backup sekolah, atau form mana pun,
   sehingga sekolah pengguna tidak dapat menggantinya — termasuk dengan menyunting berkas
   backup lalu me-restore-nya.

   Identitas sekolah adalah hal yang berbeda dan bersifat dinamis: sumbernya masterData.school
   melalui getSchoolMaster(). Jangan pernah mencampur keduanya di satu tempat penyimpanan. */

export const APP_NAME='e-Rapor';
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
