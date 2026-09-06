/* Aturan formulir pemesanan lisensi, tanpa satu pun sentuhan DOM.

   Dipisahkan dari beli.js supaya validasi, penyusunan payload, dan penyusunan pesan dapat
   diuji apa adanya di Node, bukan hanya lewat browser. Modul ini murni: tidak menyimpan apa
   pun, tidak menghubungi jaringan, dan tidak mengenal Owner API maupun lisensi. */

export const REQUIRED_FIELDS=Object.freeze(['schoolName','npsn','contactName','whatsapp','city','province']);

/* Metode pembayaran TIDAK wajib dipilih di formulir: nominalnya baru dikonfirmasi Developer
   sesudah pesanan masuk, jadi memaksanya sekarang hanya akan menahan pesanan yang sah.

   Daftarnya ditulis di sini, bukan diimpor dari src/data/payment-config.js, karena modul ini
   sengaja dijaga bebas dari ketergantungan apa pun: ia satu-satunya bagian halaman pembelian
   yang diuji langsung di Node, dan alamat relatif ke src/ hanya benar setelah dibangun ke
   dist/. Kesamaannya dengan payment-config.js DIJAGA OLEH TEST, bukan oleh niat baik -
   lihat "Pilihan metode di formulir sama persis dengan metode pembayaran resmi". */
export const PAYMENT_CHOICES=Object.freeze(['belum-dipilih','qris','gopay','mandiri']);

const POLA_EMAIL=/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/* Label yang dibaca manusia untuk pesan WhatsApp. Kuncinya sama persis dengan id metode
   pembayaran resmi, sehingga menambah metode baru cukup dilakukan di payment-config.js. */
const LABEL_PEMBAYARAN=Object.freeze({qris:'QRIS',gopay:'GoPay',mandiri:'Bank Mandiri'});

function rapikan(value,batas=200){return String(value??'').replace(/\s+/g,' ').trim().slice(0,batas);}

/* Nomor Indonesia boleh ditulis 08…, 62…, +62…, atau 8…, dengan spasi maupun tanda hubung.
   Seluruhnya dinormalkan menjadi bentuk internasional tanpa tanda plus. */
export function normalizeWhatsapp(value){
  const angka=String(value??'').replace(/[^\d+]/g,'').replace(/(?!^)\+/g,'');
  const bersih=angka.replace(/^\+/,'');
  if(!bersih)return '';
  let hasil=bersih;
  if(hasil.startsWith('0'))hasil=`62${hasil.slice(1)}`;
  else if(hasil.startsWith('8'))hasil=`62${hasil}`;
  if(!/^62\d{8,13}$/.test(hasil))return '';
  return hasil;
}

/* Pilihan yang tidak dikenal - termasuk yang disuntikkan lewat peralatan pengembang -
   dikembalikan menjadi "belum dipilih", bukan diteruskan apa adanya. */
export function normalizePaymentMethod(value){
  const id=String(value??'').trim().toLowerCase();
  return PAYMENT_CHOICES.includes(id)&&id?id:'belum-dipilih';
}

export function validateOrder(input){
  const nilai={
    schoolName:rapikan(input?.schoolName,120),
    npsn:String(input?.npsn??'').replace(/\s+/g,''),
    contactName:rapikan(input?.contactName,120),
    whatsapp:String(input?.whatsapp??'').trim(),
    city:rapikan(input?.city,80),
    province:rapikan(input?.province,80),
    email:rapikan(input?.email,120),
    paymentMethod:normalizePaymentMethod(input?.paymentMethod),
    konfirmasi:input?.konfirmasi===true||input?.konfirmasi==='on',
  };
  const errors={};

  if(!nilai.schoolName)errors.schoolName='Nama sekolah wajib diisi.';
  if(!/^\d{8}$/.test(nilai.npsn))errors.npsn='NPSN wajib 8 digit angka.';
  if(!nilai.contactName)errors.contactName='Nama pemesan wajib diisi.';

  const whatsapp=normalizeWhatsapp(nilai.whatsapp);
  if(!nilai.whatsapp)errors.whatsapp='Nomor WhatsApp wajib diisi.';
  else if(!whatsapp)errors.whatsapp='Nomor WhatsApp tidak dikenali. Contoh: 081234567890.';

  if(!nilai.city)errors.city='Kabupaten/Kota wajib diisi.';
  if(!nilai.province)errors.province='Provinsi wajib diisi.';
  if(nilai.email&&!POLA_EMAIL.test(nilai.email))errors.email='Format email belum benar.';
  if(!nilai.konfirmasi)errors.konfirmasi='Centang pernyataan kebenaran data sebelum memesan.';

  return {valid:Object.keys(errors).length===0,errors,values:{...nilai,whatsapp:whatsapp||nilai.whatsapp}};
}

/* PAYLOAD PESANAN. Inilah yang disimpan ke server LEBIH DULU, sebelum WhatsApp dibuka.

   clientRef adalah penanda satu kali isian formulir. Server memakainya sebagai penjaga kiriman
   ganda: tombol yang tertekan dua kali, atau jaringan yang mengulang permintaan yang sama,
   mengembalikan pesanan yang sama - bukan pesanan kedua.

   Tidak ada satu pun rahasia di dalamnya: tidak ada password, token, secret, database key,
   maupun credential. Hanya keterangan pembelian yang diketikkan pemesan sendiri. */
export function buildOrderPayload(input,clientRef=''){
  const {values}=validateOrder(input);
  return {
    schoolName:values.schoolName,npsn:values.npsn,contactName:values.contactName,
    whatsapp:values.whatsapp,email:values.email,city:values.city,province:values.province,
    paymentMethod:values.paymentMethod,
    clientRef:String(clientRef||'').slice(0,80),
  };
}

/* Penanda satu kali untuk satu isian formulir. Sumber acaknya disuntikkan supaya modul ini
   tetap murni dan dapat diuji tanpa browser. */
export function newClientRef(random=Math.random,now=Date.now){
  const acak=String(random()).slice(2,12);
  return `ref-${now().toString(36)}-${acak}`;
}

/* Pesan hanya memuat keterangan pembelian sekolah. Tidak ada satu pun data siswa, nilai,
   absensi, akun, License Key, Activation Token, maupun Installation ID di dalamnya.

   ORDER ID DISERTAKAN BILA SUDAH ADA. Pesanan selalu tersimpan di server lebih dulu, jadi saat
   pesan ini disusun Order ID-nya sudah terbit dan menjadi identitas transaksi yang dipakai
   kedua pihak. Bila karena satu dan lain hal pesanannya belum tersimpan, barisnya memang tidak
   ditulis - lebih baik tidak ada daripada memuat nomor karangan. */
export function buildOrderMessage(input,{orderCode=''}={}){
  const {values}=validateOrder(input);
  const isi=teks=>teks||'-';
  const kode=String(orderCode||'').trim();
  return [
    'Halo Pak Fahmi,','',
    'Saya ingin melakukan pemesanan lisensi e-Rapor.','',
    ...(kode?['Order ID:',kode,'']:[]),
    'Data Sekolah:','',
    'Nama Sekolah:',isi(values.schoolName),'',
    'NPSN:',isi(values.npsn),'',
    'Nama Pemesan/Penanggung Jawab:',isi(values.contactName),'',
    'WhatsApp:',isi(values.whatsapp),'',
    'Email:',isi(values.email),'',
    'Kabupaten/Kota:',isi(values.city),'',
    'Provinsi:',isi(values.province),'',
    'Metode Pembayaran yang Dipilih:',
    values.paymentMethod==='belum-dipilih'?'Belum dipilih':LABEL_PEMBAYARAN[values.paymentMethod]||values.paymentMethod,'',
    'Mohon informasi selanjutnya mengenai pembelian dan aktivasi lisensi e-Rapor.','',
    'Terima kasih.',
  ].join('\n');
}
