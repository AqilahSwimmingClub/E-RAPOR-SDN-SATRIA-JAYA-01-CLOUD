export const APP_VERSION='1.2.8';
export const VERSION_CODE=20;
export const APP_SCHEMA_VERSION=5;
/* Penanda build sementara. Ditampilkan di halaman Pengaturan supaya terlihat langsung apakah
   aplikasi yang sedang dibuka benar-benar hasil build terbaru, bukan APK/EXE lama. */
export const BUILD_TAG='1.2.8-BRANDING-P5-TANGGAL';
/* Rilis APK sebelumnya. Dipakai test untuk memastikan versionCode selalu naik sehingga APK
   baru dapat dipasang menimpa APK lama. Perbarui bersamaan saat menaikkan versi di atas. */
export const PREVIOUS_RELEASE=Object.freeze({version:'1.2.7',versionCode:19});
