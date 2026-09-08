export const APP_VERSION='1.3.8';
export const VERSION_CODE=30;
export const APP_SCHEMA_VERSION=5;
/* Penanda build sementara. Ditampilkan di halaman Pengaturan supaya terlihat langsung apakah
   aplikasi yang sedang dibuka benar-benar hasil build terbaru, bukan APK/EXE lama. */
export const BUILD_TAG='1.3.8-TEMPLATE-NOMOR-STATUS';
/* Rilis APK sebelumnya. Dipakai test untuk memastikan versionCode selalu naik sehingga APK
   baru dapat dipasang menimpa APK lama. Perbarui bersamaan saat menaikkan versi di atas. */
export const PREVIOUS_RELEASE=Object.freeze({version:'1.3.7',versionCode:29});
