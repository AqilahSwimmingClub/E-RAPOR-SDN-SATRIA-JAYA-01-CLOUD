import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR } from '../src/data/constants.js';
import {
  buildDapodikScoreQueue, listDapodikSyncLogs, recordDapodikPushResult, retryableDapodikScores
} from '../src/services/dapodik-sync.js';
import { loadDb, updateDb } from '../src/services/storage.js';

function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};globalThis.sessionStorage=globalThis.localStorage;}
const ganjil=`Ganjil ${ACADEMIC_YEAR}`;
const admin={role:'admin',classId:null,accountId:'admin',academicYear:ACADEMIC_YEAR,semester:ganjil};
const guru={role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:ganjil};

function seedStudent(record){
  const student={academicYear:ACADEMIC_YEAR,semester:ganjil,isActive:true,gender:'P',classId:'5B',...record};
  updateDb(db=>{db.students[`${ACADEMIC_YEAR}|${ganjil}|${student.classId}|${student.id}`]=student;return db;});
  return student;
}
function seedScore(studentId,subjectId,finalScore,classId='5B'){
  updateDb(db=>{
    db.reportScores[`${ACADEMIC_YEAR}|${ganjil}|${classId}|${subjectId}|${studentId}`]={
      studentId,subjectId,finalScore,kktp:70,masteryStatus:'TUNTAS',updatedAt:'2026-09-01T00:00:00.000Z'
    };
    return db;
  });
}
function seedMapping(){
  updateDb(db=>{db.dapodikMappings={'subject|agama':{dapodikId:'mp-agama'},'subject|matematika':{dapodikId:'mp-mtk'}};return db;});
}
function seedMappedReportScores(){
  seedMapping();
  seedStudent({id:'s-1',dapodikId:'pd-1',nisn:'0012345678',name:'Alya',origin:'dapodik'});
  seedScore('s-1','agama',85);
  seedScore('s-1','matematika',90);
}
function seedManualStudentWithScore(){
  seedMapping();
  seedStudent({id:'m-1',nisn:'0012345679',name:'Siswa Manual',origin:'manual-teacher'});
  seedScore('m-1','agama',80);
}

test('Antrean memakai ID stabil dan hanya memuat nilai yang terpetakan',()=>{
  useMemoryStorage();seedMappedReportScores();
  const queue=buildDapodikScoreQueue(admin);
  assert.equal(queue.items.length,2);
  assert.equal(queue.blocked.length,0);
  assert.equal(new Set(queue.items.map(item=>item.queueId)).size,2);
  const lagi=buildDapodikScoreQueue(admin);
  assert.deepEqual(lagi.items.map(item=>item.queueId).sort(),queue.items.map(item=>item.queueId).sort(),'ID stabil antar pemanggilan');
  assert.equal(queue.items[0].dapodikStudentId,'pd-1');
  assert.ok(['mp-agama','mp-mtk'].includes(queue.items[0].dapodikSubjectId));
});

test('Antrean memblokir siswa lokal tanpa pemetaan siswa Dapodik',()=>{
  useMemoryStorage();seedManualStudentWithScore();
  const queue=buildDapodikScoreQueue(admin);
  assert.equal(queue.blocked[0].reasonCode,'STUDENT_NOT_MAPPED');
  assert.equal(queue.items.length,0);
  /* Alasan blokir tidak boleh membocorkan NISN atau nama. */
  assert.doesNotMatch(JSON.stringify(queue.blocked),/0012345679|Siswa Manual/);
});

test('Mapel tanpa pemetaan Dapodik diblokir terpisah',()=>{
  useMemoryStorage();
  seedStudent({id:'s-1',dapodikId:'pd-1',nisn:'0012345678',name:'Alya',origin:'dapodik'});
  seedScore('s-1','agama',85);
  const queue=buildDapodikScoreQueue(admin);
  assert.equal(queue.items.length,0);
  assert.equal(queue.blocked[0].reasonCode,'SUBJECT_NOT_MAPPED');
});

test('Coba ulang hanya mengirim catatan yang gagal',()=>{
  useMemoryStorage();seedMappedReportScores();
  const queue=buildDapodikScoreQueue(admin);
  recordDapodikPushResult(admin,{items:[
    {queueId:queue.items[0].queueId,status:'success'},
    {queueId:queue.items[1].queueId,status:'failed',reasonCode:'HTTP_500'}
  ]});
  const retry=retryableDapodikScores(admin);
  assert.deepEqual(retry.map(item=>item.queueId),[queue.items[1].queueId]);
});

test('Catatan berhasil tidak pernah dikirim ulang walau antrean dibangun lagi',()=>{
  useMemoryStorage();seedMappedReportScores();
  const queue=buildDapodikScoreQueue(admin);
  recordDapodikPushResult(admin,{items:queue.items.map(item=>({queueId:item.queueId,status:'success'}))});
  assert.deepEqual(retryableDapodikScores(admin),[]);
  const kedua=buildDapodikScoreQueue(admin);
  assert.equal(kedua.summary.success,2);
  assert.equal(kedua.summary.ready,0,'nilai yang sudah terkirim tidak masuk antrean siap kirim');
});

test('Nilai yang berubah setelah terkirim masuk antrean lagi',()=>{
  useMemoryStorage();seedMappedReportScores();
  const queue=buildDapodikScoreQueue(admin);
  recordDapodikPushResult(admin,{items:queue.items.map(item=>({queueId:item.queueId,status:'success'}))});
  updateDb(db=>{db.reportScores[`${ACADEMIC_YEAR}|${ganjil}|5B|agama|s-1`].finalScore=95;db.reportScores[`${ACADEMIC_YEAR}|${ganjil}|5B|agama|s-1`].updatedAt='2026-09-02T00:00:00.000Z';return db;});
  const kedua=buildDapodikScoreQueue(admin);
  assert.equal(kedua.summary.ready,1,'nilai yang direvisi wajib dikirim ulang');
});

test('Ringkasan menghitung siap, berhasil, gagal, dan terblokir',()=>{
  useMemoryStorage();seedMappedReportScores();seedManualStudentWithScore();
  const queue=buildDapodikScoreQueue(admin);
  assert.equal(queue.summary.ready,2);
  assert.equal(queue.summary.blocked,1);
  recordDapodikPushResult(admin,{items:[{queueId:queue.items[0].queueId,status:'failed',reasonCode:'HTTP_500'}]});
  const kedua=buildDapodikScoreQueue(admin);
  assert.equal(kedua.summary.failed,1);
});

test('Hasil pengiriman dicatat sebagai log push yang aman',()=>{
  useMemoryStorage();seedMappedReportScores();
  const queue=buildDapodikScoreQueue(admin);
  recordDapodikPushResult(admin,{items:[
    {queueId:queue.items[0].queueId,status:'success'},
    {queueId:queue.items[1].queueId,status:'failed',reasonCode:'HTTP_500',message:'Bearer SECRET ditolak untuk NISN 0012345678'}
  ]});
  const logs=listDapodikSyncLogs(admin).filter(item=>item.operation==='push');
  assert.equal(logs.length,1);
  assert.equal(logs[0].counts.sent.scores,1);
  assert.equal(logs[0].counts.failed.scores,1);
  const text=JSON.stringify(logs.concat(Object.values(loadDb().dapodikSyncState||{})));
  assert.doesNotMatch(text,/0012345678|Alya|Bearer|SECRET/i);
});

test('Antrean dan pencatatan hanya untuk Admin',()=>{
  useMemoryStorage();seedMappedReportScores();
  assert.throws(()=>buildDapodikScoreQueue(guru),/Hanya Admin/);
  assert.throws(()=>recordDapodikPushResult(guru,{items:[]}),/Hanya Admin/);
  assert.throws(()=>retryableDapodikScores(guru),/Hanya Admin/);
});
