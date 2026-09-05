import test from 'node:test';
import assert from 'node:assert/strict';
import { capaianPembelajaran, cpElementById, cpElements, CP_SUBJECTS } from '../src/data/curriculum-cp.js';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { getCpButir, getCpButirScoreSheet, listCpButir,
  listCpButirForSemester } from '../src/services/cp-butir.js';
import { generateReportDescription } from '../src/services/descriptions.js';
import { saveStudentIntracurricularSelection } from '../src/services/intracurricular.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, updateDb } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { defaultCpButir } from '../src/data/cp-butir-defaults.js';

/* NAMA ELEMEN CP HARUS SAMA DENGAN NASKAH RESMI.

   Elemen adalah induk setiap Butir CP. Bila namanya berbeda dari dokumen penetapnya, guru
   membaca satu nama di aplikasi dan nama lain di dokumen - dan penelusuran butir ke naskah
   induknya ikut goyah. Suite ini memastikan setiap nama elemen benar-benar muncul pada naskah
   CP resmi mata pelajaran dan fasenya.

   TIGA HAL YANG BUKAN PERBEDAAN NAMA, dan karena itu dinetralkan lebih dulu:

   1. PEMENGGALAN BARIS PDF. Naskah dikutip apa adanya dari dokumen, sehingga satu nama bisa
      terpotong dua baris - "Undang-Undang Dasar Negara Republik / Indonesia Tahun 1945" - atau
      terpenggal pada tanda hubungnya - "Nilai- / nilai". Baris disambung lebih dulu.
   2. PADANAN INGGRIS. Dokumen Seni Rupa dan Bahasa Inggris menuliskan padanan Inggris di dalam
      kurung - "Mengalami (Experiencing)". Itu anotasi dwibahasa, bukan bagian nama elemennya,
      dan pada beberapa baris bahkan ikut terpotong ("(Thinking and").
   3. HURUF BESAR-KECIL pada tabel yang terpenggal ("Membaca dan / memirsa").

   Yang TIDAK dinetralkan: kata yang benar-benar berbeda. "Al-Qur'an dan Hadis" versus
   "Al-Qur'an Hadis" dan "Alam dan Lingkungan" versus "Alam dan Lingkungan Hidup" adalah
   perbedaan sungguhan, dan keduanya sudah diperbaiki mengikuti naskah. */

const CONTOH={A:'1A',B:'3A',C:'5A'};

function rataNaskah(naskah){
  return String(naskah||'')
    .replace(/[​­]/g,'')
    /* Tanda hubung di ujung baris menyambung satu kata yang terpenggal. */
    .replace(/-\s*\n\s*/g,'-')
    .replace(/\s*\n\s*/g,' ')
    /* "Nilai- nilai" adalah sisa pemenggalan yang sudah terlanjur berspasi pada sumbernya. */
    .replace(/(\w)-\s+([a-z])/g,'$1-$2')
    .replace(/\s+/g,' ')
    .toLowerCase();
}
const rataNama=nama=>String(nama||'').replace(/\s+/g,' ').trim().toLowerCase();

/* Naskah Bahasa Sunda dikutip dari TABEL DUA KOLOM, dan penyalinannya menyelang-nyeling kolom
   nama elemen dengan kolom capaiannya: "Membaca ... dan memirsa ... (Maca jeung Miarsa)".
   Namanya ada, tetapi tidak pernah berurutan. Untuk mapel ini pencocokan dilakukan per kata -
   dinyatakan terbatas di sini, bukan disembunyikan. */
const NASKAH_BERBENTUK_TABEL=new Set(['sunda']);

/* Selain menyelang-nyeling kolom, penyalinan tabel juga memenggal kata di ujung kolom -
   "Mempresentasik" pada satu baris dan "an" pada baris lain. Sebuah kata karena itu dianggap
   ada bila utuh, atau bila awalannya (kehilangan paling banyak tiga huruf terakhir) ada. */
function kataAda(naskah,kata){
  if(naskah.includes(kata))return true;
  if(kata.length<11)return false;
  return naskah.includes(kata.slice(0,kata.length-3));
}
const semuaKataAda=(naskah,nama)=>rataNama(nama).split(/[^a-z0-9]+/)
  .filter(kata=>kata.length>2).every(kata=>kataAda(naskah,kata));

test('N1. Setiap nama elemen CP muncul apa adanya pada naskah CP resmi',()=>{
  let diperiksa=0;
  const beda=[];
  for(const subjectId of CP_SUBJECTS)
    for(const phase of ['A','B','C']){
      const cp=capaianPembelajaran(CONTOH[phase],subjectId);
      if(!cp?.available||!cp.naskah)continue;
      const naskah=rataNaskah(cp.naskah);
      const tabel=NASKAH_BERBENTUK_TABEL.has(subjectId);
      for(const elemen of cp.elements){
        diperiksa+=1;
        const nama=rataNama(elemen.name);
        const lokal=rataNama(elemen.nameLokal);
        if(naskah.includes(nama)||(lokal&&naskah.includes(lokal)))continue;
        if(tabel&&semuaKataAda(naskah,elemen.name)
          &&(!lokal||semuaKataAda(naskah,elemen.nameLokal)))continue;
        beda.push(`${subjectId}/${phase}: "${elemen.name}" tidak ditemukan pada naskah resminya`);
      }
    }
  assert.ok(diperiksa>=110,`elemen yang diperiksa: ${diperiksa}`);
  assert.deepEqual(beda,[],`Nama elemen berbeda dari naskah resmi:\n  ${beda.join('\n  ')}`);
});

test('N2. Nama elemen yang dikoreksi memakai bentuk resminya',()=>{
  /* Perbedaan sungguhan yang ditemukan audit dan sudah diperbaiki. Dikunci di sini supaya tidak
     pernah kembali ke bentuk lama. */
  const wajib={
    agama:'Al-Qur’an Hadis',
    agama_kristen:'Alam dan Lingkungan Hidup',
  };
  for(const [subjectId,nama] of Object.entries(wajib))
    assert.ok(cpElements(subjectId,'C').some(item=>item.name===nama),
      `${subjectId} memakai nama elemen resmi "${nama}"`);
  /* Bentuk lama tidak boleh tersisa. */
  for(const [subjectId,salah] of Object.entries({agama:'Al-Qur’an dan Hadis',
    agama_kristen:'Alam dan Lingkungan'}))
    assert.equal(cpElements(subjectId,'C').some(item=>item.name===salah),false,
      `${subjectId} tidak lagi memakai nama lama "${salah}"`);
  /* Bahasa Inggris memakai tanda hubung biasa seperti naskahnya, bukan en dash. */
  for(const item of cpElements('bing','C'))
    assert.equal(item.name.includes('–'),false,`${item.name} memakai tanda hubung biasa`);
});

test('N3. Menyamakan nama elemen TIDAK mengubah id elemen maupun id Butir CP',()=>{
  /* Inilah pengaman datanya: id elemen dan id butir dipakai sebagai kunci penyimpanan. Bila
     ikut berubah saat nama disamakan, penyesuaian guru dan NILAI MURID yang sudah tersimpan
     akan kehilangan induknya. Id di bawah adalah id yang sudah dipakai sebelum penyamaan nama. */
  const idElemen={
    'agama:al-qur-an-dan-hadis':'Al-Qur’an Hadis',
    'agama_kristen:alam-dan-lingkungan':'Alam dan Lingkungan Hidup',
    'bing:menyimak-berbicara':'Menyimak - Berbicara',
    'bing:membaca-memirsa':'Membaca - Memirsa',
    'bing:menulis-mempresentasikan':'Menulis - Mempresentasikan',
  };
  for(const [id,nama] of Object.entries(idElemen)){
    const subjectId=id.slice(0,id.indexOf(':'));
    const phase=subjectId==='bing'?'C':'C';
    const elemen=cpElements(subjectId,phase).find(item=>item.id===id);
    assert.ok(elemen,`id elemen ${id} tetap ada`);
    assert.equal(elemen.name,nama,`${id} kini bernama resmi`);
  }
  /* Id butir dibangun dari id elemen, jadi ikut tidak berubah. */
  const idButir=[
    ['agama','A','cpb-agama-A-al-qur-an-dan-hadis-1'],
    ['agama_kristen','A','cpb-agama_kristen-A-alam-dan-lingkungan-1'],
    ['bing','B','cpb-bing-B-menyimak-berbicara-1'],
  ];
  for(const [subjectId,phase,id] of idButir)
    assert.ok(defaultCpButir(subjectId,phase).some(item=>item.id===id),
      `id Butir CP ${id} tetap sama setelah nama elemen disamakan`);
});

test('N4. Setiap Butir CP tetap menempel pada elemen CP yang ada',()=>{
  let diperiksa=0;
  for(const subjectId of CP_SUBJECTS)
    for(const phase of ['A','B','C']){
      const elemen=cpElements(subjectId,phase);
      for(const butir of defaultCpButir(subjectId,phase)){
        diperiksa+=1;
        const induk=elemen.find(item=>item.id===butir.elementId);
        assert.ok(induk,`${butir.id}: elemen induk ${butir.elementId} ditemukan`);
        assert.equal(butir.elementName,induk.name,`${butir.id}: nama elemen ikut bentuk resminya`);
      }
    }
  assert.equal(diperiksa,291,`butir yang diperiksa: ${diperiksa}`);
});

/* ------------------------------------------------- Data lama tetap utuh setelah penyamaan */

function memoryStorage(){
  const nilai=new Map();
  return {getItem:k=>nilai.has(k)?nilai.get(k):null,setItem:(k,v)=>nilai.set(k,String(v)),
    removeItem:k=>nilai.delete(k),clear:()=>nilai.clear()};
}

test('N5. Butir CP, nilai murid, dan tautan TP lama tetap terbaca setelah nama elemen disamakan',()=>{
  globalThis.localStorage=memoryStorage();
  invalidateDbCache();
  const sesi={role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
  saveSubjectMapping(sesi,SUBJECTS_DEFAULT.map((item,index)=>
    ({...item,active:item.id==='agama',order:index+1})));
  const siswa=createStudent(sesi,{classId:'5B',nis:'N-1',nisn:'6611000001',name:'Siswa Uji',
    gender:'P',photo:''});

  /* Catatan yang DITULIS SEBELUM penyamaan nama: kuncinya memakai id elemen dan id butir lama,
     yaitu id yang diturunkan dari nama "Al-Qur'an dan Hadis". */
  const idButirLama='cpb-agama-C-al-qur-an-dan-hadis-1';
  const idElemenLama='agama:al-qur-an-dan-hadis';
  updateDb(db=>{
    db.cpButir[`${ACADEMIC_YEAR}|5B|agama|${idButirLama}`]={
      id:idButirLama,name:'Butir warisan',elementId:idElemenLama,
      elementName:'Al-Qur\u2019an dan Hadis',elementOrder:1,order:1,
      semester:1,jenis:'teori',teori:'materi warisan',praktik:null,active:true,
      subjectId:'agama',phase:'C',isDefault:true,status:'butir_cp'};
    db.cpButirScores[`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|5B|agama|${idButirLama}|${siswa.id}`]={
      studentId:siswa.id,subjectId:'agama',butirId:idButirLama,classId:'5B',
      semester:`Ganjil ${ACADEMIC_YEAR}`,academicYear:ACADEMIC_YEAR,
      jenis:'teori',teori:88,praktik:null,nilai:88};
    /* TP lama yang menaut ke elemen lewat id. */
    db.learningObjectives[`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|5B|agama|tp-warisan`]={
      id:'tp-warisan',code:'TP-1',description:'TP warisan sekolah',phase:'C',subjectId:'agama',
      order:1,active:true,cpElementId:idElemenLama,classId:'5B',
      semester:`Ganjil ${ACADEMIC_YEAR}`,academicYear:ACADEMIC_YEAR};
    return db;
  });

  /* 1. Butir lama masih ditemukan, dan namanya kini mengikuti bentuk resmi. */
  const butir=getCpButir(sesi,'agama',idButirLama);
  assert.ok(butir,'Butir CP tersimpan dengan id lama tetap ditemukan');
  assert.equal(butir.name,'Butir warisan','penyesuaian guru tidak hilang');

  /* 2. Nilai murid tetap terbaca pada butir itu. */
  const lembar=getCpButirScoreSheet(sesi,'agama',idButirLama);
  assert.equal(lembar.rows.find(row=>row.studentId===siswa.id).nilai,88,
    'nilai murid tidak hilang oleh penyamaan nama elemen');

  /* 3. Tautan TP lama ke elemen masih dapat diselesaikan, dan menunjuk nama resminya. */
  const elemen=cpElementById('agama',idElemenLama);
  assert.ok(elemen,'id elemen lama masih dikenali');
  assert.equal(elemen.name,'Al-Qur\u2019an Hadis','elemen lama kini bernama resmi');

  /* 4. Seluruh butir bawaan tetap menempel pada elemen yang ada. */
  for(const item of listCpButir(sesi,'agama'))
    assert.ok(cpElementById('agama',item.elementId),`${item.id}: elemen induk tetap ada`);

  /* 5. Deskripsi Intrakurikuler dan rapor tetap tersusun, dan tetap berbeda satu sama lain. */
  const intra=saveStudentIntracurricularSelection(sesi,siswa.id,{subjectId:'agama',butirIds:listCpButirForSemester(sesi,'agama').slice(0,1).map(item=>item.id),predicate:'Baik'});
  const rapor=generateReportDescription(sesi,'agama',siswa.id,{});
  assert.ok(intra.description&&rapor.text,'kedua deskripsi tersusun');
  assert.notEqual(intra.description,rapor.text,'keduanya tetap berbeda');
  assert.equal(/Fase\s*[ABC]\b/.test(`${intra.description} ${rapor.text}`),false,
    'fase tetap tidak bocor ke deskripsi');
});
