import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, CLASSES, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { capaianPembelajaran, cpElementForObjective, cpElements,
  cpRegulationFor } from '../src/data/curriculum-cp.js';
import { phaseForClassId } from '../src/data/learning-objective-defaults.js';
import { addReferenceObjectives, capaianPembelajaranFor, listActiveObjectives,
  listReferenceObjectives, listSchoolObjectives } from '../src/services/learning-objectives.js';
import { phaseForClass } from '../src/services/objectives.js';
import { invalidateDbCache, saveSubjectMapping } from '../src/services/storage.js';

/* CP dan TP adalah dua hal berbeda.

   CP ditetapkan pemerintah per MATA PELAJARAN dan FASE. TP diturunkan darinya oleh guru.
   Fase tidak pernah dipilih manual: ia dihitung dari TINGKAT kelas, dan huruf rombel
   (A/B/C/D) tidak pernah ikut menentukan. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

function useMemoryStorage(){
  const nilai=new Map();
  globalThis.localStorage={getItem:k=>nilai.has(k)?nilai.get(k):null,
    setItem:(k,v)=>nilai.set(k,String(v)),removeItem:k=>nilai.delete(k),clear:()=>nilai.clear()};
  invalidateDbCache();
}
const guru=classId=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,
  semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkanMapel(session,ids=['mtk','bindo','ipas']){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>
    ({...item,active:ids.includes(item.id),order:index+1})));
}

/* --------------------------------------------------- 24 rombel → fase (§1, §15) */

const HARAPAN=Object.freeze({
  '1A':'A','1B':'A','1C':'A','1D':'A',
  '2A':'A','2B':'A','2C':'A','2D':'A',
  '3A':'B','3B':'B','3C':'B','3D':'B',
  '4A':'B','4B':'B','4C':'B','4D':'B',
  '5A':'C','5B':'C','5C':'C','5D':'C',
  '6A':'C','6B':'C','6C':'C','6D':'C',
});

test('1. Seluruh 24 rombel dipetakan ke fase yang benar',()=>{
  assert.equal(Object.keys(HARAPAN).length,24);
  assert.deepEqual([...CLASSES].sort(),Object.keys(HARAPAN).sort(),
    'daftar rombel aplikasi tepat 24 dan sama dengan yang diuji');
  for(const [classId,fase] of Object.entries(HARAPAN)){
    assert.equal(phaseForClassId(classId),fase,`${classId} wajib Fase ${fase}`);
    assert.equal(phaseForClass(classId),fase,`${classId} konsisten di layanan TP`);
  }
});

test('2. Huruf rombel tidak pernah memengaruhi fase',()=>{
  for(const tingkat of [1,2,3,4,5,6]){
    const fase=[...'ABCD'].map(huruf=>phaseForClassId(`${tingkat}${huruf}`));
    assert.equal(new Set(fase).size,1,`Kelas ${tingkat}A–${tingkat}D wajib satu fase yang sama`);
  }
  /* Huruf yang sama pada tingkat berbeda justru boleh berbeda fase. */
  assert.notEqual(phaseForClassId('2A'),phaseForClassId('3A'));
  assert.notEqual(phaseForClassId('4A'),phaseForClassId('5A'));
  /* Fase dihitung dari angka tingkat, bukan dari huruf. */
  const sumber=read('src/data/learning-objective-defaults.js');
  assert.match(sumber,/Number\.parseInt\(String\(classId\|\|''\)\.trim\(\),10\)/,
    'fase dihitung dari tingkat kelas');
});

/* ------------------------------------------------ CP mengikuti mapel + fase (§2, §3) */

test('3. CP ditentukan dari mata pelajaran dan fase, bukan dari huruf rombel',()=>{
  for(const huruf of [...'ABCD']){
    assert.equal(capaianPembelajaran(`1${huruf}`,'mtk').phase,'A');
    assert.equal(capaianPembelajaran(`4${huruf}`,'bindo').phase,'B');
    assert.equal(capaianPembelajaran(`5${huruf}`,'ipas').phase,'C');
  }
  /* CP satu mapel sama untuk seluruh rombel pada tingkat yang sefase. */
  const lima=capaianPembelajaran('5A','ipas'),limaB=capaianPembelajaran('5B','ipas');
  assert.deepEqual(lima.elements,limaB.elements);
  assert.equal(lima.phase,limaB.phase);
  /* Tetapi berbeda antar fase. */
  assert.notEqual(capaianPembelajaran('1B','mtk').phase,capaianPembelajaran('4C','mtk').phase);
});

test('4. Sumber CP Agama dan mapel umum sama-sama memakai keputusan resmi 2025',()=>{
  /* Agama dan mapel umum kini bersumber pada keputusan yang sama, tetapi entrinya tetap
     dipisah: cp_umum menyatakan berlaku untuk mapel SELAIN Agama, sedangkan cp_pabp menyatakan
     bagian Agamanya. Menggabungkan keduanya akan membuat salah satu kutipan menjadi keliru. */
  const pabp=cpRegulationFor('agama');
  assert.match(pabp.decision,/BSKAP Nomor 046\/H\/KR\/2025/);
  assert.equal(pabp.year,2025);
  assert.equal(pabp.id,'cp_pabp','Agama tetap punya entri sumbernya sendiri');
  for(const mapel of ['agama_kristen','agama_katolik','agama_hindu','agama_buddha','agama_khonghucu'])
    assert.equal(cpRegulationFor(mapel).id,pabp.id,'seluruh Agama dan Budi Pekerti');

  const umum=cpRegulationFor('mtk');
  assert.match(umum.decision,/BSKAP Nomor 046\/H\/KR\/2025/);
  for(const mapel of ['bindo','ipas','pancasila','pjok','seni','bing'])
    assert.equal(cpRegulationFor(mapel).id,umum.id,`${mapel} memakai regulasi umum`);

  /* Kutipan regulasi ikut pada setiap CP sehingga dapat diaudit. */
  const cp=capaianPembelajaran('2C','agama');
  assert.match(cp.regulation.decision,/BSKAP Nomor 046\/H\/KR\/2025/);
  assert.ok(cp.regulation.url&&cp.regulation.title);
});

test('5. Aplikasi tidak menyalin naskah CP dan tidak mengarangnya',()=>{
  const cp=capaianPembelajaran('5B','ipas');
  assert.equal(cp.naskah,null,'naskah CP mengikuti dokumen resmi, tidak disalin aplikasi');
  assert.equal(cp.status,'rujukan');
  /* Yang ditampilkan adalah elemen CP beserta kutipan regulasinya. */
  assert.ok(cp.elements.length>0);
  for(const elemen of cp.elements)assert.ok(elemen.id&&elemen.name);
  const halaman=read('src/pages/objectives.js');
  assert.match(halaman,/Rujukan:/,'kutipan regulasi tampil di layar');
  assert.match(halaman,/Capaian Pembelajaran — Fase/,'CP tampil sebagai blok tersendiri');
});

/* ------------------------------------------------------- Struktur data CP → TP (§4) */

test('6. Setiap TP mengetahui mapel, fase, dan elemen CP yang diturunkannya',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanMapel(session);

  const referensi=listReferenceObjectives(session,'mtk');
  assert.ok(referensi.length>=4);
  for(const item of referensi){
    assert.equal(item.subjectId,'mtk');
    assert.equal(item.phase,'C');
    assert.ok(item.cpElement?.id,'TP referensi tertaut ke elemen CP');
    assert.ok(cpElements('mtk').some(elemen=>elemen.id===item.cpElement.id),
      'elemen berasal dari daftar elemen CP mapel itu');
  }
  assert.equal(cpElementForObjective('mtk','C',1).name,'Bilangan');
  assert.equal(cpElementForObjective('mtk','C',4).name,'Analisis Data dan Peluang');

  /* Kaitan itu ikut tersimpan saat TP dimasukkan. */
  addReferenceObjectives(session,'mtk',referensi.slice(0,2).map(item=>item.id));
  const tabel=listSchoolObjectives(session,'mtk');
  assert.equal(tabel.length,2);
  for(const baris of tabel){
    assert.equal(baris.phase,'C');
    assert.equal(baris.grade,5);
    assert.ok(baris.cpElement?.name,'TP sekolah tetap tertaut ke elemen CP');
  }
});

test('7. TP referensi mengikuti fase rombel, bukan huruf rombelnya',()=>{
  useMemoryStorage();
  const satu=guru('1D'),empat=guru('4A'),lima=guru('5C');
  for(const sesi of [satu,empat,lima])aktifkanMapel(sesi);

  const a=listReferenceObjectives(satu,'mtk');
  const b=listReferenceObjectives(empat,'mtk');
  const c=listReferenceObjectives(lima,'mtk');
  assert.ok(a.length&&b.length&&c.length);
  for(const item of a)assert.equal(item.phase,'A');
  for(const item of b)assert.equal(item.phase,'B');
  for(const item of c)assert.equal(item.phase,'C');
  assert.notDeepEqual(a.map(item=>item.description),b.map(item=>item.description));
  assert.notDeepEqual(b.map(item=>item.description),c.map(item=>item.description));

  /* IPAS memang belum berdiri sendiri pada Fase A. */
  assert.equal(listReferenceObjectives(satu,'ipas').length,0);
  assert.ok(listReferenceObjectives(empat,'ipas').length>0);
});

/* --------------------------------------------- TP tidak muncul otomatis (§6, §7) */

test('8. Membuka mata pelajaran tidak memasukkan TP apa pun',()=>{
  useMemoryStorage();
  const session=guru('3C');
  aktifkanMapel(session);
  assert.equal(capaianPembelajaranFor(session,'bindo').phase,'B','CP tetap tampil');
  assert.ok(listReferenceObjectives(session,'bindo').length>0,'katalog tersedia sebagai pilihan');
  assert.deepEqual(listSchoolObjectives(session,'bindo'),[],'tabel TP masih kosong');
  assert.deepEqual(listActiveObjectives(session,'bindo'),[],'belum ada TP aktif');

  /* Guru menekan + Tambah TP dan mencentang dua butir. */
  const dipilih=listReferenceObjectives(session,'bindo').slice(0,2).map(item=>item.id);
  const hasil=addReferenceObjectives(session,'bindo',dipilih);
  assert.equal(hasil.added,2);
  assert.equal(listSchoolObjectives(session,'bindo').length,2,'hanya yang dicentang yang masuk');
  assert.throws(()=>addReferenceObjectives(session,'bindo',[]),/Pilih minimal satu/i);
});

test('9. TP terikat tahun pelajaran, semester, dan rombel',()=>{
  useMemoryStorage();
  const ganjil=guru('5B');
  const genap={...ganjil,semester:`Genap ${ACADEMIC_YEAR}`};
  const lain=guru('5C');
  for(const sesi of [ganjil,genap,lain])aktifkanMapel(sesi);

  addReferenceObjectives(ganjil,'mtk',listReferenceObjectives(ganjil,'mtk').slice(0,2).map(item=>item.id));
  assert.equal(listSchoolObjectives(ganjil,'mtk').length,2);
  assert.equal(listSchoolObjectives(genap,'mtk').length,0,'Genap tidak menimpa Ganjil');
  assert.equal(listSchoolObjectives(lain,'mtk').length,0,'rombel lain berdiri sendiri');

  addReferenceObjectives(genap,'mtk',listReferenceObjectives(genap,'mtk').slice(0,1).map(item=>item.id));
  assert.equal(listSchoolObjectives(ganjil,'mtk').length,2,'Ganjil tetap utuh');
  assert.equal(listSchoolObjectives(genap,'mtk').length,1);

  /* CP tidak ikut berubah hanya karena semester atau huruf rombel berbeda. */
  assert.equal(capaianPembelajaranFor(ganjil,'mtk').phase,capaianPembelajaranFor(genap,'mtk').phase);
  assert.equal(capaianPembelajaranFor(ganjil,'mtk').phase,capaianPembelajaranFor(lain,'mtk').phase);
});
