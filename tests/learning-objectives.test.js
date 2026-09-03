import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { defaultLearningObjectives, hasDefaultsFor, OBJECTIVE_STATUS, phaseForClassId,
  subjectsWithDefaults, TP_SOURCES } from '../src/data/learning-objective-defaults.js';
import { getSelectedAssessmentObjectives, getSelectedObjectiveRecords, listObjectivesForAssessment,
  setSelectedAssessmentObjectives } from '../src/services/learning-objectives.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';

/* TP adalah ACUAN penilaian, bukan nilai. Suite ini menjaga dua janji sekaligus: TP terscope
   dengan benar, dan tidak ada satu pun angka yang tersimpan per TP. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:k=>values.has(k)?values.get(k):null,
  setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),clear:()=>values.clear()};invalidateDbCache();return values;}
const guru=(classId='5B',semester=`Ganjil ${ACADEMIC_YEAR}`,academicYear=ACADEMIC_YEAR)=>({role:'teacher',classId,academicYear,semester});
function aktifkanMapel(session,ids=['mtk','bindo','ipas']){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));
}

/* ------------------------------------------------------------------ Fase dan katalog */

test('Fase mengikuti tingkat kelas dan IPAS hanya ada mulai Fase B',()=>{
  assert.equal(phaseForClassId('1A'),'A');
  assert.equal(phaseForClassId('2D'),'A');
  assert.equal(phaseForClassId('3A'),'B');
  assert.equal(phaseForClassId('4C'),'B');
  assert.equal(phaseForClassId('5B'),'C');
  assert.equal(phaseForClassId('6A'),'C');
  assert.equal(hasDefaultsFor('1A','ipas'),false,'IPAS belum berdiri sendiri pada Fase A');
  assert.equal(hasDefaultsFor('2B','ipas'),false);
  assert.equal(hasDefaultsFor('3A','ipas'),true);
  assert.equal(hasDefaultsFor('5B','ipas'),true);
});

test('TP bawaan berstatus inspiratif, dapat diubah, dan mencantumkan sumber resmi',()=>{
  assert.equal(OBJECTIVE_STATUS,'inspiratif');
  for(const subjectId of subjectsWithDefaults()){
    for(const classId of ['1A','3A','5B']){
      for(const tp of defaultLearningObjectives(classId,subjectId)){
        assert.equal(tp.status,'inspiratif',`${subjectId} ${classId} berstatus inspiratif`);
        assert.equal(tp.editable,true,`${subjectId} ${classId} dapat disesuaikan guru`);
        assert.ok(tp.source?.decision&&tp.source?.title&&tp.source?.url,`${subjectId} mencantumkan sumber`);
        assert.equal(tp.phase,phaseForClassId(classId));
        assert.ok(tp.description.length>25,'deskripsi TP operasional, bukan sekadar judul');
      }
    }
  }
  /* Pemerintah menetapkan CP, bukan TP. Aplikasi tidak boleh mengklaim sebaliknya. */
  const sumber=read('src/data/learning-objective-defaults.js');
  assert.match(sumber,/pemerintah menetapkan CAPAIAN PEMBELAJARAN \(CP\), bukan Tujuan/i);
  for(const larangan of ['TP nasional wajib','TP resmi nasional','wajib dipakai secara nasional'])
    assert.equal(sumber.includes(larangan),false,`tidak mengklaim ${larangan}`);
});

test('Sumber rujukan menyebut keputusan resmi terbaru untuk mapel umum dan agama',()=>{
  assert.match(TP_SOURCES.cp_umum.decision,/046\/H\/KR\/2025/);
  assert.match(TP_SOURCES.cp_pabp.decision,/020 Tahun 2026/);
  assert.ok(TP_SOURCES.cp_pabp.year>=2026,'PABP memakai pembaruan 2026');
  for(const sumber of Object.values(TP_SOURCES))
    assert.match(sumber.url,/^https:\/\/[a-z0-9.-]*(kemdikbud|kemendikdasmen)\.go\.id/,`${sumber.id} merujuk domain resmi`);
});

/* -------------------------------------------------------- Scope dan TP buatan guru */

test('TP terscope per kelas, mapel, tahun pelajaran, dan semester',()=>{
  useMemoryStorage();
  const lima=guru('5B'),tiga=guru('3A');
  aktifkanMapel(lima);aktifkanMapel(tiga);
  const mtkLima=listObjectivesForAssessment(lima,'mtk');
  const mtkTiga=listObjectivesForAssessment(tiga,'mtk');
  assert.ok(mtkLima.length&&mtkTiga.length);
  assert.notDeepEqual(mtkLima.map(item=>item.description),mtkTiga.map(item=>item.description),
    'Fase C dan Fase B memakai TP yang berbeda');
  assert.notDeepEqual(listObjectivesForAssessment(lima,'mtk').map(item=>item.id),
    listObjectivesForAssessment(lima,'bindo').map(item=>item.id),'TP berbeda antar mapel');
});

test('TP buatan guru menggantikan katalog bawaan tanpa mengubah sumbernya',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const bawaan=listObjectivesForAssessment(session,'mtk');
  assert.equal(bawaan[0].isDefault,true);
  createLearningObjective(session,'mtk',{description:'menyusun strategi pemecahan masalah pecahan sendiri'});
  const sesudah=listObjectivesForAssessment(session,'mtk');
  assert.equal(sesudah.length,1,'TP lokal menjadi acuan begitu guru membuatnya');
  assert.equal(sesudah[0].isDefault,false);
  assert.match(sesudah[0].description,/menyusun strategi/);
  /* Katalog sumber tidak pernah ikut berubah. */
  assert.equal(defaultLearningObjectives('5B','mtk')[0].description,bawaan[0].description);
  assert.equal(loadDb().learningObjectives&&Object.keys(loadDb().learningObjectives).length,1,
    'hanya TP buatan guru yang tersimpan; katalog tidak pernah ditulis ke database');
});

/* ------------------------------------------------- Pemilihan TP tanpa nilai per TP */

test('Satu penilaian dapat mengacu pada beberapa TP sekaligus',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const tersedia=listObjectivesForAssessment(session,'mtk');
  assert.ok(tersedia.length>=3);
  assert.deepEqual(getSelectedAssessmentObjectives(session,'mtk'),[],'awalnya belum ada yang dipilih');

  const pilih=tersedia.slice(0,3).map(item=>item.id);
  const hasil=setSelectedAssessmentObjectives(session,'mtk',pilih);
  assert.deepEqual(hasil.objectiveIds,pilih);
  assert.deepEqual(getSelectedAssessmentObjectives(session,'mtk'),pilih);
  assert.equal(getSelectedObjectiveRecords(session,'mtk').length,3);

  /* Satu TP saja juga sah. */
  setSelectedAssessmentObjectives(session,'mtk',[tersedia[1].id]);
  assert.deepEqual(getSelectedAssessmentObjectives(session,'mtk'),[tersedia[1].id]);
  /* Pilihan pada mapel lain berdiri sendiri. */
  assert.deepEqual(getSelectedAssessmentObjectives(session,'bindo'),[]);
});

test('Tidak ada satu pun nilai yang tersimpan per TP',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const tersedia=listObjectivesForAssessment(session,'mtk');
  setSelectedAssessmentObjectives(session,'mtk',tersedia.map(item=>item.id));
  const record=loadDb().assessmentObjectiveSelection[`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|5B|mtk`];
  /* assessmentType hanyalah label komponen penilaian (Formatif/Harian/...), bukan angka.
     Yang dijaga di sini: record pemilihan TP tidak pernah memuat nilai. */
  assert.deepEqual(Object.keys(record).sort(),
    ['academicYear','assessmentType','classId','objectiveIds','semester','subjectId','updatedAt'].sort(),
    'yang tersimpan hanya daftar ID TP beserta lingkupnya, tanpa satu pun kolom angka');
  for(const nilai of Object.values(record))
    assert.equal(typeof nilai==='number',false,'tidak ada angka pada record pemilihan TP');
  assert.equal(record.assessmentType,null,'acuan tingkat mata pelajaran tidak terikat satu komponen');
  /* Layanan TP tidak menyentuh koleksi nilai mana pun. */
  const layanan=read('src/services/learning-objectives.js');
  for(const larangan of ['assessmentScores','reportScores','finalScore','score'])
    assert.equal(layanan.includes(larangan),false,`layanan TP tidak menyentuh ${larangan}`);
});

test('Pilihan TP hanya boleh diubah Guru dan gugur bila TP-nya dihapus',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  assert.throws(()=>setSelectedAssessmentObjectives({...session,role:'admin'},'mtk',[]),/Hanya Guru/i);
  const bawaan=listObjectivesForAssessment(session,'mtk');
  setSelectedAssessmentObjectives(session,'mtk',[bawaan[0].id,bawaan[1].id]);
  /* Begitu guru membuat TP sendiri, katalog bawaan tidak lagi menjadi acuan, dan pilihan
     lama otomatis gugur alih-alih menyisakan rujukan yang menggantung. */
  createLearningObjective(session,'mtk',{description:'menyelesaikan soal cerita pecahan bertingkat'});
  assert.deepEqual(getSelectedAssessmentObjectives(session,'mtk'),[]);
  assert.equal(getSelectedObjectiveRecords(session,'mtk').length,0);
});

test('Pemilihan TP ikut backup akademik dan tidak menyentuh lisensi',()=>{
  const values=useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  setSelectedAssessmentObjectives(session,'mtk',listObjectivesForAssessment(session,'mtk').map(item=>item.id));
  assert.ok(loadDb().assessmentObjectiveSelection,'tersimpan di database sekolah');
  assert.equal(values.get('erapor_license_v1'),undefined,'lisensi tidak tersentuh');
});
