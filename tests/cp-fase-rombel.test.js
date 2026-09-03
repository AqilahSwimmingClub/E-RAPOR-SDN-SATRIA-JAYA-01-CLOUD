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

const HARAPAN=Object.freeze({
  '1A':'A','1B':'A','1C':'A','1D':'A','2A':'A','2B':'A','2C':'A','2D':'A',
  '3A':'B','3B':'B','3C':'B','3D':'B','4A':'B','4B':'B','4C':'B','4D':'B',
  '5A':'C','5B':'C','5C':'C','5D':'C','6A':'C','6B':'C','6C':'C','6D':'C',
});

test('1. Seluruh 24 rombel dipetakan ke fase yang benar',()=>{
  assert.equal(Object.keys(HARAPAN).length,24);
  assert.deepEqual([...CLASSES].sort(),Object.keys(HARAPAN).sort());
  for(const [classId,fase] of Object.entries(HARAPAN)){
    assert.equal(phaseForClassId(classId),fase);
    assert.equal(phaseForClass(classId),fase);
  }
});

test('2. Huruf rombel tidak pernah memengaruhi fase',()=>{
  for(const tingkat of [1,2,3,4,5,6])assert.equal(new Set([...'ABCD'].map(h=>phaseForClassId(`${tingkat}${h}`))).size,1);
  assert.notEqual(phaseForClassId('2A'),phaseForClassId('3A'));
  assert.notEqual(phaseForClassId('4A'),phaseForClassId('5A'));
  assert.match(read('src/data/learning-objective-defaults.js'),/Number\.parseInt\(String\(classId\|\|''\)\.trim\(\),10\)/);
});

test('3. CP ditentukan dari mata pelajaran dan fase, bukan dari huruf rombel',()=>{
  for(const h of [...'ABCD']){
    assert.equal(capaianPembelajaran(`1${h}`,'mtk').phase,'A');
    assert.equal(capaianPembelajaran(`4${h}`,'bindo').phase,'B');
    assert.equal(capaianPembelajaran(`5${h}`,'ipas').phase,'C');
  }
  const a=capaianPembelajaran('5A','ipas'),b=capaianPembelajaran('5B','ipas');
  assert.deepEqual(a.elements,b.elements);assert.equal(a.phase,b.phase);
  assert.notEqual(capaianPembelajaran('1B','mtk').phase,capaianPembelajaran('4C','mtk').phase);
});

test('4. Sumber CP PAI/PAK dan mapel umum memakai keputusan resmi 2025',()=>{
  const pabp=cpRegulationFor('agama');
  assert.match(pabp.decision,/BSKAP Nomor 046\/H\/KR\/2025/);
  assert.equal(pabp.year,2025);assert.equal(pabp.id,'cp_pabp');
  assert.equal(cpRegulationFor('agama_kristen').id,pabp.id);
  for(const id of ['agama_katolik','agama_hindu','agama_buddha','agama_khonghucu'])
    assert.equal(SUBJECTS_DEFAULT.some(item=>item.id===id),false,`${id} bukan mapel aplikasi`);
  const umum=cpRegulationFor('mtk');
  assert.match(umum.decision,/BSKAP Nomor 046\/H\/KR\/2025/);
  for(const mapel of ['bindo','ipas','pancasila','pjok','seni','bing'])assert.equal(cpRegulationFor(mapel).id,umum.id);
  assert.ok(capaianPembelajaran('2C','agama').regulation.url);
});

test('5. Naskah CP resmi yang tersedia ditampilkan tanpa mengarang fase yang tidak berlaku',()=>{
  const cp=capaianPembelajaran('5B','ipas');
  assert.equal(cp.status,'resmi');
  assert.ok(cp.naskah&&cp.naskah.length>20,'naskah resmi IPAS Fase C tersedia');
  assert.ok(cp.elements.length>0);
  const halaman=read('src/pages/objectives.js');
  assert.match(halaman,/Rujukan:/);assert.match(halaman,/Capaian Pembelajaran — Fase/);
  assert.equal(capaianPembelajaran('1A','ipas').status,'tidak-berlaku','IPAS tidak berdiri sendiri di Fase A');
});

test('6. Setiap TP mengetahui mapel, fase, dan elemen CP yang diturunkannya',()=>{
  useMemoryStorage();const session=guru('5B');aktifkanMapel(session);
  const referensi=listReferenceObjectives(session,'mtk');assert.ok(referensi.length>=4);
  for(const item of referensi){assert.equal(item.subjectId,'mtk');assert.equal(item.phase,'C');assert.ok(item.cpElement?.id);}
  assert.equal(cpElementForObjective('mtk','C',1).name,'Bilangan');
  assert.equal(cpElementForObjective('mtk','C',4).name,'Analisis Data dan Peluang');
  addReferenceObjectives(session,'mtk',referensi.slice(0,2).map(item=>item.id));
  for(const baris of listSchoolObjectives(session,'mtk')){assert.equal(baris.phase,'C');assert.equal(baris.grade,5);assert.ok(baris.cpElement?.name);}
});

test('7. TP referensi mengikuti fase rombel, bukan huruf rombelnya',()=>{
  useMemoryStorage();const satu=guru('1D'),empat=guru('4A'),lima=guru('5C');
  for(const s of [satu,empat,lima])aktifkanMapel(s);
  const a=listReferenceObjectives(satu,'mtk'),b=listReferenceObjectives(empat,'mtk'),c=listReferenceObjectives(lima,'mtk');
  assert.ok(a.length&&b.length&&c.length);for(const x of a)assert.equal(x.phase,'A');for(const x of b)assert.equal(x.phase,'B');for(const x of c)assert.equal(x.phase,'C');
  assert.equal(listReferenceObjectives(satu,'ipas').length,0);assert.ok(listReferenceObjectives(empat,'ipas').length>0);
});

test('8. Membuka mata pelajaran tidak memasukkan TP apa pun',()=>{
  useMemoryStorage();const session=guru('3C');aktifkanMapel(session);
  assert.equal(capaianPembelajaranFor(session,'bindo').phase,'B');assert.ok(listReferenceObjectives(session,'bindo').length>0);
  assert.deepEqual(listSchoolObjectives(session,'bindo'),[]);assert.deepEqual(listActiveObjectives(session,'bindo'),[]);
  const dipilih=listReferenceObjectives(session,'bindo').slice(0,2).map(item=>item.id);
  assert.equal(addReferenceObjectives(session,'bindo',dipilih).added,2);assert.equal(listSchoolObjectives(session,'bindo').length,2);
  assert.throws(()=>addReferenceObjectives(session,'bindo',[]),/Pilih minimal satu/i);
});

test('9. TP terikat tahun pelajaran, semester, dan rombel',()=>{
  useMemoryStorage();const ganjil=guru('5B'),genap={...ganjil,semester:`Genap ${ACADEMIC_YEAR}`},lain=guru('5C');
  for(const s of [ganjil,genap,lain])aktifkanMapel(s);
  addReferenceObjectives(ganjil,'mtk',listReferenceObjectives(ganjil,'mtk').slice(0,2).map(item=>item.id));
  assert.equal(listSchoolObjectives(ganjil,'mtk').length,2);assert.equal(listSchoolObjectives(genap,'mtk').length,0);assert.equal(listSchoolObjectives(lain,'mtk').length,0);
  addReferenceObjectives(genap,'mtk',listReferenceObjectives(genap,'mtk').slice(0,1).map(item=>item.id));
  assert.equal(listSchoolObjectives(ganjil,'mtk').length,2);assert.equal(listSchoolObjectives(genap,'mtk').length,1);
  assert.equal(capaianPembelajaranFor(ganjil,'mtk').phase,capaianPembelajaranFor(genap,'mtk').phase);
});
