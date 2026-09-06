import test from 'node:test';import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { canReorderSubject, moveSubjectToGroup, normalizeMappingOrder, reorderSubject } from '../src/services/mapping.js';
import { ensureDefaultSubjects } from '../src/services/seed.js';
import { getSubjectMapping, mappingKey } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';

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

/* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA (1.3.2).

   Empat test di bawah ini dulu mengunci penomoran PER KELOMPOK: Kelompok A bernomor 1..9 dan
   Kelompok B bernomor 1..3 sendiri, dan mapel tidak boleh berpindah melewati batas kelompok.
   Pengguna meminta konsep Kelompok A/B dibuang dari Mapping: satu daftar mapel, satu urutan,
   dan urutan itulah sumber kebenaran di seluruh aplikasi. Harapan keempatnya karena itu
   dibalik - yang dikunci sekarang justru deret tunggal dan kebebasan berpindah. */
test('Nomor urut bawaan adalah satu deret tunggal 1..N, bukan per kelompok',()=>{
  assert.deepEqual(SUBJECTS_DEFAULT.map(item=>item.order),sequence(SUBJECTS_DEFAULT.length));
  /* Tidak ada nomor kembar di seluruh daftar. */
  assert.equal(new Set(SUBJECTS_DEFAULT.map(item=>item.order)).size,SUBJECTS_DEFAULT.length);
  /* Field group tetap tersimpan demi keterbacaan data lama, tetapi bukan lagi penentu urutan. */
  assert.ok(SUBJECTS_DEFAULT.every(item=>['A','B'].includes(item.group)),'metadata lama tetap ada');
});

test('Reorder memindahkan mapel di dalam satu daftar tunggal',()=>{
  const moved=reorderSubject(SUBJECTS_DEFAULT,'pancasila',-1);
  assert.deepEqual(moved.slice(0,3).map(item=>item.id),['agama','pancasila','agama_kristen']);
  /* Nomornya tetap satu deret rapat sesudah dipindahkan. */
  assert.deepEqual(moved.map(item=>item.order),sequence(SUBJECTS_DEFAULT.length));
  /* Tidak ada mapel yang hilang atau berubah id. */
  assert.deepEqual([...moved].map(item=>item.id).sort(),[...SUBJECTS_DEFAULT].map(item=>item.id).sort());
});

const lastOf=group=>SUBJECTS_DEFAULT.filter(item=>item.group===group).at(-1).id;
const firstOf=group=>SUBJECTS_DEFAULT.filter(item=>item.group===group)[0].id;
const countOf=group=>SUBJECTS_DEFAULT.filter(item=>item.group===group).length;
const sequence=length=>Array.from({length},(_,index)=>index+1);

test('Reorder bebas melewati bekas batas kelompok, dan berhenti di ujung daftar',()=>{
  /* Batas kelompok sudah tidak ada: mapel terakhir bekas Kelompok A boleh turun, dan mapel
     pertama bekas Kelompok B boleh naik. */
  assert.equal(canReorderSubject(normalizeMappingOrder(SUBJECTS_DEFAULT),lastOf('A'),1),true);
  assert.equal(canReorderSubject(normalizeMappingOrder(SUBJECTS_DEFAULT),firstOf('B'),-1),true);
  const turun=reorderSubject(SUBJECTS_DEFAULT,lastOf('A'),1);
  assert.deepEqual(turun.map(item=>item.id).slice(8,10),[firstOf('B'),lastOf('A')],
    'mapel benar-benar bertukar tempat melewati bekas batas kelompok');
  /* Yang tetap ditolak hanyalah bergerak keluar dari ujung daftar. */
  const urut=normalizeMappingOrder(SUBJECTS_DEFAULT);
  assert.equal(canReorderSubject(urut,urut[0].id,-1),false);
  assert.equal(canReorderSubject(urut,urut.at(-1).id,1),false);
  assert.deepEqual(reorderSubject(SUBJECTS_DEFAULT,urut[0].id,-1).map(item=>item.id),urut.map(item=>item.id));
});

test('Mapping lama bernomor per kelompok dinormalkan sekali menjadi satu deret',()=>{
  /* Bentuk data rilis lama: Kelompok A bernomor 1..9, Kelompok B bernomor 1..3 sendiri. */
  const lama=SUBJECTS_DEFAULT.map(item=>({...item,
    order:item.group==='A'?item.order:item.order-countOf('A')}));
  assert.ok(lama.filter(item=>item.group==='B')[0].order===1,'fixture memang bentuk lama');
  const hasil=normalizeMappingOrder(lama);
  /* Urutan yang selama ini dilihat guru dipertahankan, lalu dinomori ulang 1..N. */
  assert.deepEqual(hasil.map(item=>item.id),SUBJECTS_DEFAULT.map(item=>item.id));
  assert.deepEqual(hasil.map(item=>item.order),sequence(SUBJECTS_DEFAULT.length));
  /* Status aktif dan id tidak disentuh sama sekali. */
  assert.deepEqual(hasil.map(item=>item.active),lama.map(item=>item.active));
  /* Normalisasi bersifat idempotent: memanggilnya lagi tidak mengubah apa pun. */
  assert.deepEqual(normalizeMappingOrder(hasil),hasil);
  /* Dan urutan yang SUDAH tunggal tidak pernah dikembalikan ke pengelompokan lama. */
  const dipindah=reorderSubject(hasil,firstOf('B'),-1);
  assert.deepEqual(normalizeMappingOrder(dipindah).map(item=>item.id),dipindah.map(item=>item.id),
    'mapel yang sudah dipindah tidak terlempar balik ke kelompoknya');
});

test('moveSubjectToGroup hanya mengubah label kelompok, bukan urutan',()=>{
  /* Fungsi ini dipertahankan untuk data lama. Kelompok bukan lagi penentu urutan, jadi
     memindahkannya tidak boleh menggeser posisi mapel mana pun. */
  const sebelum=normalizeMappingOrder(SUBJECTS_DEFAULT);
  const sesudah=moveSubjectToGroup(SUBJECTS_DEFAULT,'agama','B');
  assert.equal(sesudah.find(item=>item.id==='agama').group,'B');
  assert.deepEqual(sesudah.map(item=>item.id),sebelum.map(item=>item.id),'urutan tidak bergeser');
  assert.deepEqual(sesudah.map(item=>item.order),sequence(SUBJECTS_DEFAULT.length));
});

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
