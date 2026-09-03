/* Aturan formulir pemesanan lisensi, tanpa satu pun sentuhan DOM.

   Dipisahkan dari beli.js supaya validasi dan penyusunan pesan dapat diuji apa adanya di Node,
   bukan hanya lewat browser. Modul ini murni: tidak menyimpan apa pun, tidak menghubungi
   jaringan, dan tidak mengenal Owner API maupun lisensi. */

export const REQUIRED_FIELDS=Object.freeze(['schoolName','npsn','contactName','whatsapp','city','province']);

const POLA_EMAIL=/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

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

export function validateOrder(input){
  const nilai={
    schoolName:rapikan(input?.schoolName,120),
    npsn:String(input?.npsn??'').replace(/\s+/g,''),
    contactName:rapikan(input?.contactName,120),
    whatsapp:String(input?.whatsapp??'').trim(),
    city:rapikan(input?.city,80),
    province:rapikan(input?.province,80),
    email:rapikan(input?.email,120),
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

/* Pesan hanya memuat keterangan pembelian sekolah. Tidak ada satu pun data siswa, nilai,
   absensi, akun, License Key, Activation Token, maupun Installation ID di dalamnya. */
export function buildOrderMessage(input){
  const {values}=validateOrder(input);
  const isi=teks=>teks||'-';
  return [
    'Halo Pak Fahmi,','',
    'Saya ingin melakukan pemesanan lisensi e-Rapor.','',
    'Data Sekolah:','',
    'Nama Sekolah:',isi(values.schoolName),'',
    'NPSN:',isi(values.npsn),'',
    'Nama Pemesan/Penanggung Jawab:',isi(values.contactName),'',
    'WhatsApp:',isi(values.whatsapp),'',
    'Email:',isi(values.email),'',
    'Kabupaten/Kota:',isi(values.city),'',
    'Provinsi:',isi(values.province),'',
    'Mohon informasi selanjutnya mengenai pembelian dan aktivasi lisensi e-Rapor.','',
    'Terima kasih.',
  ].join('\n');
}
