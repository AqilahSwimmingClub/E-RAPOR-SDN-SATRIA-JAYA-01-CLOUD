export const APP_VERSION='1.3.4';
export const VERSION_CODE=26;
export const APP_SCHEMA_VERSION=5;
/* Penanda build sementara. Ditampilkan di halaman Pengaturan supaya terlihat langsung apakah
   aplikasi yang sedang dibuka benar-benar hasil build terbaru, bukan APK/EXE lama. */
export const BUILD_TAG='1.3.4-TRANSKRIP-SKL-SKKB-TIMES';
/* Rilis APK sebelumnya. Dipakai test untuk memastikan versionCode selalu naik sehingga APK
   baru dapat dipasang menimpa APK lama. Perbarui bersamaan saat menaikkan versi di atas. */
export const PREVIOUS_RELEASE=Object.freeze({version:'1.3.3',versionCode:25});
