import { loadDb, updateDb } from './storage.js';
import { listStudents, resolveStudentClass, studentScope } from './students.js';

export const ATTENDANCE_STATUSES=['Hadir','Sakit','Izin','Alpa'];

function clone(value){return JSON.parse(JSON.stringify(value));}
function emptyCounts(){return {Hadir:0,Sakit:0,Izin:0,Alpa:0};}
function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))) return false;
  const parsed=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10)===value;
}
function validMonth(value){return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value||''));}

function attendanceEntries(db,session,classId){
  const scope=studentScope(session,classId);
  return Object.entries(db.attendance||{}).filter(([key])=>key.startsWith(`${scope}|`));
}

export function getAttendance(session,date,{classId}={}){
  if(!validDate(date)) throw new Error('Tanggal absensi tidak valid.');
  const targetClass=resolveStudentClass(session,classId||session.classId);
  const key=`${studentScope(session,targetClass)}|${date}`;
  const record=loadDb().attendance[key];
  return record?clone(record):null;
}

export function saveAttendance(session,date,statuses,{classId}={}){
  if(!validDate(date)) throw new Error('Tanggal absensi tidak valid.');
  const targetClass=resolveStudentClass(session,classId||session.classId);
  const students=listStudents(session,{classId:targetClass});
  if(!students.length) throw new Error('Belum ada siswa pada rombel ini.');
  const statusMap=statuses&&typeof statuses==='object'?statuses:{};
  const studentIds=new Set(students.map(student=>student.id));
  const unknownIds=Object.keys(statusMap).filter(id=>!studentIds.has(id));
  if(unknownIds.length) throw new Error('Absensi memuat siswa di luar scope rombel aktif.');
  const normalized={};
  students.forEach(student=>{
    const status=statusMap[student.id];
    if(!ATTENDANCE_STATUSES.includes(status)) throw new Error(`Pilih status absensi untuk ${student.name}.`);
    normalized[student.id]=status;
  });
  const key=`${studentScope(session,targetClass)}|${date}`;
  let saved;
  updateDb(db=>{
    const existing=db.attendance[key];
    const now=new Date().toISOString();
    saved={
      date,classId:targetClass,semester:session.semester,academicYear:session.academicYear,
      statuses:normalized,createdAt:existing?.createdAt||now,updatedAt:now
    };
    db.attendance[key]=saved;
    return db;
  });
  return clone(saved);
}

export function dailyAttendanceRecap(session,date,{classId}={}){
  const targetClass=resolveStudentClass(session,classId||session.classId);
  const record=getAttendance(session,date,{classId:targetClass});
  const totals=emptyCounts();
  Object.values(record?.statuses||{}).forEach(status=>{if(ATTENDANCE_STATUSES.includes(status))totals[status]+=1;});
  return {date,classId:targetClass,saved:Boolean(record),totals,total:Object.values(totals).reduce((sum,value)=>sum+value,0)};
}

function rangeRecap(session,{classId,month=null}){
  const targetClass=resolveStudentClass(session,classId||session.classId);
  if(month!==null && !validMonth(month)) throw new Error('Bulan rekap tidak valid.');
  const records=attendanceEntries(loadDb(),session,targetClass)
    .map(([,record])=>record)
    .filter(record=>!month || record.date.startsWith(`${month}-`))
    .sort((a,b)=>a.date.localeCompare(b.date));
  const students=listStudents(session,{classId:targetClass});
  const studentTotals=new Map(students.map(student=>[student.id,emptyCounts()]));
  const totals=emptyCounts();
  records.forEach(record=>Object.entries(record.statuses||{}).forEach(([studentId,status])=>{
    if(!ATTENDANCE_STATUSES.includes(status)) return;
    totals[status]+=1;
    const counts=studentTotals.get(studentId);if(counts)counts[status]+=1;
  }));
  return {
    classId:targetClass,month,dates:records.map(record=>record.date),daysRecorded:records.length,totals,
    students:students.map(student=>({id:student.id,nis:student.nis,name:student.name,...studentTotals.get(student.id)}))
  };
}

export function monthlyAttendanceRecap(session,month,{classId}={}){return rangeRecap(session,{classId,month});}

/* ------------------------------------------------------------- REKAP MANUAL SATU SEMESTER

   Banyak guru tidak mengisi absensi hari demi hari dan baru merekap ketika akan membuat rapor.
   Untuk mereka disediakan input manual: total Sakit, Izin, dan Alpa satu semester per siswa.

   PENCEGAHAN DOUBLE COUNT.

   Rekap manual dan absensi harian TIDAK PERNAH dijumlahkan. Keduanya mewakili periode yang
   sama - satu semester berjalan - sehingga menjumlahkannya akan menghitung ketidakhadiran yang
   sama dua kali. Aturannya tegas dan hanya satu: bila seorang siswa mempunyai rekap manual pada
   scope aktif, angka manual itulah yang berlaku untuk siswa tersebut; bila tidak ada, angka
   dihitung dari absensi hariannya. Keputusan diambil PER SISWA, sehingga satu rombel boleh
   bercampur - sebagian direkap manual, sebagian diabsen harian - tanpa saling merusak.

   Setiap baris rekap membawa `source` ('manual' atau 'harian') supaya asalnya dapat diperiksa,
   diuji, dan ditampilkan kepada guru. */

function manualKey(session,classId,studentId){return `${studentScope(session,classId)}|${studentId}`;}

export function getManualAttendance(session,studentId,{classId}={}){
  const targetClass=resolveStudentClass(session,classId||session.classId);
  const record=loadDb().manualAttendance?.[manualKey(session,targetClass,studentId)];
  return record?clone(record):null;
}

export function listManualAttendance(session,{classId}={}){
  const targetClass=resolveStudentClass(session,classId||session.classId);
  const prefix=`${studentScope(session,targetClass)}|`;
  return Object.entries(loadDb().manualAttendance||{})
    .filter(([key])=>key.startsWith(prefix)).map(([,record])=>clone(record));
}

function angkaRekap(value,label){
  const jumlah=Number(value);
  if(!Number.isInteger(jumlah)||jumlah<0)throw new Error(`Jumlah ${label} harus bilangan bulat tidak negatif.`);
  if(jumlah>250)throw new Error(`Jumlah ${label} melebihi batas wajar satu semester.`);
  return jumlah;
}

/* Menyimpan rekap manual satu siswa. Menghapusnya cukup dengan clearManualAttendance, sehingga
   guru dapat kembali memakai absensi harian tanpa kehilangan satu pun catatan hariannya. */
export function saveManualAttendance(session,studentId,{Sakit=0,Izin=0,Alpa=0,note=''}={},{classId}={}){
  const targetClass=resolveStudentClass(session,classId||session.classId);
  const student=listStudents(session,{classId:targetClass}).find(item=>item.id===studentId);
  if(!student)throw new Error('Siswa tidak ditemukan pada rombel aktif.');
  const nilai={Sakit:angkaRekap(Sakit,'Sakit'),Izin:angkaRekap(Izin,'Izin'),Alpa:angkaRekap(Alpa,'Alpa')};
  const key=manualKey(session,targetClass,studentId);
  let saved;
  updateDb(db=>{
    if(!db.manualAttendance)db.manualAttendance={};
    const existing=db.manualAttendance[key];
    const now=new Date().toISOString();
    saved={studentId,classId:targetClass,semester:session.semester,academicYear:session.academicYear,
      ...nilai,note:String(note||'').trim().slice(0,300),
      createdAt:existing?.createdAt||now,updatedAt:now};
    db.manualAttendance[key]=saved;
    return db;
  });
  return clone(saved);
}

export function clearManualAttendance(session,studentId,{classId}={}){
  const targetClass=resolveStudentClass(session,classId||session.classId);
  const key=manualKey(session,targetClass,studentId);
  let removed=false;
  updateDb(db=>{
    if(db.manualAttendance&&db.manualAttendance[key]){delete db.manualAttendance[key];removed=true;}
    return db;
  });
  return removed;
}

/* Rekap satu semester penuh: seluruh absensi harian pada scope aktif, DITIMPA rekap manual pada
   siswa yang memilikinya. Tidak pernah memakai bulan yang sedang dibuka di layar sebagai batas -
   berpindah bulan di UI tidak boleh menghilangkan bulan sebelumnya dari rapor. */
export function semesterAttendanceRecap(session,{classId}={}){
  const dasar=rangeRecap(session,{classId,month:null});
  const manual=new Map(listManualAttendance(session,{classId}).map(item=>[item.studentId,item]));
  if(!manual.size)return {...dasar,students:dasar.students.map(item=>({...item,source:'harian'}))};
  const totals=emptyCounts();
  const students=dasar.students.map(student=>{
    const rekap=manual.get(student.id);
    /* Kehadiran harian siswa yang direkap manual tetap ditampilkan apa adanya; yang diganti
       hanya angka ketidakhadirannya, karena itulah yang dinyatakan guru. */
    const baris=rekap
      ? {...student,Sakit:rekap.Sakit,Izin:rekap.Izin,Alpa:rekap.Alpa,source:'manual'}
      : {...student,source:'harian'};
    ATTENDANCE_STATUSES.forEach(status=>{totals[status]+=baris[status]||0;});
    return baris;
  });
  return {...dasar,totals,students,manualCount:manual.size};
}

export function studentAbsenceTotals(session,studentId,{classId}={}){
  const recap=semesterAttendanceRecap(session,{classId});
  const student=recap.students.find(item=>item.id===studentId);
  return student
    ?{Sakit:student.Sakit,Izin:student.Izin,Alpa:student.Alpa,source:student.source||'harian'}
    :{Sakit:0,Izin:0,Alpa:0,source:'harian'};
}
