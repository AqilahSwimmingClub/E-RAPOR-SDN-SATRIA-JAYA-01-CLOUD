/* KONTROL SERVER LAN DARI HALAMAN ADMIN.

   Seluruh permintaan di sini dilayani launcher HANYA bila datang dari komputer server itu
   sendiri; server memeriksanya dari alamat soket, bukan dari header yang dapat dipalsukan.
   Karena itu guru yang sudah masuk lewat LAN tidak dapat memindahkan server ke jaringan lain,
   mengganti alamatnya, atau mematikannya dari jauh - bahkan bila ia memanggil endpoint ini
   secara langsung.

   Permintaannya synchronous mengikuti pola penyimpanan aplikasi: menyalakan LAN adalah satu
   tindakan tunggal yang hasilnya langsung ditampilkan, dan Admin perlu tahu seketika apakah
   berhasil atau gagal beserta alasannya. */

const PREFIX='/__erapor/lan-control/';

let transportUji=null;
export function pasangTransportLanAdmin(impl){transportUji=impl;}

function metaKonten(nama){
  try{return globalThis.document?.querySelector?.(`meta[name="${nama}"]`)?.content||'';}
  catch{return '';}
}

/* Halaman hanya menampilkan pengaturan LAN bila ia memang berjalan di komputer server: di
   sanalah token peluncuran disuntikkan. Klien LAN dan browser biasa tidak menerimanya. */
export function dukunganLanTersedia(){
  if(transportUji)return true;
  return metaKonten('erapor-desktop-db')==='server'&&Boolean(metaKonten('erapor-desktop-bridge-token'));
}

function panggil(method,aksi,muatan){
  if(transportUji)return transportUji({method,aksi,muatan});
  const permintaan=new globalThis.XMLHttpRequest();
  permintaan.open(method,`${PREFIX}${aksi}`,false);
  permintaan.setRequestHeader('Content-Type','application/json');
  permintaan.setRequestHeader('x-erapor-bridge-token',metaKonten('erapor-desktop-bridge-token'));
  permintaan.send(muatan===undefined?null:JSON.stringify(muatan));
  let isi=null;
  try{isi=permintaan.responseText?JSON.parse(permintaan.responseText):null;}catch{isi=null;}
  return {status:permintaan.status,isi};
}

function pastikan(jawaban,bawaan){
  if(jawaban.status!==200)throw new Error(jawaban.isi?.error||bawaan);
  return jawaban.isi;
}

export function bacaStatusLan(){
  return pastikan(panggil('GET','status'),'Status Server LAN tidak dapat dibaca.');
}
export function nyalakanLan(alamat){
  return pastikan(panggil('POST','enable',{alamat:alamat||null}),'Server LAN gagal dinyalakan.');
}
export function matikanLan(){
  return pastikan(panggil('POST','disable',{}),'Server LAN gagal dinonaktifkan.');
}

/* Keputusan lisensi komputer server didorong ke launcher supaya server dapat menegakkannya
   sendiri terhadap klien LAN. Yang dikirim hanya HASIL keputusannya - bukan activation token
   dan bukan Installation ID, keduanya tidak pernah meninggalkan komputer ini. */
export function kirimStatusLisensiKeServer(state){
  if(!dukunganLanTersedia())return false;
  /* HANYA KEADAAN YANG BENAR-BENAR DIKETAHUI YANG DIDORONG.

     Catatan lisensi tinggal di penyimpanan browser. Kalau Admin membuka e-Rapor memakai
     browser LAIN di komputer server - Edge padahal biasanya Chrome - profil browser itu belum
     memuat catatan lisensi apa pun, sehingga keadaannya terbaca UNLICENSED. Mendorong
     pembacaan itu akan MEMATIKAN Server LAN untuk seluruh guru, padahal lisensi sekolahnya
     sah dan tidak terjadi apa-apa.

     "Tidak ada catatan di browser ini" berbeda artinya dengan "lisensi tidak berlaku". Yang
     pertama tidak menceritakan apa pun tentang lisensi sekolah, jadi server dibiarkan memakai
     keadaan terakhir yang memang diketahuinya. Pencabutan tetap tersampaikan: lisensi yang
     dicabut SELALU punya catatan, hanya statusnya yang berubah. */
  if(!state?.record)return false;
  try{
    panggil('POST','license',{
      canUseApp:Boolean(state?.canUseApp),
      state:String(state?.state||''),
      message:String(state?.message||''),
      graceExpiresAt:state?.offline?.expiresAt||null,
    });
    return true;
  }catch{return false;}
}
