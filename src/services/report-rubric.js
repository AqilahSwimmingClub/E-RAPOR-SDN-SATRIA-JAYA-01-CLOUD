/* RUBRIK KATEGORI DESKRIPSI RAPOR.

   Kategori ketercapaian pada Deskripsi Rapor ditentukan oleh RENTANG NILAI yang ditetapkan
   guru, bukan oleh rumus turunan KKTP dan bukan oleh angka yang ditanam di dalam kode.

   Sebelumnya kategori dihitung sebagai jarak terhadap KKTP - "KKTP + 15" untuk Sangat Baik,
   "KKTP - 10" untuk Cukup. Selisih itu buatan aplikasi: tidak ada aturan yang menetapkannya,
   dan guru tidak dapat mengubahnya. Sekarang rentangnya menjadi PENGATURAN.

   Empat kategori, urut dari yang tertinggi. Urutan ini tetap: ia adalah bahasa rapor, bukan
   pengaturan. Yang dapat diubah guru adalah BATAS setiap kategori.

   KKTP TIDAK TERSENTUH. Ia tetap menentukan status ketuntasan (TUNTAS / BELUM TUNTAS) seperti
   sebelumnya, dan tetap dapat berbeda dari batas rubrik. Keduanya menjawab pertanyaan yang
   berbeda: KKTP menjawab "sudah tuntas atau belum", rubrik menjawab "seberapa jauh capaiannya
   dinyatakan pada kalimat rapor". */

export const REPORT_CATEGORIES=Object.freeze(['SANGAT BAIK','BAIK','CUKUP','PERLU BIMBINGAN']);

/* DEFAULT AWAL APLIKASI - bukan rentang resmi pemerintah, dan bukan klaim apa pun tentang
   ketentuan nasional. Ia hanya titik mulai yang wajar supaya guru tidak menghadapi kolom
   kosong, dan guru dapat menggantinya seluruhnya. */
export const DEFAULT_REPORT_RUBRIC=Object.freeze([
  Object.freeze({category:'SANGAT BAIK',min:90,max:100}),
  Object.freeze({category:'BAIK',min:80,max:89}),
  Object.freeze({category:'CUKUP',min:70,max:79}),
  Object.freeze({category:'PERLU BIMBINGAN',min:0,max:69}),
]);

export const NILAI_MINIMUM=0;
export const NILAI_MAKSIMUM=100;

function angkaBatas(nilai,label){
  if(nilai===''||nilai===null||nilai===undefined)throw new Error(`${label} wajib diisi.`);
  const angka=Number(nilai);
  if(!Number.isFinite(angka))throw new Error(`${label} harus berupa angka.`);
  if(!Number.isInteger(angka))throw new Error(`${label} harus berupa bilangan bulat.`);
  if(angka<NILAI_MINIMUM||angka>NILAI_MAKSIMUM)
    throw new Error(`${label} harus berada pada rentang ${NILAI_MINIMUM} sampai ${NILAI_MAKSIMUM}.`);
  return angka;
}

/* Memeriksa rubrik dan mengembalikannya dalam bentuk baku: urut dari kategori tertinggi.

   Yang ditolak, dan alasannya:

     - kategori tidak lengkap atau berulang     rapor punya empat kategori, tidak kurang,
                                                tidak lebih, dan tidak ada yang ganda;
     - batas di luar 0-100                      Nilai Akhir tidak pernah berada di luar itu;
     - batas bawah lebih besar dari batas atas   rentang yang tidak mungkin dimasuki nilai apa pun;
     - rentang bertumpang tindih                satu nilai akan masuk dua kategori sekaligus;
     - ada celah nilai                          satu nilai tidak akan masuk kategori mana pun.

   Hasilnya: SETIAP nilai 0 sampai 100 masuk tepat satu kategori. Itulah yang membuat kalimat
   rapor selalu dapat disusun tanpa menebak. */
export function normalizeReportRubric(input){
  const daftar=Array.isArray(input)?input:null;
  if(!daftar||daftar.length!==REPORT_CATEGORIES.length)
    throw new Error(`Rubrik wajib memuat ${REPORT_CATEGORIES.length} kategori: ${REPORT_CATEGORIES.join(', ')}.`);
  const terbaca=daftar.map(item=>{
    const kategori=String(item?.category??item?.kategori??'').trim().toUpperCase();
    if(!REPORT_CATEGORIES.includes(kategori))throw new Error(`Kategori rubrik "${kategori||'(kosong)'}" tidak dikenal.`);
    return {category:kategori,min:angkaBatas(item?.min,`Batas bawah ${kategori}`),
      max:angkaBatas(item?.max,`Batas atas ${kategori}`)};
  });
  const dikenal=new Set(terbaca.map(item=>item.category));
  if(dikenal.size!==REPORT_CATEGORIES.length)throw new Error('Setiap kategori rubrik hanya boleh ditulis satu kali.');
  for(const item of terbaca)
    if(item.min>item.max)
      throw new Error(`Batas bawah ${item.category} (${item.min}) tidak boleh melebihi batas atasnya (${item.max}).`);
  /* Diurutkan menaik untuk memeriksa kesinambungannya, lalu disimpan menurun. */
  const naik=[...terbaca].sort((a,b)=>a.min-b.min);
  if(naik[0].min!==NILAI_MINIMUM)
    throw new Error(`Kategori terendah wajib dimulai dari ${NILAI_MINIMUM}. Nilai di bawah ${naik[0].min} tidak masuk kategori mana pun.`);
  if(naik.at(-1).max!==NILAI_MAKSIMUM)
    throw new Error(`Kategori tertinggi wajib berakhir pada ${NILAI_MAKSIMUM}. Nilai di atas ${naik.at(-1).max} tidak masuk kategori mana pun.`);
  for(let index=1;index<naik.length;index+=1){
    const sebelum=naik[index-1],sekarang=naik[index];
    if(sekarang.min<=sebelum.max)
      throw new Error(`Rentang ${sekarang.category} (${sekarang.min}-${sekarang.max}) bertumpang tindih dengan ${sebelum.category} (${sebelum.min}-${sebelum.max}).`);
    if(sekarang.min>sebelum.max+1)
      throw new Error(`Ada celah nilai antara ${sebelum.max} dan ${sekarang.min}. Nilai di antaranya tidak masuk kategori mana pun.`);
  }
  const urutan=new Map(REPORT_CATEGORIES.map((kategori,index)=>[kategori,index]));
  return terbaca.sort((a,b)=>urutan.get(a.category)-urutan.get(b.category))
    .map(item=>({category:item.category,min:item.min,max:item.max}));
}

/* Pembacaan yang tidak pernah melempar: dipakai saat MEMBACA pengaturan lama.

   Catatan pengguna yang dibuat sebelum rubrik ada tidak punya kolom ini. Ia tidak diperbaiki,
   tidak ditulis ulang, dan tidak dihapus - ia hanya DIBACA sebagai default sampai guru
   menyimpan rubriknya sendiri. */
export function readReportRubric(input){
  try{return normalizeReportRubric(input);}
  catch{return DEFAULT_REPORT_RUBRIC.map(item=>({...item}));}
}

export function defaultReportRubric(){return DEFAULT_REPORT_RUBRIC.map(item=>({...item}));}

/* Kategori satu Nilai Akhir menurut rubrik yang berlaku bagi mata pelajaran itu.

   Penggolongannya memakai BATAS BAWAH, ditelusuri dari kategori tertinggi. Nilai Akhir aplikasi
   selalu bilangan bulat hasil pembulatan, sehingga batas atas dan batas bawah bertemu persis;
   memakai batas bawah membuat nilai pecahan yang mungkin datang dari pemanggil lain pun tetap
   jatuh pada tepat satu kategori, bukan ke dalam celah. */
export function categoryForScore(finalScore,rubric){
  if(finalScore===null||finalScore===undefined)return null;
  const nilai=Number(finalScore);
  if(!Number.isFinite(nilai))return null;
  const daftar=readReportRubric(rubric);
  const menaik=[...daftar].sort((a,b)=>b.min-a.min);
  for(const item of menaik)if(nilai>=item.min)return item.category;
  return menaik.at(-1)?.category??null;
}

/* Bentuk rentang untuk ditampilkan, mis. "90 - 100" dan "0 - 69". */
export function rubricRangeLabel(item){
  return `${item.min} - ${item.max}`;
}

/* ================================================== SINKRONISASI RUBRIK DENGAN KKTP

   KKTP dan rubrik menjawab dua pertanyaan yang berbeda, tetapi keduanya membaca angka yang
   sama - Nilai Akhir - dan karena itu tidak boleh saling bertentangan:

     KKTP    "sudah tuntas atau belum?"
     RUBRIK  "bagaimana capaian itu dinyatakan pada kalimat rapor?"

   Pertentangannya nyata dan mudah terjadi. Guru menaikkan KKTP dari 70 menjadi 80 tanpa
   menyentuh rubrik; sejak itu murid bernilai 75 dinyatakan BELUM TUNTAS oleh KKTP, sementara
   rapornya berbunyi "menunjukkan capaian yang baik". Dua pernyataan itu berdiri pada dokumen
   yang sama dan saling meniadakan.

   ATURANNYA SATU KALIMAT: batas antara PERLU BIMBINGAN dan CUKUP adalah KKTP itu sendiri.
   Nilai yang sudah mencapai KKTP tidak pernah dinyatakan "perlu meningkatkan pemahaman", dan
   nilai yang belum mencapai KKTP tidak pernah dinyatakan "cukup", "baik", atau "sangat baik".

   INI PERINGATAN, BUKAN PENOLAKAN. Rubrik yang belum selaras tetap dapat disimpan - sekolah
   berhak menetapkan ambangnya sendiri, dan menolak simpan akan mengunci guru di tengah
   penyuntingan. Yang aplikasi lakukan adalah MENGATAKANNYA dengan jelas dan menyediakan
   penyesuaian sekali tekan yang tetap harus dikonfirmasi guru. Tidak ada satu pun angka yang
   berubah diam-diam. */

export function rubricConsistency(rubric,kktp){
  const daftar=readReportRubric(rubric);
  const batas=Number(kktp);
  const hasil={consistent:true,kktp:Number.isFinite(batas)?batas:null,issues:[],message:''};
  if(!Number.isFinite(batas))return hasil;
  const bimbingan=daftar.find(item=>item.category==='PERLU BIMBINGAN');
  const cukup=daftar.find(item=>item.category==='CUKUP');
  if(!bimbingan||!cukup)return hasil;
  if(cukup.min===batas)return hasil;
  hasil.consistent=false;
  if(bimbingan.max>=batas)
    hasil.issues.push(`Nilai ${batas} sampai ${bimbingan.max} sudah mencapai KKTP ${batas}, tetapi rubrik menyatakannya PERLU BIMBINGAN.`);
  if(cukup.min<batas&&cukup.min>bimbingan.max)
    hasil.issues.push(`Nilai ${cukup.min} sampai ${batas-1} belum mencapai KKTP ${batas}, tetapi rubrik menyatakannya CUKUP atau lebih.`);
  if(!hasil.issues.length)
    hasil.issues.push(`Batas bawah CUKUP (${cukup.min}) tidak sama dengan KKTP ${batas}.`);
  hasil.message=`Rubrik belum selaras dengan KKTP ${batas}. ${hasil.issues.join(' ')}`;
  return hasil;
}

/* Usulan rubrik yang selaras dengan KKTP. Batas bawah CUKUP disamakan dengan KKTP, dan batas
   BAIK serta SANGAT BAIK dipertahankan selama masih berurutan di atasnya; bila tidak lagi
   muat, ruang di atas KKTP dibagi rata menjadi tiga.

   Mengembalikan null bila penyelarasan memang tidak mungkin - KKTP 0 tidak menyisakan satu
   nilai pun untuk PERLU BIMBINGAN, dan KKTP yang terlalu tinggi tidak menyisakan ruang untuk
   tiga kategori di atasnya. Lebih baik mengatakannya daripada mengusulkan rubrik yang salah. */
export function suggestReportRubricForKktp(rubric,kktp){
  const batas=Number(kktp);
  if(!Number.isFinite(batas)||!Number.isInteger(batas))return null;
  if(batas<1||batas>NILAI_MAKSIMUM-2)return null;
  const daftar=readReportRubric(rubric);
  const minLama=Object.fromEntries(daftar.map(item=>[item.category,item.min]));
  let minBaik=minLama.BAIK,minSangat=minLama['SANGAT BAIK'];
  const muat=Number.isInteger(minBaik)&&Number.isInteger(minSangat)
    &&minBaik>batas&&minSangat>minBaik&&minSangat<=NILAI_MAKSIMUM;
  if(!muat){
    const lebar=Math.floor((NILAI_MAKSIMUM+1-batas)/3);
    minBaik=batas+lebar;
    minSangat=batas+lebar*2;
  }
  const usul=[
    {category:'SANGAT BAIK',min:minSangat,max:NILAI_MAKSIMUM},
    {category:'BAIK',min:minBaik,max:minSangat-1},
    {category:'CUKUP',min:batas,max:minBaik-1},
    {category:'PERLU BIMBINGAN',min:NILAI_MINIMUM,max:batas-1},
  ];
  try{return normalizeReportRubric(usul);}catch{return null;}
}
