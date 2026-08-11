import { SEED_ACADEMIC_YEAR, SEED_CLASS_ID, SEED_SEMESTER, STUDENTS_5B } from '../data/seed-5b.js';
import { loadDb, updateDb } from './storage.js';

export const SEED_FLAG_KEY='seed|data-awal-5b';

function clone(value){return JSON.parse(JSON.stringify(value));}
function scopePrefix(){return `${SEED_ACADEMIC_YEAR}|${SEED_SEMESTER}|${SEED_CLASS_ID}|`;}
function seedId(nisn,nis,index){return `seed-5b-${String(nisn||nis||index+1).trim()}`;}

/* Data awal hanya diisi sekali. Selain penanda di settings, setiap baris juga dicocokkan
   dengan NISN/NIS yang sudah ada supaya menjalankan seed ulang tidak pernah menggandakan data. */
export function seedInitialStudents(){
  const db=loadDb();
  const done=Boolean(db.settings?.[SEED_FLAG_KEY]?.completedAt);
  const prefix=scopePrefix();
  const existing=Object.entries(db.students||{}).filter(([key])=>key.startsWith(prefix)).map(([,student])=>student);
  if(done)return {seeded:0,skipped:STUDENTS_5B.length,already:true};

  const takenNisn=new Set(existing.map(student=>String(student.nisn||'').trim()).filter(Boolean));
  const takenNis=new Set(existing.map(student=>String(student.nis||'').trim()).filter(Boolean));
  const now=new Date().toISOString();
  let seeded=0,skipped=0;

  updateDb(next=>{
    STUDENTS_5B.forEach((row,index)=>{
      const nisn=String(row.nisn||'').trim(),nis=String(row.nis||'').trim();
      if((nisn&&takenNisn.has(nisn))||(nis&&nis!=='-'&&takenNis.has(nis))){skipped+=1;return;}
      const id=seedId(nisn,nis,index);
      const key=`${prefix}${id}`;
      if(next.students[key]){skipped+=1;return;}
      next.students[key]={...clone(row),id,classId:SEED_CLASS_ID,photo:'',
        academicYear:SEED_ACADEMIC_YEAR,semester:SEED_SEMESTER,createdAt:now,updatedAt:now};
      if(nisn)takenNisn.add(nisn);
      if(nis&&nis!=='-')takenNis.add(nis);
      seeded+=1;
    });
    next.settings[SEED_FLAG_KEY]={completedAt:now,classId:SEED_CLASS_ID,academicYear:SEED_ACADEMIC_YEAR,semester:SEED_SEMESTER,count:seeded};
    return next;
  });
  return {seeded,skipped,already:false};
}

export function seedStatus(){
  const db=loadDb();
  const prefix=scopePrefix();
  return {
    flagged:Boolean(db.settings?.[SEED_FLAG_KEY]?.completedAt),
    count:Object.keys(db.students||{}).filter(key=>key.startsWith(prefix)).length,
    classId:SEED_CLASS_ID,academicYear:SEED_ACADEMIC_YEAR,semester:SEED_SEMESTER,
  };
}
