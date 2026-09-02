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
export function formatIndonesianPrintDate(dateValue,city=''){const raw=String(dateValue||'').trim();if(!raw)return '';const date=new Date(`${raw}T00:00:00`);if(Number.isNaN(date.getTime()))throw new Error('Tanggal cetak tidak valid.');return `${clean(city,80)||'Bekasi'}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;}
export function getPrintSettings(session){const school=getSchoolMaster();const teacher=session?.classId?getTeacherProfile(session.classId):null;const saved=loadDb().printSettings?.[key(session)];if(saved)return clone({...LAYOUT_DEFAULTS,...saved});return clone({...LAYOUT_DEFAULTS,classId:session?.classId||null,semester:session?.semester,academicYear:session?.academicYear,principalName:school.principalName||'',principalNip:school.principalNip||'',teacherName:teacher?.name||'',teacherNip:teacher?.nip||'',city:school.reportCity||school.city||'',printDate:school.reportDate||'',printDateLabel:school.reportDate?formatIndonesianPrintDate(school.reportDate,school.reportCity||'Bekasi'):''});}
export function savePrintSettings(session,input){if(session?.role!=='teacher'||!session.classId)throw new Error('Hanya Guru yang dapat menyimpan pengaturan cetak rombel.');const date=String(input?.printDate||'').trim();const value={classId:session.classId,semester:session.semester,academicYear:session.academicYear,principalName:clean(input?.principalName),principalNip:clean(input?.principalNip,60),teacherName:clean(input?.teacherName),teacherNip:clean(input?.teacherNip,60),city:clean(input?.city,80)||'Bekasi',printDate:date,printDateLabel:date?formatIndonesianPrintDate(date,input?.city):'',...layoutOf(input),updatedAt:new Date().toISOString()};if(!value.principalName||!value.principalNip||!value.teacherName)throw new Error('Nama Kepala Sekolah, NIP, dan nama Guru wajib diisi.');updateDb(db=>{db.printSettings[key(session)]=value;return db;});return clone(value);}
