import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, CLASSES, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { capaianPembelajaran, cpElementForObjective, cpRegulationFor } from '../src/data/curriculum-cp.js';
import { phaseForClassId } from '../src/data/learning-objective-defaults.js';
import { addReferenceObjectives, capaianPembelajaranFor, listActiveObjectives,
  listReferenceObjectives, listSchoolObjectives } from '../src/services/learning-objectives.js';
import { phaseForClass } from '../src/services/objectives.js';
import { invalidateDbCache, saveSubjectMapping } from '../src/services/storage.js';

function useMemoryStorage(){
  const nilai=new Map();
  globalThis.localStorage={getItem:k=>nilai.has(k)?nilai.get(k):null,setItem:(k,v)=>nilai.set(k,String(v)),removeItem:k=>nilai.delete(k),clear:()=>nilai.clear()};
  invalidateDbCache();
}
const guru=classId=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkanMapel(session,ids=['mtk','bindo','ipas']){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));
}
const HARAPAN=Object.freeze({
  '1A':'A','1B':'A','1C':'A','1D':'A','2A':'A','2B':'A','2C':'A','2D':'A',
  '3A':'B','3B':'B','3C':'B','3D':'B','4A':'B','4B':'B','4C':'B','4D':'B',
  '5A':'C','5B':'C','5C':'C','5D':'C','6A':'C','6B':'C','6C':'C','6D':'C',
});

test('24 rombel mengikuti fase A/B/C dari tingkat kelas',()=>{
  assert.deepEqual([...CLASSES].sort(),Object.keys(HARAPAN).sort());
  for(const [classId,fase] of Object.entries(HARAPAN)){
    assert.equal(phaseForClassId(classId),fase);
    assert.equal(phaseForClass(classId),fase);
  }
});

test('CP mengikuti mapel dan fase, bukan huruf rombel',()=>{
  for(const h of [...'ABCD']){
    assert.equal(capaianPembelajaran(`1${h}`,'mtk').phase,'A');
    assert.equal(capaianPembelajaran(`4${h}`,'bindo').phase,'B');
    assert.equal(capaianPembelajaran(`5${h}`,'ipas').phase,'C');
  }
});

test('PAI dan PAK memakai sumber BSKAP 046/2025',()=>{
  const pai=cpRegulationFor('agama');
  assert.match(pai.decision,/046\/H\/KR\/2025/);
  assert.equal(cpRegulationFor('agama_kristen').id,pai.id);
  for(const id of ['agama_katolik','agama_hindu','agama_buddha','agama_khonghucu'])
    assert.equal(SUBJECTS_DEFAULT.some(item=>item.id===id),false);
});

test('naskah CP resmi IPAS Fase C tersedia dan IPAS Fase A tidak berlaku',()=>{
  const cp=capaianPembelajaran('5B','ipas');
  assert.equal(cp.available,true);
  assert.ok(cp.naskah&&cp.naskah.length>20);
  const faseA=capaianPembelajaran('1A','ipas');
  assert.equal(faseA.available,false);
  assert.equal(faseA.naskah,null);
});

test('TP referensi tetap tertaut ke fase dan elemen CP',()=>{
  useMemoryStorage();const session=guru('5B');aktifkanMapel(session);
  const ref=listReferenceObjectives(session,'mtk');
  assert.ok(ref.length>=4);
  assert.ok(ref.every(item=>item.phase==='C'&&item.cpElement?.id));
  assert.equal(cpElementForObjective('mtk','C',1).name,'Bilangan');
  addReferenceObjectives(session,'mtk',ref.slice(0,2).map(item=>item.id));
  assert.equal(listSchoolObjectives(session,'mtk').length,2);
  assert.equal(listActiveObjectives(session,'mtk').length,2);
});

test('IPAS Fase A tidak menawarkan TP baru, Fase B menawarkan TP',()=>{
  useMemoryStorage();const satu=guru('1D'),empat=guru('4A');aktifkanMapel(satu);aktifkanMapel(empat);
  assert.equal(listReferenceObjectives(satu,'ipas').length,0);
  assert.ok(listReferenceObjectives(empat,'ipas').length>0);
});

test('membuka mapel tidak otomatis menyimpan TP',()=>{
  useMemoryStorage();const session=guru('3C');aktifkanMapel(session);
  assert.equal(capaianPembelajaranFor(session,'bindo').phase,'B');
  assert.ok(listReferenceObjectives(session,'bindo').length>0);
  assert.deepEqual(listSchoolObjectives(session,'bindo'),[]);
  const ids=listReferenceObjectives(session,'bindo').slice(0,2).map(item=>item.id);
  assert.equal(addReferenceObjectives(session,'bindo',ids).added,2);
});

test('TP tersimpan terpisah per semester dan rombel',()=>{
  useMemoryStorage();const ganjil=guru('5B'),genap={...ganjil,semester:`Genap ${ACADEMIC_YEAR}`},lain=guru('5C');
  for(const s of [ganjil,genap,lain])aktifkanMapel(s);
  addReferenceObjectives(ganjil,'mtk',listReferenceObjectives(ganjil,'mtk').slice(0,2).map(item=>item.id));
  assert.equal(listSchoolObjectives(ganjil,'mtk').length,2);
  assert.equal(listSchoolObjectives(genap,'mtk').length,0);
  assert.equal(listSchoolObjectives(lain,'mtk').length,0);
});
