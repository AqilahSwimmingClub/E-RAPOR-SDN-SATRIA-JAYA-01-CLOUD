import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { capaianPembelajaran, CP_SUBJECTS } from '../src/data/curriculum-cp.js';
import { defaultCpButir, JENIS_IDS } from '../src/data/cp-butir-defaults.js';

/* AUDIT KETERLACAKAN BUTIR CP KE NASKAH CP RESMI.

   Butir CP hanya sah bila substansinya dapat ditelusuri ke naskah CP resmi elemen induknya.
   Suite ini menjalankan penelusuran itu untuk SETIAP butir pada SETIAP mata pelajaran dan fase,
   sehingga butir yang kelak ditambahkan tanpa dasar akan langsung ketahuan - bukan menunggu
   audit manual berikutnya.

   CARA MENGUKURNYA. Kata-kata isi butir dan kata-kata naskah dibatangkan dengan fungsi yang
   sama, lalu dihitung berapa bagian kata isi butir yang benar-benar muncul pada naskah. Kata
   penghubung dan KATA KERJA PERAGAAN milik aplikasi - "menjelaskan", "menyebutkan",
   "mempraktikkan" - tidak dihitung: yang diaudit adalah substansi kompetensinya, bukan pilihan
   kata kerja aplikasi. Ambangnya 0,6 terhadap naskah elemen induk, atau terhadap naskah fase
   bila judul elemen pada naskah ditulis berbeda dari nama elemen pada aplikasi. */

const CONTOH={A:'1A',B:'3A',C:'5A'};

/* Mata pelajaran yang SENGAJA tidak memiliki Butir CP bawaan: naskah CP resminya memang tidak
   ada, dan mengarang butir untuknya akan melanggar aturan dasar dataset ini. */
const TANPA_NASKAH_RESMI=new Set(['seni']);

const STOP=new Set(('dan atau yang dengan pada di ke dari untuk serta dalam sebagai secara itu ini para murid peserta didik mampu dapat memahami menjelaskan menggunakan melakukan menunjukkan sederhana beserta berbagai suatu antara terhadap oleh adalah akan bagi juga lain lainnya hal cara langkah bentuk jenis macam hasil tentang berkaitan sehari-hari sekitar sekitarnya kehidupan menyebutkan menceritakan membedakan melafalkan mengidentifikasi menentukan menyajikan mempraktikkan membiasakan menerapkan mengenali membuat menulis membaca ketentuan makna wujud kepada')
  .split(/\s+/));

const norm=teks=>String(teks||'').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

/* Pembatangan sederhana. Kedua sisi memakai fungsi yang sama, sehingga pemenggalan imbuhan yang
   tidak sempurna membatalkan dirinya sendiri. */
function batang(kata){
  let hasil=kata.replace(/^(memper|member|menper)/,'')
    .replace(/^(meng|meny|mem|men|pen|peng|peny|pem|ber|ter|per|di|ke|se)/,'')
    .replace(/(kan|nya|an|i)$/,'');
  return hasil.length>=4?hasil:kata;
}
const kunciDari=teks=>[...new Set(norm(teks).split(' ')
  .filter(kata=>kata.length>=4&&!STOP.has(kata)).map(batang))];
const batangSet=teks=>new Set(norm(teks).split(' ').filter(kata=>kata.length>=3).map(batang));

/* Potongan naskah milik satu elemen. Judul elemen pada naskah resmi bervariasi bentuknya, jadi
   penomoran dan kata "Elemen"/"Subelemen" diratakan lebih dulu, dan hanya baris pendek yang
   boleh dianggap judul. */
function bagianElemen(naskah,elemen,semuaElemen){
  if(!naskah)return null;
  const baris=naskah.split('\n');
  const judul=teks=>norm(teks).replace(/^(\d+\s+)+/,'').replace(/^(sub)?elemen\s+/,'').trim();
  const cocok=(teks,nama)=>{
    const isi=judul(teks);
    return Boolean(isi)&&isi.length<=70&&(isi===nama||isi.startsWith(`${nama} `));
  };
  const indeks=semuaElemen.map(item=>{
    const nama=norm(item.name),lokal=norm(item.nameLokal||'');
    return {id:item.id,i:baris.findIndex(teks=>cocok(teks,nama)||(lokal&&cocok(teks,lokal)))};
  });
  const diri=indeks.find(item=>item.id===elemen.id);
  if(!diri||diri.i<0)return naskah;
  const berikut=indeks.map(item=>item.i).filter(i=>i>diri.i).sort((a,b)=>a-b)[0]??baris.length;
  return baris.slice(diri.i,berikut).join('\n');
}

function auditButir(){
  const hasil=[];
  for(const subjectId of CP_SUBJECTS)
    for(const phase of ['A','B','C']){
      const cp=capaianPembelajaran(CONTOH[phase],subjectId);
      if(!cp?.available)continue;
      const butir=defaultCpButir(subjectId,phase);
      const naskahFase=batangSet(cp.naskah||'');
      for(const item of butir){
        const elemen=cp.elements.find(el=>el.id===item.elementId)||null;
        const sumber=batangSet(bagianElemen(cp.naskah,elemen||{},cp.elements)||'');
        const kunci=[...new Set([...kunciDari(item.name),...kunciDari(item.teori),...kunciDari(item.praktik)])];
        const rasio=kunci.length?kunci.filter(kata=>sumber.has(kata)).length/kunci.length:0;
        const rasioFase=kunci.length?kunci.filter(kata=>naskahFase.has(kata)).length/kunci.length:0;
        hasil.push({subjectId,phase,item,elemen,adaNaskah:Boolean(cp.naskah),
          rasio,rasioFase,terlacak:Math.max(rasio,rasioFase),
          hilang:kunci.filter(kata=>!sumber.has(kata)&&!naskahFase.has(kata))});
      }
    }
  return hasil;
}

test('A1. Setiap Butir CP dapat ditelusuri ke naskah CP resmi elemen induknya',()=>{
  const audit=auditButir();
  assert.ok(audit.length>=250,`butir yang diaudit: ${audit.length}`);
  const gagal=audit.filter(row=>!row.elemen||!row.adaNaskah||row.terlacak<0.6);
  const rincian=gagal.slice(0,10)
    .map(row=>`${row.subjectId}/${row.phase} [${row.elemen?.name}] ${row.item.name} = ${row.terlacak.toFixed(2)} (hilang: ${row.hilang.join(', ')})`)
    .join('\n  ');
  assert.equal(gagal.length,0,`Butir CP yang tidak terlacak ke naskah CP induk:\n  ${rincian}`);
});

test('A2. Setiap Butir CP menempel pada elemen CP resmi mata pelajaran dan fasenya',()=>{
  for(const row of auditButir()){
    assert.ok(row.elemen,`${row.subjectId}/${row.phase} ${row.item.name}: elemen induk ditemukan`);
    assert.equal(row.item.elementName,row.elemen.name,'nama elemen butir sama dengan elemen CP resmi');
    assert.ok([1,2].includes(row.item.semester),`${row.item.code}: dipetakan ke Semester 1 atau 2`);
    assert.ok(JENIS_IDS.includes(row.item.jenis),`${row.item.code}: jenis penilaian valid`);
    assert.ok(row.item.teori||row.item.praktik,`${row.item.code}: memiliki rumusan substansi`);
  }
});

test('A3. Butir CP tidak pernah ada tanpa naskah CP resmi induknya',()=>{
  for(const subjectId of CP_SUBJECTS)
    for(const phase of ['A','B','C']){
      const cp=capaianPembelajaran(CONTOH[phase],subjectId);
      if(!cp?.available)continue;
      const butir=defaultCpButir(subjectId,phase);
      if(cp.naskah)continue;
      /* Naskah CP-nya tidak ada: butir bawaannya WAJIB kosong. Lebih jujur kosong daripada
         berisi rumusan yang tidak dapat ditelusuri ke dokumen penetapnya. */
      assert.equal(butir.length,0,
        `${subjectId} Fase ${phase} tidak punya naskah CP resmi sehingga tidak boleh punya Butir CP bawaan`);
      assert.ok(TANPA_NASKAH_RESMI.has(subjectId),
        `${subjectId} berada di luar daftar pengecualian yang didokumentasikan`);
    }
});

test('A4. Butir CP bukan katalog TP lama yang berganti nama',()=>{
  const katalogTp=readFileSync(new URL('../src/data/learning-objective-defaults.js',import.meta.url),'utf8');
  let diperiksa=0;
  for(const subjectId of CP_SUBJECTS)
    for(const phase of ['A','B','C']){
      for(const item of defaultCpButir(subjectId,phase)){
        diperiksa+=1;
        /* Tidak satu pun rumusan butir boleh merupakan salinan kalimat TP lama. */
        for(const teks of [item.teori,item.praktik].filter(Boolean))
          assert.equal(katalogTp.includes(teks),false,
            `${item.code}: rumusan "${teks.slice(0,50)}..." bukan salinan katalog TP`);
      }
    }
  assert.ok(diperiksa>=250,`butir yang diperiksa: ${diperiksa}`);
});
