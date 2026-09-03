import { loadDb, scopeKey, updateDb } from './storage.js';
import { requireActiveSubject } from './subjects.js';

function clone(value){return JSON.parse(JSON.stringify(value));}
function newId(){return globalThis.crypto?.randomUUID?.() || `tp-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}
function prefix(session,subjectId){return `${scopeKey(session)}|${subjectId}|`;}
function key(session,subjectId,id){return `${prefix(session,subjectId)}${id}`;}
function clean(value,max){return String(value??'').trim().slice(0,max);}

function entries(db,session,subjectId){
  const scopedPrefix=prefix(session,subjectId);
  return Object.entries(db.learningObjectives||{}).filter(([recordKey])=>recordKey.startsWith(scopedPrefix));
}
export function phaseForClass(classId){const grade=Number.parseInt(String(classId||''),10);if(grade<=2)return 'A';if(grade<=4)return 'B';if(grade<=6)return 'C';throw new Error('Rombel tidak valid untuk menentukan fase TP.');}
function nextCode(records){const highest=records.reduce((max,record)=>Math.max(max,Number.parseInt(String(record.code||'').match(/(\d+)$/)?.[1]||'0',10)),0);return `TP-${highest+1}`;}
function validateInput(input,records,excludeId=null,expectedPhase,{code=null}={}){
  const resolvedCode=clean(code||records.find(record=>record.id===excludeId)?.code||nextCode(records),40);const description=clean(input?.description,1000);
  const errors=[];
  if(!description) errors.push('Deskripsi TP wajib diisi.');
  if(input?.phase && input.phase!==expectedPhase) errors.push(`Fase TP untuk Kelas ${String(input?.classId||'').trim()||''} wajib Fase ${expectedPhase}.`);
  if(records.some(record=>record.id!==excludeId && String(record.code||'').toLowerCase()===resolvedCode.toLowerCase())) errors.push(`Kode TP ${resolvedCode} sudah digunakan pada mapel ini.`);
  if(errors.length) throw new Error(errors.join(' '));
  /* Elemen CP yang diturunkan TP ini. Boleh kosong: TP buatan guru tidak wajib ditautkan. */
  const cpElementId=input?.cpElementId===undefined?undefined:(clean(input.cpElementId,120)||null);
  return {code:resolvedCode,description,phase:expectedPhase,active:input?.active!==false,
    ...(cpElementId===undefined?{}:{cpElementId})};
}
function normalizeOrders(db,session,subjectId){
  entries(db,session,subjectId)
    .map(([,record])=>record)
    .sort((a,b)=>a.order-b.order)
    .forEach((record,index)=>{db.learningObjectives[key(session,subjectId,record.id)]={...record,order:index+1};});
}

export function listLearningObjectives(session,subjectId,{activeOnly=false}={}){
  requireActiveSubject(session,subjectId);
  return entries(loadDb(),session,subjectId)
    .map(([,record])=>({...clone(record),phase:record.phase||phaseForClass(session.classId)}))
    .filter(record=>!activeOnly || record.active)
    .sort((a,b)=>a.order-b.order);
}

export function createLearningObjective(session,subjectId,input){
  requireActiveSubject(session,subjectId);let created;
  updateDb(db=>{
    const records=entries(db,session,subjectId).map(([,record])=>record);
    const normalized=validateInput(input,records,null,phaseForClass(session.classId),{code:nextCode(records)});
    const now=new Date().toISOString();const id=newId();
    created={...normalized,id,subjectId,classId:session.classId,semester:session.semester,academicYear:session.academicYear,order:records.length+1,createdAt:now,updatedAt:now};
    db.learningObjectives[key(session,subjectId,id)]=created;return db;
  });
  return clone(created);
}

export function updateLearningObjective(session,subjectId,id,input){
  requireActiveSubject(session,subjectId);let updated;
  updateDb(db=>{
    const scopedEntries=entries(db,session,subjectId);const existing=scopedEntries.find(([,record])=>record.id===id)?.[1];
    if(!existing) throw new Error('Tujuan Pembelajaran tidak ditemukan pada scope aktif.');
    const normalized=validateInput(input,scopedEntries.map(([,record])=>record),id,phaseForClass(session.classId),{code:existing.code});
    updated={...existing,...normalized,updatedAt:new Date().toISOString()};
    db.learningObjectives[key(session,subjectId,id)]=updated;return db;
  });
  return clone(updated);
}

export function deleteLearningObjective(session,subjectId,id){
  requireActiveSubject(session,subjectId);
  updateDb(db=>{
    const recordKey=entries(db,session,subjectId).find(([,record])=>record.id===id)?.[0];
    if(!recordKey) throw new Error('Tujuan Pembelajaran tidak ditemukan pada scope aktif.');
    delete db.learningObjectives[recordKey];normalizeOrders(db,session,subjectId);return db;
  });
  return true;
}

export function setLearningObjectiveActive(session,subjectId,id,active){
  const existing=listLearningObjectives(session,subjectId).find(record=>record.id===id);
  if(!existing) throw new Error('Tujuan Pembelajaran tidak ditemukan pada scope aktif.');
  return updateLearningObjective(session,subjectId,id,{...existing,active:Boolean(active)});
}

export function reorderLearningObjective(session,subjectId,id,direction){
  requireActiveSubject(session,subjectId);
  if(![-1,1].includes(direction)) throw new Error('Arah urutan TP tidak valid.');
  updateDb(db=>{
    const records=entries(db,session,subjectId).map(([,record])=>record).sort((a,b)=>a.order-b.order);
    const index=records.findIndex(record=>record.id===id);const target=index+direction;
    if(index<0) throw new Error('Tujuan Pembelajaran tidak ditemukan pada scope aktif.');
    if(target<0 || target>=records.length) return db;
    [records[index],records[target]]=[records[target],records[index]];
    records.forEach((record,order)=>{db.learningObjectives[key(session,subjectId,record.id)]={...record,order:order+1,updatedAt:new Date().toISOString()};});
    return db;
  });
  return listLearningObjectives(session,subjectId);
}
