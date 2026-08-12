import { SUBJECTS_DEFAULT } from '../data/constants.js';
import { SEED_ACADEMIC_YEAR, SEED_CLASS_ID, SEED_SEMESTER, STUDENTS_5B } from '../data/seed-5b.js';
import { normalizeMappingGroups } from './mapping.js';
import { loadDb, updateDb } from './storage.js';

export const SEED_FLAG_KEY='seed|data-awal-5b';

function clone(value){return JSON.parse(JSON.stringify(value));}
function scopePrefix(){return `${SEED_ACADEMIC_YEAR}|${SEED_SEMESTER}|${SEED_CLASS_ID}|`;}
function seedId(row,index){return `seed-5b-${String(row.nisn||row.nis||index+1).trim()}`;}
function trimmed(value){return String(value??'').trim();}

/* Data awal 5B ikut terisi pada instalasi lama yang belum pernah menerimanya, termasuk bila
   penanda sudah ada tetapi datanya belum lengkap. Idempotensi tidak bergantung pada penanda
   saja melainkan pada isi data:
   - baris yang id-nya sudah pernah dimasukkan tidak diulang, sehingga siswa yang sengaja
     dihapus guru tidak muncul lagi;
   - baris yang NISN/NIS-nya sudah dipakai siswa lain dilewati, sehingga tidak ada duplikat
     dan data buatan guru tidak pernah tertimpa. */
export function seedInitialStudents(){
  const db=loadDb();
  const prefix=scopePrefix();
  const marker=db.settings?.[SEED_FLAG_KEY]||{};
  const alreadySeeded=new Set(Array.isArray(marker.seededIds)?marker.seededIds:[]);
  const existing=Object.entries(db.students||{}).filter(([key])=>key.startsWith(prefix)).map(([,student])=>student);
  const takenNisn=new Set(existing.map(student=>trimmed(student.nisn)).filter(Boolean));
  const takenNis=new Set(existing.map(student=>trimmed(student.nis)).filter(value=>value&&value!=='-'));
  const existingIds=new Set(existing.map(student=>student.id));

  const pending=STUDENTS_5B.map((row,index)=>({row,id:seedId(row,index)})).filter(({row,id})=>{
    if(alreadySeeded.has(id)||existingIds.has(id))return false;
    const nisn=trimmed(row.nisn),nis=trimmed(row.nis);
    if(nisn&&takenNisn.has(nisn))return false;
    if(nis&&nis!=='-'&&takenNis.has(nis))return false;
    return true;
  });

  const now=new Date().toISOString();
  const inserted=[];
  if(pending.length){
    updateDb(next=>{
      pending.forEach(({row,id})=>{
        const key=`${prefix}${id}`;
        if(next.students[key])return;
        next.students[key]={...clone(row),id,classId:SEED_CLASS_ID,photo:'',
          academicYear:SEED_ACADEMIC_YEAR,semester:SEED_SEMESTER,createdAt:now,updatedAt:now};
        inserted.push(id);
      });
      return next;
    });
  }

  if(inserted.length||!marker.completedAt){
    updateDb(next=>{
      const previous=next.settings[SEED_FLAG_KEY]||{};
      const ids=new Set([...(Array.isArray(previous.seededIds)?previous.seededIds:[]),...inserted]);
      next.settings[SEED_FLAG_KEY]={...previous,completedAt:previous.completedAt||now,updatedAt:now,
        classId:SEED_CLASS_ID,academicYear:SEED_ACADEMIC_YEAR,semester:SEED_SEMESTER,
        seededIds:[...ids],count:ids.size};
      return next;
    });
  }
  return {seeded:inserted.length,skipped:STUDENTS_5B.length-inserted.length,total:STUDENTS_5B.length};
}

/* Mapel bawaan baru, misalnya Seni Rupa, disisipkan ke master dan ke setiap Mapping rombel
   yang sudah tersimpan. Bersifat menambah saja: nama, urutan, kelompok, dan status aktif
   yang sudah diatur guru tidak pernah diubah. Berjalan setiap startup sebagai pengaman bila
   migration schema terlewat pada sebuah perangkat.

   Mapel baru masuk dalam keadaan nonaktif supaya Leger dan kelengkapan rapor rombel yang
   sedang berjalan tidak berubah. Guru mengaktifkannya lewat Mapping saat siap. */
export function ensureDefaultSubjects(){
  const db=loadDb();
  const missingIn=list=>{
    const known=new Set((Array.isArray(list)?list:[]).map(item=>item?.id).filter(Boolean));
    return SUBJECTS_DEFAULT.filter(subject=>!known.has(subject.id));
  };
  const mappingsToFix=Object.entries(db.subjectMappings||{})
    .filter(([,mapping])=>Array.isArray(mapping)&&missingIn(mapping).length);
  if(!mappingsToFix.length)return {repairedMappings:0,addedSubjects:[]};

  const added=new Set();
  updateDb(next=>{
    mappingsToFix.forEach(([key])=>{
      const mapping=next.subjectMappings[key];
      if(!Array.isArray(mapping))return;
      const tambahan=missingIn(mapping);
      tambahan.forEach(subject=>added.add(subject.id));
      next.subjectMappings[key]=normalizeMappingGroups([...mapping,...tambahan.map(subject=>({...subject,active:false}))]);
    });
    return next;
  });
  return {repairedMappings:mappingsToFix.length,addedSubjects:[...added]};
}

export function seedStatus(){
  const db=loadDb();
  const prefix=scopePrefix();
  const marker=db.settings?.[SEED_FLAG_KEY]||{};
  return {
    flagged:Boolean(marker.completedAt),
    seededIds:Array.isArray(marker.seededIds)?marker.seededIds.length:0,
    count:Object.keys(db.students||{}).filter(key=>key.startsWith(prefix)).length,
    classId:SEED_CLASS_ID,academicYear:SEED_ACADEMIC_YEAR,semester:SEED_SEMESTER,
  };
}
