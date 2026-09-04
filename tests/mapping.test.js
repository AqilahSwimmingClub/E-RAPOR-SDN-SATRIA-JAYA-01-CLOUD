import test from 'node:test';import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { canReorderWithinGroup, moveSubjectToGroup, normalizeMappingGroups, reorderWithinGroup } from '../src/services/mapping.js';
import { ensureDefaultSubjects } from '../src/services/seed.js';
import { getSubjectMapping, mappingKey, saveSubjectMapping } from '../src/services/storage.js';

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    clear:()=>values.clear(),
  };
}

test('Default mapping has Islam, Christian, required, and optional subjects',()=>{assert.equal(SUBJECTS_DEFAULT.length,12);assert.equal(SUBJECTS_DEFAULT[0].name,'Pendidikan Agama Islam dan Budi Pekerti');assert.equal(SUBJECTS_DEFAULT[1].name,'Pendidikan Agama Kristen dan Budi Pekerti');assert.equal(SUBJECTS_DEFAULT.at(-1).name,'Koding dan Kecerdasan Artifisial');});

test('Master mapel agama hanya PAI BP dan PAK BP',()=>{
  /* Aturan final: master CP/TP memuat DUA mapel agama saja. Agama lain tetap dapat dipilih
     pada biodata siswa, tetapi tidak melahirkan mata pelajaran tersendiri di Mapping. */
  const mapelAgama=SUBJECTS_DEFAULT.filter(item=>item.id.startsWith('agama'));
  assert.deepEqual(mapelAgama.map(item=>item.id),['agama','agama_kristen']);
  for(const id of ['agama_katolik','agama_hindu','agama_buddha','agama_khonghucu'])
    assert.equal(SUBJECTS_DEFAULT.some(item=>item.id===id),false,`${id} bukan master mapel`);
  for(const id of ['agama','agama_kristen','pancasila','bindo','mtk','ipas','pjok','seni','seni_rupa','bing','sunda','koding'])
    assert.equal(SUBJECTS_DEFAULT.find(item=>item.id===id).active,true,`${id} tetap aktif`);
});

test('Pengaman startup tidak pernah menyuntikkan mapel agama di luar kedua mapel resmi',()=>{
  useMemoryStorage();
  const sesi={role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
  saveSubjectMapping(sesi,SUBJECTS_DEFAULT.map(item=>({...item,active:true})));
  const hasil=ensureDefaultSubjects();
  assert.equal(hasil.repairedMappings,0,'mapping yang sudah lengkap tidak diubah');
  const sesudah=getSubjectMapping(sesi).filter(item=>item.id.startsWith('agama'));
  assert.deepEqual(sesudah.map(item=>item.id),['agama','agama_kristen']);
});

test('Default subject orders are contiguous and separate inside groups',()=>{for(const group of ['A','B'])assert.deepEqual(SUBJECTS_DEFAULT.filter(x=>x.group===group).map(x=>x.order),Array.from({length:SUBJECTS_DEFAULT.filter(x=>x.group===group).length},(_,index)=>index+1));});

test('Reorder only moves subjects inside the same group',()=>{
  const moved=reorderWithinGroup(SUBJECTS_DEFAULT,'pancasila',-1);
  assert.deepEqual(moved.slice(0,3).map(item=>item.id),['agama','pancasila','agama_kristen']);
  assert.deepEqual(moved.filter(item=>item.group==='B').map(item=>item.id),SUBJECTS_DEFAULT.filter(item=>item.group==='B').map(item=>item.id));
  assert.deepEqual(moved.filter(item=>item.group==='A').map(item=>item.order),sequence(countOf('A')));
  assert.deepEqual(moved.filter(item=>item.group==='B').map(item=>item.order),sequence(countOf('B')));
});

const lastOf=group=>SUBJECTS_DEFAULT.filter(item=>item.group===group).at(-1).id;
const firstOf=group=>SUBJECTS_DEFAULT.filter(item=>item.group===group)[0].id;
const countOf=group=>SUBJECTS_DEFAULT.filter(item=>item.group===group).length;
const sequence=length=>Array.from({length},(_,index)=>index+1);

test('Reorder blocks crossing the A and B group boundary',()=>{
  assert.equal(canReorderWithinGroup(SUBJECTS_DEFAULT,lastOf('A'),1),false);
  assert.equal(canReorderWithinGroup(SUBJECTS_DEFAULT,firstOf('B'),-1),false);
  assert.deepEqual(reorderWithinGroup(SUBJECTS_DEFAULT,lastOf('A'),1).map(item=>item.id),normalizeMappingGroups(SUBJECTS_DEFAULT).map(item=>item.id));
  assert.deepEqual(reorderWithinGroup(SUBJECTS_DEFAULT,firstOf('B'),-1).map(item=>item.id),normalizeMappingGroups(SUBJECTS_DEFAULT).map(item=>item.id));
});

test('Legacy crossed mapping is normalized back to contiguous groups',()=>{
  const crossed=SUBJECTS_DEFAULT.map(item=>({...item}));
  const batas=countOf('A');
  [crossed[batas-1],crossed[batas]]=[crossed[batas],crossed[batas-1]];
  const normalized=normalizeMappingGroups(crossed);
  assert.deepEqual(normalized.slice(0,batas).map(item=>item.group),Array(batas).fill('A'));
  assert.deepEqual(normalized.slice(batas).map(item=>item.group),Array(countOf('B')).fill('B'));
  assert.deepEqual(normalized.filter(item=>item.group==='A').map(item=>item.order),sequence(batas));
  assert.deepEqual(normalized.filter(item=>item.group==='B').map(item=>item.order),sequence(countOf('B')));
});

test('Mata pelajaran dapat dipindahkan bebas ke Kelompok A atau B dengan nomor terpisah',()=>{const moved=moveSubjectToGroup(SUBJECTS_DEFAULT,'agama','B');assert.equal(moved.find(item=>item.id==='agama').group,'B');assert.deepEqual(moved.filter(item=>item.group==='A').map(item=>item.order),sequence(countOf('A')-1));assert.deepEqual(moved.filter(item=>item.group==='B').map(item=>item.order),sequence(countOf('B')+1));});

test('Mapping storage is isolated by class and semester scope',()=>{
  useMemoryStorage();
  const base={role:'teacher',academicYear:ACADEMIC_YEAR};
  const class5b={...base,classId:'5B',semester:`Ganjil ${ACADEMIC_YEAR}`};
  const class5c={...base,classId:'5C',semester:`Ganjil ${ACADEMIC_YEAR}`};
  const class5bGenap={...base,classId:'5B',semester:`Genap ${ACADEMIC_YEAR}`};
  const mapping=SUBJECTS_DEFAULT.map(item=>item.id==='koding'?{...item,active:false}:{...item});
  saveSubjectMapping(class5b,mapping);
  assert.equal(getSubjectMapping(class5b).find(item=>item.id==='koding').active,false);
  assert.equal(getSubjectMapping(class5c).find(item=>item.id==='koding').active,true);
  assert.equal(getSubjectMapping(class5bGenap).find(item=>item.id==='koding').active,true);
  assert.notEqual(mappingKey(class5b),mappingKey(class5c));
  assert.notEqual(mappingKey(class5b),mappingKey(class5bGenap));
});
