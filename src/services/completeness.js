import { COCURRICULAR_ACTIVITY_PRESETS, cocurricularActivityNames, findCocurricularPreset } from '../data/cocurricular.js';
import { listStudents } from './students.js';
import { loadDb, scopeKey, updateDb } from './storage.js';

export const PROMOTION_STATUSES=[
  {id:'PROMOTED',label:'Naik ke kelas berikutnya'},
  {id:'RETAINED',label:'Tinggal di kelas'},
];
export const GRADUATION_STATUSES=[
  {id:'GRADUATED',label:'Lulus'},
  {id:'NOT_GRADUATED',label:'Tidak Lulus'},
];
export const ACTIVITY_PREDICATES=['Baik','Sangat Baik'];
/* Predikat lama tetap dapat dibaca agar data sebelum revisi ini tidak menjadi tidak valid. */
export const LEGACY_ACTIVITY_PREDICATES=['Cukup'];
function knownPredicate(value){return ACTIVITY_PREDICATES.includes(value)||LEGACY_ACTIVITY_PREDICATES.includes(value);}
export const ACTIVITY_DESCRIPTIONS={
  'Sangat Baik':'Menunjukkan partisipasi, kedisiplinan, dan tanggung jawab yang sangat baik dalam kegiatan.',
  'Baik':'Menunjukkan partisipasi dan tanggung jawab yang baik dalam kegiatan.',
  'Cukup':'Cukup berpartisipasi dan perlu meningkatkan konsistensi dalam kegiatan.',
};
export const PRAMUKA_DESCRIPTIONS={siaga:['Aktif mengikuti latihan dasar kepramukaan dan mampu mengikuti aturan kelompok dengan baik.','Menunjukkan kemandirian, kedisiplinan, dan tanggung jawab dalam kegiatan Pramuka Siaga.','Mampu bekerja sama dengan teman dalam permainan dan kegiatan kelompok.','Menunjukkan kepedulian terhadap lingkungan, kebersihan, dan sesama.','Aktif mengembangkan keberanian, keterampilan, dan rasa percaya diri.'],penggalang:['Aktif mengikuti kegiatan kepramukaan serta menunjukkan disiplin dan tanggung jawab.','Mampu bekerja sama, memimpin, dan menyelesaikan tugas kelompok.','Menunjukkan keterampilan kepramukaan, kemandirian, dan kepedulian lingkungan.','Mampu menerapkan gotong royong dan tanggung jawab dalam kegiatan.','Menunjukkan percaya diri, kepemimpinan, dan kemampuan bekerja sama.']};
export const COCURRICULAR_DESCRIPTIONS={lower:['Aktif mengikuti kegiatan bersama dan mampu bekerja sama.','Menunjukkan rasa ingin tahu dan semangat belajar.','Mampu menyelesaikan tugas sederhana dengan tanggung jawab.','Menunjukkan kepedulian terhadap kebersihan dan lingkungan.','Mampu menyampaikan ide dan berpartisipasi dalam kelompok.'],upper:['Aktif berkolaborasi dan menyelesaikan tugas dengan tanggung jawab.','Mampu mengembangkan ide dan memecahkan masalah.','Menunjukkan kemandirian, disiplin, dan kemampuan berkomunikasi.','Menunjukkan kepedulian lingkungan dan gotong royong.','Mampu mengembangkan kreativitas, bernalar kritis, dan bekerja sama.']};
export function pramukaPresetForClass(classId){const grade=gradeOf(classId);return grade<=3?'Pramuka Siaga':'Pramuka Penggalang';}
export function pramukaDescriptionsForClass(classId){return [...(gradeOf(classId)<=3?PRAMUKA_DESCRIPTIONS.siaga:PRAMUKA_DESCRIPTIONS.penggalang)];}
export function cocurricularDescriptionsForClass(classId,activity){
  const preset=findCocurricularPreset(activity);
  if(preset)return [...(gradeOf(classId)<=3?preset.lower:preset.upper)];
  return [...(gradeOf(classId)<=3?COCURRICULAR_DESCRIPTIONS.lower:COCURRICULAR_DESCRIPTIONS.upper)];
}
export function listCocurricularActivities(){return cocurricularActivityNames();}
export function cocurricularPresets(){return COCURRICULAR_ACTIVITY_PRESETS;}
function predicatePrefix(predicate){return {'Cukup':'Cukup','Baik':'Baik','Sangat Baik':'Sangat baik'}[predicate]||'Baik';}
export function pramukaDescriptionTemplates(classId,predicate){if(!knownPredicate(predicate))throw new Error('Predikat ekstrakurikuler tidak valid.');return pramukaDescriptionsForClass(classId).map(text=>`${predicatePrefix(predicate)} dalam ${text.charAt(0).toLowerCase()}${text.slice(1)}`);}
export function cocurricularDescriptionTemplates(classId,predicate,activity){if(!knownPredicate(predicate))throw new Error('Predikat kokurikuler tidak valid.');return cocurricularDescriptionsForClass(classId,activity);}

function clone(value){return JSON.parse(JSON.stringify(value));}
function newId(prefix){return globalThis.crypto?.randomUUID?.()||`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}
function clean(value,max=1500){return String(value??'').trim().slice(0,max);}
function assertTeacher(session){if(!session||session.role!=='teacher'||!session.classId)throw new Error('Session Guru tidak valid.');}
function scopedRecord(session,studentId,extra={}){return {classId:session.classId,studentId,semester:session.semester,academicYear:session.academicYear,...extra};}
function requireStudent(session,studentId){
  assertTeacher(session);
  const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);
  if(!student)throw new Error('Siswa tidak ditemukan pada scope rombel aktif.');
  return student;
}
function studentKey(session,studentId){return `${scopeKey(session)}|${studentId}`;}
function activityKey(session,studentId,id){return `${scopeKey(session)}|${studentId}|${id}`;}
function gradeOf(classId){return Number.parseInt(String(classId||'').match(/^([1-6])/)?.[1]||'',10);}

export function listExtracurriculars(session,studentId){
  requireStudent(session,studentId);const prefix=`${scopeKey(session)}|${studentId}|`;
  return Object.entries(loadDb().extracurricularScores||{}).filter(([key])=>key.startsWith(prefix)).map(([,record])=>clone(record)).sort((a,b)=>(a.order||0)-(b.order||0)||a.name.localeCompare(b.name,'id'));
}

function normalizeActivity(input){
  const record={name:clean(input?.name,120),predicate:clean(input?.predicate,50),description:clean(input?.description,1000)};
  if(!record.name)throw new Error('Nama ekstrakurikuler wajib diisi.');
  if(!record.predicate)throw new Error('Predikat ekstrakurikuler wajib diisi.');
  if(!knownPredicate(record.predicate))throw new Error('Predikat ekstrakurikuler tidak valid.');
  if(!record.description)throw new Error('Deskripsi ekstrakurikuler wajib diisi.');
  return record;
}

/* Terapkan ke Semua Siswa: kegiatan, predikat, dan deskripsi yang sama untuk seluruh siswa
   rombel, ditulis dalam SATU commit. Data individual dengan kegiatan yang sama hanya ditimpa
   bila pemanggil memang meminta overwrite, sehingga hasil edit per siswa tidak hilang diam-diam. */
export function saveExtracurricularBulk(session,input,{overwrite=true}={}){
  assertTeacher(session);
  const predicate=clean(input?.predicate,50);
  if(!ACTIVITY_PREDICATES.includes(predicate))throw new Error('Predikat ekstrakurikuler tidak valid.');
  const name=clean(input?.name||pramukaPresetForClass(session.classId),120);
  const description=clean(input?.description||pramukaDescriptionTemplates(session.classId,predicate)[0]||ACTIVITY_DESCRIPTIONS[predicate],1000);
  if(!description)throw new Error('Deskripsi ekstrakurikuler wajib diisi.');
  const students=listStudents(session,{classId:session.classId});
  const saved=[];let dilewati=0;
  updateDb(db=>{
    const now=new Date().toISOString();
    students.forEach(student=>{
      const prefix=`${scopeKey(session)}|${student.id}|`;
      const entri=Object.entries(db.extracurricularScores||{}).filter(([key])=>key.startsWith(prefix));
      const cocok=entri.find(([,record])=>String(record.name||'').toLowerCase()===name.toLowerCase());
      if(cocok&&!overwrite){dilewati+=1;saved.push(clone(cocok[1]));return;}
      const id=cocok?cocok[1].id:newId('extra');
      const record=scopedRecord(session,student.id,{id,name,predicate,description,order:cocok?cocok[1].order||entri.length+1:entri.length+1,createdAt:cocok?.[1]?.createdAt||now,updatedAt:now});
      db.extracurricularScores[`${prefix}${id}`]=record;
      saved.push(record);
    });
    return db;
  });
  return {saved:clone(saved),studentCount:students.length,skipped:dilewati};
}

function cocurricularKey(session,studentId){return `${scopeKey(session)}|${studentId}`;}
function normalizeCocurricular(input){const record={activity:clean(input?.activity||input?.projectTitle||input?.theme,180),predicate:clean(input?.predicate,50),description:clean(input?.description,1200)};if(!record.activity)throw new Error('Kegiatan kokurikuler wajib diisi.');if(!knownPredicate(record.predicate))throw new Error('Predikat kokurikuler tidak valid.');if(!record.description)throw new Error('Deskripsi kokurikuler wajib diisi.');return record;}

export function getStudentCocurricular(session,studentId){requireStudent(session,studentId);const record=loadDb().cocurricularScores?.[cocurricularKey(session,studentId)];return record?clone(record):null;}

export function saveStudentCocurricular(session,studentId,input){requireStudent(session,studentId);const value=normalizeCocurricular(input);let saved;updateDb(db=>{const key=cocurricularKey(session,studentId);const existing=db.cocurricularScores[key];const now=new Date().toISOString();saved=scopedRecord(session,studentId,{...value,createdAt:existing?.createdAt||now,updatedAt:now});db.cocurricularScores[key]=saved;return db;});return clone(saved);}

/* Terapkan ke Semua Siswa untuk kokurikuler, juga dalam satu commit. */
export function saveCocurricularBulk(session,input,{overwrite=true}={}){
  assertTeacher(session);
  const predicate=clean(input?.predicate,50);
  const value=normalizeCocurricular({...input,description:clean(input?.description,1200)||cocurricularDescriptionTemplates(session.classId,predicate,input?.activity)[0]});
  const students=listStudents(session,{classId:session.classId});
  const saved=[];let dilewati=0;
  updateDb(db=>{
    const now=new Date().toISOString();
    students.forEach(student=>{
      const key=cocurricularKey(session,student.id);
      const existing=db.cocurricularScores[key];
      if(existing&&!overwrite){dilewati+=1;saved.push(clone(existing));return;}
      const record=scopedRecord(session,student.id,{...value,createdAt:existing?.createdAt||now,updatedAt:now});
      db.cocurricularScores[key]=record;
      saved.push(record);
    });
    return db;
  });
  return {saved:clone(saved),studentCount:students.length,skipped:dilewati};
}

export function createExtracurricular(session,studentId,input){
  requireStudent(session,studentId);const value=normalizeActivity(input);let saved;
  updateDb(db=>{const now=new Date().toISOString();const id=input?.id||newId('extracurricular');const order=Object.values(db.extracurricularScores||{}).filter(item=>item.classId===session.classId&&item.studentId===studentId&&item.semester===session.semester&&item.academicYear===session.academicYear).length+1;saved=scopedRecord(session,studentId,{...value,id,order,createdAt:now,updatedAt:now});db.extracurricularScores[activityKey(session,studentId,id)]=saved;return db;});
  return clone(saved);
}

export function updateExtracurricular(session,studentId,id,input){
  requireStudent(session,studentId);const value=normalizeActivity(input);let saved;
  updateDb(db=>{const key=activityKey(session,studentId,id);const existing=db.extracurricularScores[key];if(!existing)throw new Error('Data ekstrakurikuler tidak ditemukan pada scope aktif.');saved={...existing,...value,updatedAt:new Date().toISOString()};db.extracurricularScores[key]=saved;return db;});
  return clone(saved);
}

export function deleteExtracurricular(session,studentId,id){
  requireStudent(session,studentId);let removed=false;
  updateDb(db=>{const key=activityKey(session,studentId,id);if(!db.extracurricularScores[key])throw new Error('Data ekstrakurikuler tidak ditemukan pada scope aktif.');delete db.extracurricularScores[key];removed=true;return db;});return removed;
}

export function getHomeroomNote(session,studentId){
  requireStudent(session,studentId);const record=loadDb().homeroomNotes[studentKey(session,studentId)];return record?clone(record):null;
}

/* Catatan massal. Secara bawaan hanya mengisi siswa yang catatannya masih kosong sehingga
   catatan individual tidak tertimpa. Timpa hanya terjadi bila pemanggil sudah meminta
   konfirmasi guru dan mengirim overwrite:true. */
export function saveHomeroomNoteBulk(session,note,{overwrite=false}={}){
  assertTeacher(session);const text=clean(note,2000);if(!text)throw new Error('Catatan wali kelas wajib diisi.');
  const students=listStudents(session,{classId:session.classId});
  if(!students.length)throw new Error('Belum ada siswa pada rombel ini.');
  const saved=[];const skipped=[];
  students.forEach(student=>{
    const existing=getHomeroomNote(session,student.id);
    if(existing?.text&&!overwrite){skipped.push(student.id);return;}
    saved.push(saveHomeroomNote(session,student.id,text));
  });
  return {saved:saved.length,skipped:skipped.length,skippedIds:skipped,total:students.length,overwrite};
}

export function saveHomeroomNote(session,studentId,note){
  requireStudent(session,studentId);const text=clean(note,2000);if(!text)throw new Error('Catatan wali kelas wajib diisi.');let saved;
  updateDb(db=>{const key=studentKey(session,studentId);const existing=db.homeroomNotes[key];const now=new Date().toISOString();saved=scopedRecord(session,studentId,{text,createdAt:existing?.createdAt||now,updatedAt:now});db.homeroomNotes[key]=saved;return db;});return clone(saved);
}

export function getPromotionStatus(session,studentId){
  requireStudent(session,studentId);const record=loadDb().promotionStatus[studentKey(session,studentId)];return record?clone(record):null;
}

export function savePromotionStatus(session,studentId,status){
  requireStudent(session,studentId);const grade=gradeOf(session.classId);if(grade===6)throw new Error('Kelas 6 menggunakan struktur status kelulusan terpisah.');if(!PROMOTION_STATUSES.some(item=>item.id===status))throw new Error('Status kenaikan kelas tidak valid.');let saved;
  updateDb(db=>{const key=studentKey(session,studentId);const existing=db.promotionStatus[key];const now=new Date().toISOString();const letter=session.classId.slice(1);saved=scopedRecord(session,studentId,{status,targetClass:status==='PROMOTED'?`${grade+1}${letter}`:session.classId,createdAt:existing?.createdAt||now,updatedAt:now});db.promotionStatus[key]=saved;return db;});return clone(saved);
}

export function getGraduationStatus(session,studentId){
  requireStudent(session,studentId);if(gradeOf(session.classId)!==6)throw new Error('Struktur kelulusan hanya tersedia untuk Kelas 6.');const record=loadDb().graduationStatus[studentKey(session,studentId)];return record?clone(record):null;
}

export function prepareGraduationStatus(session,studentId){
  requireStudent(session,studentId);if(gradeOf(session.classId)!==6)throw new Error('Struktur kelulusan hanya tersedia untuk Kelas 6.');let saved;
  updateDb(db=>{const key=studentKey(session,studentId);const existing=db.graduationStatus[key];const now=new Date().toISOString();saved=existing||scopedRecord(session,studentId,{status:null,prepared:true,resultType:'GRADUATION',createdAt:now,updatedAt:now});db.graduationStatus[key]=saved;return db;});return clone(saved);
}

export function saveGraduationStatus(session,studentId,status){
  requireStudent(session,studentId);if(gradeOf(session.classId)!==6)throw new Error('Status kelulusan hanya tersedia untuk Kelas 6.');if(!GRADUATION_STATUSES.some(item=>item.id===status))throw new Error('Status kelulusan tidak valid.');let saved;
  updateDb(db=>{const key=studentKey(session,studentId);const existing=db.graduationStatus[key];const now=new Date().toISOString();saved=scopedRecord(session,studentId,{...existing,status,prepared:true,resultType:'GRADUATION',createdAt:existing?.createdAt||now,updatedAt:now});db.graduationStatus[key]=saved;return db;});return clone(saved);
}
