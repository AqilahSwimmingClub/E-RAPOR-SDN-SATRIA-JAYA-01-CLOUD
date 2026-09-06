/* METODE PEMBAYARAN RESMI. PERMANEN.

   Berkas ini adalah satu-satunya sumber data pembayaran. Nilainya diberikan langsung oleh
   pemilik aplikasi dan ditulis apa adanya. TIDAK ADA satu pun nomor rekening, nomor GoPay,
   atau kode QRIS yang boleh dikarang, ditebak, atau diisi dengan contoh.

   NOMINAL TIDAK DITULIS DI SINI. Harga lisensi tidak pernah diberikan sebagai angka tetap,
   jadi halaman pembelian TIDAK menampilkan angka apa pun: nominal dikonfirmasi Developer
   lewat WhatsApp setelah pesanan masuk. Menuliskan angka karangan di halaman pembayaran akan
   menjadi kesalahan yang menyesatkan pembeli, bukan sekadar kurang lengkap.

   Berkas gambar QRIS adalah berkas asli milik pemilik aplikasi. Ia TIDAK digambar ulang,
   TIDAK diubah warnanya, dan TIDAK dibuatkan penggantinya. */

export const PAYMENT_ACCOUNT_NAME='FAHMI DJAWAS';

export const PAYMENT_METHODS=Object.freeze([
  Object.freeze({
    id:'qris',
    label:'QRIS',
    kind:'qris',
    subtitle:'Pindai dari aplikasi bank atau dompet digital mana pun',
    accountName:PAYMENT_ACCOUNT_NAME,
    /* Alamat relatif terhadap halaman /beli/, tempat berkasnya benar-benar berada. */
    image:'./assets/qris-fahmi-djawas.jpg',
    imageAlt:'Kode QRIS pembayaran atas nama FAHMI DJAWAS',
  }),
  Object.freeze({
    id:'gopay',
    label:'GoPay',
    kind:'nomor',
    subtitle:'Kirim ke nomor GoPay berikut',
    accountName:PAYMENT_ACCOUNT_NAME,
    accountNumber:'087776015915',
  }),
  Object.freeze({
    id:'mandiri',
    label:'Bank Mandiri',
    kind:'rekening',
    subtitle:'Transfer ke rekening berikut',
    accountName:PAYMENT_ACCOUNT_NAME,
    accountNumber:'1560024948665',
  }),
]);

export const PAYMENT_METHOD_IDS=Object.freeze(PAYMENT_METHODS.map(item=>item.id));

/* Kalimat ini menggantikan angka. Ia jujur: nominal memang dikonfirmasi lewat WhatsApp. */
export const PAYMENT_AMOUNT_NOTE='Nominal pembayaran dikonfirmasi langsung oleh Developer melalui WhatsApp setelah pesanan Anda masuk.';

export const PAYMENT_STEPS=Object.freeze([
  'Isi formulir pemesanan sampai lengkap, lalu tekan Kirim Pesanan. Pesanan Anda tersimpan lebih dulu di server dan Anda menerima Order ID.',
  'Order ID itulah identitas transaksi Anda. Simpan dan sebutkan pada setiap komunikasi berikutnya.',
  'Developer mengonfirmasi nominal dan metode pembayaran melalui WhatsApp.',
  'Lakukan pembayaran memakai salah satu metode di atas, lalu kirimkan bukti pembayarannya.',
  'Setelah pembayaran diverifikasi, License Key resmi diterbitkan dan dikirimkan kepada Anda.',
]);

export function findPaymentMethod(id){
  return PAYMENT_METHODS.find(item=>item.id===String(id||'').toLowerCase())||null;
}

/* --------------------------------------------------------------- Cakupan satu lisensi

   Hanya memuat aturan yang MEMANG sudah berjalan di kode: satu lisensi memberi satu slot
   Android dan satu slot Windows (server/src/licenses.js, DEVICE_SLOTS), dan reset slot hanya
   dapat dilakukan Pemilik. Tidak ada satu pun janji fitur yang belum ada. */
export const LICENSE_SCOPE=Object.freeze([
  'Satu lisensi berlaku untuk satu sekolah.',
  'Satu lisensi memberi dua slot perangkat sekaligus: satu Android dan satu Windows.',
  'Aktivasi Android dan Windows berdiri sendiri. Reset perangkat Android tidak menghapus aktivasi Windows, dan sebaliknya.',
  'Pemindahan lisensi ke perangkat lain dilakukan lewat reset slot oleh Developer.',
  'Data akademik sekolah tersimpan di perangkat sekolah sendiri, bukan di server lisensi.',
  'Aplikasi tetap dapat dipakai luring; sambungan internet hanya diperlukan saat aktivasi dan pemeriksaan berkala.',
]);
