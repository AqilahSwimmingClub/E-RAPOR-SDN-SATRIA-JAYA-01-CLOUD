import { CLASSES } from '../data/constants.js';
import { loadDb, updateDb } from './storage.js';
import { createWorkbookBytes, readWorkbookRows } from './excel.js';

export const STUDENT_CSV_HEADERS=[
  'NIS','NISN','Nama','JK','Agama','Tempat/Tanggal Lahir','Orang Tua','Telepon','Alamat'
];
const STUDENT_COLUMN_WIDTHS=[14,18,30,6,14,30,26,16,52];
/* Tempat dan tanggal lahir ditulis satu kolom, contoh: "Bekasi, 4 September 2015". */
const BIRTH_MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
export function formatBirthPlaceDate(student){
  const place=String(student?.birthPlace??'').trim();
  const raw=String(student?.birthDate??'').trim();
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const date=match?`${Number(match[3])} ${BIRTH_MONTHS[Number(match[2])-1]} ${match[1]}`:raw;
  return [place,date].filter(Boolean).join(', ');
}
export function parseBirthPlaceDate(value){
  const text=String(value??'').trim();
  if(!text)return {birthPlace:'',birthDate:''};
  const index=text.lastIndexOf(',');
  const place=index>=0?text.slice(0,index).trim():text;
  const rest=index>=0?text.slice(index+1).trim():'';
  if(!rest)return {birthPlace:place,birthDate:''};
  const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(rest);
  if(iso)return {birthPlace:place,birthDate:rest};
  const named=/^(\d{1,2})\s+([A-Za-z\u00C0-\u024F]+)\s+(\d{4})$/.exec(rest);
  if(named){
    const month=BIRTH_MONTHS.findIndex(item=>item.toLowerCase()===named[2].toLowerCase());
    if(month>=0)return {birthPlace:place,birthDate:`${named[3]}-${String(month+1).padStart(2,'0')}-${String(Number(named[1])).padStart(2,'0')}`};
  }
  const numeric=/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(rest);
  if(numeric)return {birthPlace:place,birthDate:`${numeric[3]}-${String(Number(numeric[2])).padStart(2,'0')}-${String(Number(numeric[1])).padStart(2,'0')}`};
  return {birthPlace:text,birthDate:''};
}

const HEADER_FIELDS={
  rombel:'classId',kelas:'classId',foto:'photo',nis:'nis',nisn:'nisn',nama:'name',
  jk:'gender','jenis kelamin':'gender','tempat lahir':'birthPlace','tanggal lahir':'birthDate',
  'tempat/tanggal lahir':'birthPlaceDate','tempat tanggal lahir':'birthPlaceDate','ttl':'birthPlaceDate',
  agama:'religion','orang tua':'parentName','nama orang tua':'parentName','nama orangtua':'parentName','nama ayah':'parentName','nama ibu':'parentName',
  'no telepon':'phone','nomor telepon':'phone',telepon:'phone',alamat:'address'
};

export class StudentValidationError extends Error{
  constructor(errors){super(errors[0]||'Data siswa tidak valid.');this.name='StudentValidationError';this.errors=errors;}
}

function clone(value){return JSON.parse(JSON.stringify(value));}
function assertSession(session){
  if(!session || !['admin','teacher'].includes(session.role)) throw new Error('Session Data Siswa tidak valid.');
}
function newId(){return globalThis.crypto?.randomUUID?.() || `student-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}
function normalizeHeader(value){return String(value||'').trim().toLowerCase().replace(/[_.-]+/g,' ').replace(/\s+/g,' ');}
function clean(value,max=500){return String(value??'').trim().slice(0,max);}
function actorId(session){return String(session.username||session.userId||session.classId||session.role);}
function originForSession(session){return session.role==='admin'?'manual-admin':'manual-teacher';}
function auditNewStudent(session,student,now=new Date()){
  const timestamp=now.toISOString();
  return {...student,origin:originForSession(session),createdBy:actorId(session),createdAt:timestamp,updatedAt:timestamp,syncState:'local',isActive:true};
}
function auditEditedStudent(session,existing,student,now=new Date()){
  const timestamp=now.toISOString();
  return {...existing,...student,origin:existing.origin||originForSession(session),createdBy:existing.createdBy||actorId(session),createdAt:existing.createdAt||timestamp,updatedAt:timestamp,syncState:existing.syncState||'local',isActive:existing.isActive!==false};
}
function studentClassForWrite(session,requestedClass){return session.role==='teacher'?session.classId:resolveStudentClass(session,requestedClass);}
function isValidDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===value;
}

export function resolveStudentClass(session,requestedClass,{allowAll=false}={}){
  assertSession(session);
  const requested=String(requestedClass||'').trim().toUpperCase();
  if(session.role==='teacher'){
    if(requested && requested!=='ALL' && requested!==session.classId) throw new Error(`Guru hanya dapat mengelola Data Siswa Kelas ${session.classId}.`);
    return session.classId;
  }
  if(allowAll && (!requested || requested==='ALL')) return 'ALL';
  if(!CLASSES.includes(requested)) throw new Error('Pilih rombel 1A sampai 6D terlebih dahulu.');
  return requested;
}

export function studentScope(session,classId){
  const targetClass=resolveStudentClass(session,classId);
  return `${session.academicYear}|${session.semester}|${targetClass}`;
}

function studentEntries(db,session,classId='ALL'){
  const targetClass=resolveStudentClass(session,classId,{allowAll:true});
  const basePrefix=`${session.academicYear}|${session.semester}|`;
  const classPrefix=targetClass==='ALL'?basePrefix:`${basePrefix}${targetClass}|`;
  return Object.entries(db.students||{}).filter(([key])=>key.startsWith(classPrefix));
}

function activePeriodRecords(db,session){
  return Object.values(db.students||{}).filter(student=>student.academicYear===session.academicYear
    && student.semester===session.semester && student.isActive!==false);
}

export function listStudents(session,{classId='ALL'}={}){
  return studentEntries(loadDb(),session,classId)
    .filter(([,student])=>student.isActive!==false)
    .map(([,student])=>clone(student))
    .sort((a,b)=>a.name.localeCompare(b.name,'id'));
}

export function getStudent(session,id,{classId='ALL'}={}){
  const match=studentEntries(loadDb(),session,classId).find(([,student])=>student.id===id);
  return match?clone(match[1]):null;
}

export function normalizeStudentInput(input,classId){
  const parentName=clean(input.parentName||input.fatherName||input.motherName,150);
  const combined=input.birthPlaceDate?parseBirthPlaceDate(input.birthPlaceDate):null;
  return {
    photo:String(input.photo??'').trim(),
    nis:clean(input.nis,30),
    nisn:clean(input.nisn,30),
    name:clean(input.name,150),
    gender:clean(input.gender,1).toUpperCase(),
    birthPlace:clean(combined?combined.birthPlace:input.birthPlace,100),
    birthDate:clean(combined?combined.birthDate:input.birthDate,10),
    religion:clean(input.religion,30),
    parentName,
    phone:clean(input.phone,40),
    address:clean(input.address,500),
    classId,
  };
}

function validateFields(student){
  const errors=[];
  /* NIS dan NISN adalah data identitas, bukan syarat agar siswa dapat dinilai. Siswa yang
     NIS-nya belum terbit tetap boleh disimpan dan tetap menerima nilai lewat ID internalnya. */
  if(!student.nis && !student.nisn) errors.push('Isi minimal salah satu dari NIS atau NISN.');
  if(!student.name) errors.push('Nama siswa wajib diisi.');
  if(!['L','P'].includes(student.gender)) errors.push('JK harus L atau P.');
  if(student.birthDate && !isValidDate(student.birthDate)) errors.push('Tanggal lahir harus menggunakan format YYYY-MM-DD yang valid.');
  if(student.photo && !student.photo.startsWith('data:image/')) errors.push('Foto harus berupa file gambar lokal.');
  if(student.photo.length>1500000) errors.push('Ukuran data foto terlalu besar untuk storage lokal.');
  return errors;
}

/* Siswa lama dikenali dari NISN lebih dulu, lalu NIS. Nomor kosong tidak pernah dipakai
   mencocokkan supaya siswa yang belum punya NIS tidak saling tertukar. Pembandingan
   mengabaikan spasi dan besar kecil huruf agar selisih penulisan tidak membuat siswa ganda. */
function kunciNomor(value){return String(value??'').trim().replace(/\s+/g,'').toUpperCase();}
export function matchExistingStudent(student,records){
  const nisn=kunciNomor(student.nisn);
  if(nisn){const cocok=records.find(record=>kunciNomor(record.nisn)===nisn);if(cocok)return cocok;}
  const nis=kunciNomor(student.nis);
  if(nis){const cocok=records.find(record=>kunciNomor(record.nis)===nis);if(cocok)return cocok;}
  return null;
}

function validateDuplicates(student,records,excludeId=null){
  const errors=[];
  /* Nomor kosong tidak pernah dianggap duplikat, sehingga beberapa siswa boleh sama-sama
     belum memiliki NIS tanpa saling menolak. */
  const nis=kunciNomor(student.nis),nisn=kunciNomor(student.nisn);
  if(nis && records.some(record=>record.id!==excludeId && kunciNomor(record.nis)===nis)) errors.push(`NIS ${student.nis} sudah digunakan pada periode aktif.`);
  if(nisn && records.some(record=>record.id!==excludeId && kunciNomor(record.nisn)===nisn)) errors.push(`NISN ${student.nisn} sudah digunakan pada periode aktif.`);
  return errors;
}

function validateStudent(student,records,excludeId=null){return [...validateFields(student),...validateDuplicates(student,records,excludeId)];}

export function createStudent(session,input){
  assertSession(session);
  const classId=studentClassForWrite(session,input.classId);
  let created;
  updateDb(db=>{
    const records=activePeriodRecords(db,session);
    const student=normalizeStudentInput(input,classId);
    const errors=validateStudent(student,records);
    if(errors.length) throw new StudentValidationError(errors);
    created=auditNewStudent(session,{...student,id:input.id||newId(),academicYear:session.academicYear,semester:session.semester});
    db.students[`${studentScope(session,classId)}|${created.id}`]=created;
    return db;
  });
  return clone(created);
}

export function updateStudent(session,id,input){
  let updated;
  updateDb(db=>{
    const existingEntry=studentEntries(db,session,'ALL').find(([,record])=>record.id===id);
    if(!existingEntry) throw new Error('Data siswa tidak ditemukan dalam scope aktif.');
    const [oldKey,existing]=existingEntry;
    const classId=studentClassForWrite(session,input.classId||existing.classId);
    const records=activePeriodRecords(db,session);
    const student=normalizeStudentInput({...existing,...input},classId);
    const errors=validateStudent(student,records,id);
    if(errors.length) throw new StudentValidationError(errors);
    updated=auditEditedStudent(session,existing,{...student,id,academicYear:session.academicYear,semester:session.semester});
    delete db.students[oldKey];
    db.students[`${studentScope(session,classId)}|${id}`]=updated;
    return db;
  });
  return clone(updated);
}

export function deleteStudent(session,id,{classId='ALL'}={}){
  let removed=false;
  updateDb(db=>{
    const entry=studentEntries(db,session,classId).find(([,record])=>record.id===id);
    if(!entry) throw new Error('Data siswa tidak ditemukan dalam scope aktif.');
    delete db.students[entry[0]];removed=true;return db;
  });
  return removed;
}

export function deactivateStudent(session,id,{classId='ALL'}={}){
  let deactivated=false;
  updateDb(db=>{
    const entry=studentEntries(db,session,classId).find(([,record])=>record.id===id);
    if(!entry)throw new Error('Data siswa tidak ditemukan dalam scope aktif.');
    if(entry[1].origin!=='dapodik')throw new Error('Hanya siswa asal Dapodik yang dapat dinonaktifkan.');
    db.students[entry[0]]={...entry[1],isActive:false,updatedAt:new Date().toISOString()};
    deactivated=true;
    return db;
  });
  return deactivated;
}

export function filterStudents(students,{query='',gender='',classId='ALL'}={}){
  const q=String(query).trim().toLowerCase();
  return students.filter(student=>(!gender || student.gender===gender)
    && (classId==='ALL' || student.classId===classId)
    && (!q || [student.nis,student.nisn,student.name,student.parentName,student.fatherName,student.motherName,student.phone,student.address]
      .some(value=>String(value||'').toLowerCase().includes(q))));
}

export function studentOriginLabel(student){
  return ({'manual-teacher':'Input Manual Guru','manual-admin':'Input Manual Admin',dapodik:'Dapodik'})[student?.origin]||'Data Lama';
}

export function studentRow(student){return [student.nis,student.nisn,student.name,student.gender,student.religion||'',formatBirthPlaceDate(student),student.parentName||'',student.phone||'',student.address||''];}
export function studentTemplateCsv(){return `\uFEFF${STUDENT_CSV_HEADERS.join(',')}\r\n`;}
export function studentWorkbookBytes(session,{classId='ALL'}={}){const rows=listStudents(session,{classId}).map(studentRow);return createWorkbookBytes('Data Siswa',[STUDENT_CSV_HEADERS,...rows],{columnWidths:STUDENT_COLUMN_WIDTHS});}

/* Template unduhan sekaligus menjadi salinan data siswa rombel aktif: guru mengunduh, mengedit
   di Excel, lalu mengimpornya kembali tanpa mengetik ulang. Rombel yang belum punya siswa
   tetap menghasilkan berkas berisi baris header lengkap. */
export function studentTemplateWorkbook(session=null,{classId='ALL'}={}){
  const rows=session?listStudents(session,{classId}).map(studentRow):[];
  return createWorkbookBytes('Data Siswa',[STUDENT_CSV_HEADERS,...rows],{columnWidths:STUDENT_COLUMN_WIDTHS});
}

function xmlEscape(value){return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]));}
function xmlDecode(value){return String(value??'').replace(/&#(\d+);/g,(_,code)=>String.fromCharCode(Number(code))).replace(/&#x([0-9a-f]+);/gi,(_,code)=>String.fromCharCode(Number.parseInt(code,16))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
function csvCell(value){const text=String(value??'');return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}

export function studentTemplateExcel(){
  const cells=STUDENT_CSV_HEADERS.map(header=>`<Cell><Data ss:Type="String">${xmlEscape(header)}</Data></Cell>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Data Siswa"><Table><Row>${cells}</Row></Table></Worksheet></Workbook>`;
}

export function parseStudentExcel(text){
  const source=String(text||'').replace(/^\uFEFF/,'');if(!/<Workbook\b/i.test(source)||!/<Worksheet\b/i.test(source))throw new Error('File bukan template Excel Data Siswa yang valid.');
  return [...source.matchAll(/<Row\b[^>]*>([\s\S]*?)<\/Row>/gi)].map(row=>[...row[1].matchAll(/<Cell\b[^>]*>([\s\S]*?)<\/Cell>/gi)].map(cell=>{const data=cell[1].match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i);return xmlDecode(data?.[1]||'').trim();}));
}

export function previewStudentExcelImport(session,text,{classId='ALL'}={}){
  const rows=parseStudentExcel(text);const csv=rows.map(row=>row.map(csvCell).join(',')).join('\r\n');const preview=previewStudentImport(session,csv,{classId});return {...preview,sourceText:String(text),format:'excel'};
}

export function previewStudentWorkbookImport(session,data,{classId='ALL'}={}){
  const rows=readWorkbookRows(data);const csv=rows.map(row=>row.map(csvCell).join(',')).join('\r\n');const preview=previewStudentImport(session,csv,{classId});return {...preview,sourceText:csv,format:'xlsx',sourceRows:rows};
}

export function parseCsv(text){
  const source=String(text||'').replace(/^\uFEFF/,'');
  const firstLine=source.split(/\r?\n/,1)[0]||'';
  const delimiter=(firstLine.match(/;/g)||[]).length>(firstLine.match(/,/g)||[]).length?';':',';
  const rows=[];let row=[];let value='';let quoted=false;
  for(let index=0;index<source.length;index+=1){
    const char=source[index];
    if(char==='"'){
      if(quoted && source[index+1]==='"'){value+='"';index+=1;}else quoted=!quoted;
    }else if(char===delimiter && !quoted){row.push(value);value='';}
    else if((char==='\n' || char==='\r') && !quoted){
      if(char==='\r' && source[index+1]==='\n') index+=1;
      row.push(value);if(row.some(cell=>String(cell).trim()))rows.push(row);row=[];value='';
    }else value+=char;
  }
  row.push(value);if(row.some(cell=>String(cell).trim()))rows.push(row);
  return rows;
}

function importClass(session,rowClass,selectedClass){
  const value=String(rowClass||'').trim().toUpperCase();
  if(session.role==='teacher') return resolveStudentClass(session,value||session.classId);
  if(selectedClass && selectedClass!=='ALL'){
    if(value && value!==selectedClass) throw new Error(`Rombel ${value} tidak cocok dengan filter ${selectedClass}.`);
    return resolveStudentClass(session,selectedClass);
  }
  return resolveStudentClass(session,value);
}

export function previewStudentImport(session,text,{classId='ALL'}={}){
  assertSession(session);
  const csvRows=parseCsv(text);
  if(csvRows.length<1) throw new Error('File CSV kosong.');
  /* Berkas asli sering diawali baris judul, mis. "Data Siswa Kelas 5B", sehingga baris header
     dicari pada beberapa baris pertama. */
  const headerIndex=csvRows.slice(0,10).findIndex(row=>{
    const fields=row.map(cell=>HEADER_FIELDS[normalizeHeader(cell)]||null);
    return ['nis','nisn','name','gender'].every(field=>fields.includes(field));
  });
  const headerRow=headerIndex>=0?headerIndex:0;
  const headers=csvRows[headerRow].map(normalizeHeader);
  const mappedHeaders=headers.map(header=>HEADER_FIELDS[header]||null);
  for(const required of ['nis','nisn','name','gender']){
    if(!mappedHeaders.includes(required)) throw new Error(`Kolom wajib ${required.toUpperCase()} tidak ditemukan pada template.`);
  }
  if(session.role==='admin' && classId==='ALL' && !mappedHeaders.includes('classId')) throw new Error('Kolom Rombel wajib tersedia untuk import Admin semua rombel.');
  const db=loadDb();
  const previous=[];
  const dipakai=new Set();
  /* Kolom yang benar-benar ada pada berkas. Saat memperbarui siswa lama, hanya kolom inilah
     yang ditimpa sehingga data yang tidak ikut di Excel (misalnya foto) tetap utuh. */
  const providedFields=[...new Set(mappedHeaders.filter(Boolean))];
  const rows=csvRows.slice(headerRow+1).map((cells,index)=>{
    const raw={};mappedHeaders.forEach((field,column)=>{if(field)raw[field]=cells[column]??'';});
    const errors=[];let targetClass='';
    try{targetClass=importClass(session,raw.classId,classId);}catch(error){errors.push(error.message);}
    const data=normalizeStudentInput(raw,targetClass);
    errors.push(...validateFields(data));
    let existingId=null;
    if(targetClass){
      const existing=studentEntries(db,session,targetClass).map(([,record])=>record);
      const periodRecords=activePeriodRecords(db,session);
      const cocok=matchExistingStudent(data,existing);
      existingId=cocok?cocok.id:null;
      if(existingId&&dipakai.has(existingId))errors.push('Siswa yang sama muncul lebih dari satu kali pada berkas.');
      errors.push(...validateDuplicates(data,[...periodRecords,...previous],existingId));
    }
    if(existingId)dipakai.add(existingId);
    previous.push({...data,id:existingId||`preview-${index+1}`});
    return {rowNumber:headerRow+index+2,data,existingId,mode:existingId?'update':'new',valid:errors.length===0,errors:[...new Set(errors)]};
  });
  const invalidCount=rows.filter(row=>!row.valid).length;
  const valid=rows.filter(row=>row.valid);
  return {sourceText:String(text),selectedClass:classId,rows,providedFields,
    validCount:rows.length-invalidCount,invalidCount,
    newCount:valid.filter(row=>row.mode==='new').length,
    updateCount:valid.filter(row=>row.mode==='update').length,
    canCommit:rows.length>0 && invalidCount===0};
}

export function commitStudentImport(session,preview){
  if(!preview || typeof preview.sourceText!=='string') throw new Error('Preview import tidak valid.');
  const checked=preview.format==='excel'?previewStudentExcelImport(session,preview.sourceText,{classId:preview.selectedClass}):previewStudentImport(session,preview.sourceText,{classId:preview.selectedClass});
  if(!checked.canCommit) throw new StudentValidationError(checked.rows.flatMap(row=>row.errors));
  const now=new Date().toISOString();
  const tersimpan=[];const created=[];const updated=[];
  const fields=new Set(checked.providedFields||[]);
  updateDb(db=>{
    checked.rows.forEach(row=>{
      const scope=studentScope(session,row.data.classId);
      const lama=row.existingId?Object.entries(db.students||{}).find(([key,record])=>key.startsWith(`${scope}|`)&&record.id===row.existingId):null;
      if(lama){
        /* Hanya kolom yang ada di berkas yang ditimpa; foto dan data lain tetap seperti semula. */
        const patch={};
        for(const field of ['nis','nisn','name','gender','religion','parentName','phone','address'])if(fields.has(field))patch[field]=row.data[field];
        if(fields.has('birthPlaceDate')||fields.has('birthPlace'))patch.birthPlace=row.data.birthPlace;
        if(fields.has('birthPlaceDate')||fields.has('birthDate'))patch.birthDate=row.data.birthDate;
        if(fields.has('photo')&&row.data.photo)patch.photo=row.data.photo;
        const student=auditEditedStudent(session,lama[1],patch,new Date(now));
        db.students[lama[0]]=student;updated.push(student);tersimpan.push(student);
        return;
      }
      const id=newId();
      const student=auditNewStudent(session,{...row.data,id,academicYear:session.academicYear,semester:session.semester},new Date(now));
      db.students[`${scope}|${id}`]=student;
      created.push(student);tersimpan.push(student);
    });
    return db;
  });
  /* Siswa yang tidak ada di berkas tidak pernah disentuh: import hanya menambah dan memperbarui. */
  const hasil=clone(tersimpan);
  Object.defineProperty(hasil,'created',{value:clone(created),enumerable:false});
  Object.defineProperty(hasil,'updated',{value:clone(updated),enumerable:false});
  return hasil;
}
