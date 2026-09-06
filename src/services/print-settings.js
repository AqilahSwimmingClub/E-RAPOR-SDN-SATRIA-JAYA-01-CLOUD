import { getSchoolMaster, getTeacherProfile } from './master.js';
import { loadDb, scopeKey, updateDb } from './storage.js';

const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function clone(value){return JSON.parse(JSON.stringify(value));}
function clean(value,max=180){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max);}
function key(session){return `${scopeKey(session)}|document-print-settings`;}
const PAPER_SIZES=['A4','F4','Letter'];
const SIGNATURE_MODES=['with-signature','without-signature'];
const PRINCIPAL_POSITIONS=['parallel','above'];
const LAYOUT_DEFAULTS=Object.freeze({paperSize:'A4',marginTopMm:20,marginBottomMm:20,marginLeftMm:20,marginRightMm:20,signatureMode:'with-signature',principalPosition:'parallel',showTeacherName:true,firstPage:1});
function boundedMm(value,fallback){const angka=Number(value);if(!Number.isFinite(angka))return fallback;return Math.min(50,Math.max(0,Math.round(angka)));}
function boundedPage(value,fallback){const angka=Number(value);if(!Number.isFinite(angka))return fallback;return Math.min(99,Math.max(1,Math.round(angka)));}
function pilihan(daftar,value,fallback){return daftar.includes(value)?value:fallback;}
function layoutOf(input,base=LAYOUT_DEFAULTS){
  return {
    paperSize:pilihan(PAPER_SIZES,input?.paperSize,base.paperSize),
    marginTopMm:boundedMm(input?.marginTopMm,base.marginTopMm),
    marginBottomMm:boundedMm(input?.marginBottomMm,base.marginBottomMm),
    marginLeftMm:boundedMm(input?.marginLeftMm,base.marginLeftMm),
    marginRightMm:boundedMm(input?.marginRightMm,base.marginRightMm),
    signatureMode:pilihan(SIGNATURE_MODES,input?.signatureMode,base.signatureMode),
    principalPosition:pilihan(PRINCIPAL_POSITIONS,input?.principalPosition,base.principalPosition),
    showTeacherName:input?.showTeacherName===undefined?base.showTeacherName:input.showTeacherName!==false,
    firstPage:boundedPage(input?.firstPage,base.firstPage)
  };
}
/* Dipakai halaman cetak untuk membedakan setelan yang benar-benar disimpan guru dari nilai
   bawaan, sehingga tata letak cetak yang sudah terverifikasi tidak berubah dengan sendirinya. */
export function hasSavedPrintSettings(session){return Boolean(loadDb().printSettings?.[key(session)]);}
export function printLayoutOptions(){return {paperSizes:[...PAPER_SIZES],signatureModes:[...SIGNATURE_MODES],principalPositions:[...PRINCIPAL_POSITIONS]};}
export function formatIndonesianPrintDate(dateValue,city=''){const raw=String(dateValue||'').trim();if(!raw)return '';const date=new Date(`${raw}T00:00:00`);if(Number.isNaN(date.getTime()))throw new Error('Tanggal cetak tidak valid.');const kota=clean(city,80);return `${kota?`${kota}, `:''}${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;}
/* ------------------------------------------------- TANGGAL RAPOR: SATU SUMBER, SATU ALIRAN

   ADMIN MENETAPKAN, GURU MENGIKUTI - kecuali guru memang sengaja menimpanya.

   MASALAH YANG DIPERBAIKI. Tanggal Admin dulu hanya dipakai sebagai nilai awal. Begitu guru
   menekan Simpan Pengaturan Cetak sekali - dan ia harus menekannya, sebab nama Kepala Sekolah
   dan wali kelas wajib diisi - tanggal itu ikut membeku ke dalam catatan rombelnya. Sesudah
   itu Admin boleh mengubah tanggal rapor sekolah berkali-kali dan tidak satu pun rombel
   mengikutinya: keduanya menjadi dua data yang tidak lagi berhubungan.

   Sekarang catatan rombel menyimpan `printDateOverride`, bukan salinan tanggal Admin. Kosong
   berarti "ikut Admin", dan tanggal efektifnya dibaca ulang dari master setiap kali dipakai.
   Guru yang memang perlu tanggal sendiri untuk rombelnya tetap bisa mengisinya.

   TANGGAL ADMIN PER TAHUN PELAJARAN DAN SEMESTER. Satu tanggal global tidak pernah cukup:
   rapor Ganjil dan Genap dibagikan pada hari yang berbeda. Nilai per periode disimpan pada
   koleksi `reportDateDefaults`, dan `school.reportDate` yang lama tetap dibaca sebagai
   cadangan bagi periode yang belum diatur - sehingga sekolah yang sudah mengisinya tidak
   kehilangan apa pun dan tidak ada migrasi yang perlu dijalankan. */
function periodKey(session){return `${String(session?.academicYear||'').trim()}|${String(session?.semester||'').trim()}`;}

export function getReportDateDefault(session){
  const school=getSchoolMaster();
  const perPeriode=loadDb().reportDateDefaults?.[periodKey(session)];
  const date=String(perPeriode?.reportDate??school.reportDate??'').trim();
  const city=clean(perPeriode?.reportCity??school.reportCity??school.city??'',80);
  return {academicYear:session?.academicYear||'',semester:session?.semester||'',reportDate:date,reportCity:city,
    reportDateLabel:date?formatIndonesianPrintDate(date,city):'',
    scoped:Boolean(perPeriode)};
}

export function saveReportDateDefault(session,input){
  if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat menetapkan tanggal rapor sekolah.');
  const academicYear=String(input?.academicYear||session.academicYear||'').trim();
  const semester=String(input?.semester||session.semester||'').trim();
  if(!academicYear||!semester)throw new Error('Tahun pelajaran dan semester wajib dipilih.');
  const reportDate=String(input?.reportDate||'').trim();
  if(reportDate)formatIndonesianPrintDate(reportDate,'');
  const reportCity=clean(input?.reportCity,80);
  const value={academicYear,semester,reportDate,reportCity,updatedAt:new Date().toISOString()};
  updateDb(db=>{db.reportDateDefaults[`${academicYear}|${semester}`]=value;return db;});
  return clone(value);
}

/* Tanggal yang benar-benar dipakai satu rombel: timpaan guru bila ada, kalau tidak tanggal
   Admin yang berlaku pada tahun pelajaran dan semester itu. */
function tanggalEfektif(session,saved){
  const bawaan=getReportDateDefault(session);
  /* CATATAN VERSI LAMA TIDAK PUNYA printDateOverride, jadi statusnya harus disimpulkan - dan
     kesimpulannya tidak boleh berubah-ubah.

     Pembandingnya adalah `school.reportDate`, tanggal bawaan lama pada master sekolah, sebab
     ITULAH satu-satunya nilai yang pernah disalin ke dalam catatan lama. Nilai itu tidak pernah
     lagi ditulis oleh saveReportDateDefault, sehingga perbandingannya tetap sama setiap kali
     dibaca: catatan yang dulu sekadar menyalin tanggal Admin akan selamanya dianggap mengikuti
     Admin, dan tanggal yang memang diketik guru sendiri akan selamanya dianggap timpaan.

     Membandingkannya dengan tanggal Admin yang berlaku sekarang justru akan membuat catatan
     lama berpindah status setiap kali Admin mengubah tanggal - persis kerancuan yang sedang
     diperbaiki. Tidak ada tanggal guru yang hilang, dan tidak ada catatan yang ditulis ulang. */
  const salinanLama=String(getSchoolMaster().reportDate||'').trim();
  const tanggalTersimpan=String(saved?.printDate||'').trim();
  const timpaan=saved&&Object.hasOwn(saved,'printDateOverride')
    ? String(saved.printDateOverride||'').trim()
    : (tanggalTersimpan===salinanLama?'':tanggalTersimpan);
  const city=clean(saved?.city??bawaan.reportCity,80);
  const printDate=timpaan||bawaan.reportDate;
  return {printDate,printDateOverride:timpaan,city,
    printDateLabel:printDate?formatIndonesianPrintDate(printDate,city):'',
    printDateSource:timpaan?'OVERRIDE':'ADMIN'};
}

export function getPrintSettings(session){
  const school=getSchoolMaster();
  const teacher=session?.classId?getTeacherProfile(session.classId):null;
  const saved=loadDb().printSettings?.[key(session)];
  if(saved)return clone({...LAYOUT_DEFAULTS,...saved,...tanggalEfektif(session,saved)});
  return clone({...LAYOUT_DEFAULTS,classId:session?.classId||null,semester:session?.semester,
    academicYear:session?.academicYear,principalName:school.principalName||'',
    principalNip:school.principalNip||'',teacherName:teacher?.name||'',teacherNip:teacher?.nip||'',
    ...tanggalEfektif(session,null)});
}
/* Tanggal yang dikirim guru dicatat sebagai TIMPAAN hanya bila memang berbeda dari tanggal
   Admin yang berlaku. Guru yang membiarkan tanggalnya apa adanya - dan itulah yang terjadi
   pada hampir semua rombel - tetap mengikuti Admin, sehingga perubahan tanggal sekolah
   berikutnya langsung terbawa tanpa satu pun rombel perlu dibuka lagi. */
export function savePrintSettings(session,input){
  if(session?.role!=='teacher'||!session.classId)throw new Error('Hanya Guru yang dapat menyimpan pengaturan cetak rombel.');
  const bawaan=getReportDateDefault(session);
  const date=String(input?.printDate||'').trim();
  if(date)formatIndonesianPrintDate(date,'');
  const city=clean(input?.city,80);
  const printDateOverride=date&&date!==bawaan.reportDate?date:'';
  const printDate=printDateOverride||bawaan.reportDate;
  const value={classId:session.classId,semester:session.semester,academicYear:session.academicYear,
    principalName:clean(input?.principalName),principalNip:clean(input?.principalNip,60),
    teacherName:clean(input?.teacherName),teacherNip:clean(input?.teacherNip,60),city,
    printDateOverride,printDate,
    printDateLabel:printDate?formatIndonesianPrintDate(printDate,city):'',
    printDateSource:printDateOverride?'OVERRIDE':'ADMIN',
    ...layoutOf(input),updatedAt:new Date().toISOString()};
  if(!value.principalName||!value.principalNip||!value.teacherName)throw new Error('Nama Kepala Sekolah, NIP, dan nama Guru wajib diisi.');
  updateDb(db=>{db.printSettings[key(session)]=value;return db;});
  return clone(value);
}
