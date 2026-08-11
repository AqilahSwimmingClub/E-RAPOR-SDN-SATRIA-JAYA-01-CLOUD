import { CLASSES } from '../data/constants.js';
import { loadDb, updateDb } from './storage.js';
import { createWorkbookBytes, readWorkbookRows } from './excel.js';

export const STUDENT_CSV_HEADERS=[
  'NIS','NISN','Nama','JK','Tempat Lahir','Tanggal Lahir',
  'Nama Orang Tua','No. Telepon','Alamat'
];

const HEADER_FIELDS={
  rombel:'classId',kelas:'classId',foto:'photo',nis:'nis',nisn:'nisn',nama:'name',
  jk:'gender','jenis kelamin':'gender','tempat lahir':'birthPlace','tanggal lahir':'birthDate',
  'nama orang tua':'parentName','nama orangtua':'parentName','nama ayah':'parentName','nama ibu':'parentName','no telepon':'phone','nomor telepon':'phone',
  telepon:'phone',alamat:'address'
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

export function listStudents(session,{classId='ALL'}={}){
  return studentEntries(loadDb(),session,classId)
    .map(([,student])=>clone(student))
    .sort((a,b)=>a.name.localeCompare(b.name,'id'));
}

export function getStudent(session,id,{classId='ALL'}={}){
  const match=studentEntries(loadDb(),session,classId).find(([,student])=>student.id===id);
  return match?clone(match[1]):null;
}

export function normalizeStudentInput(input,classId){
  const parentName=clean(input.parentName||input.fatherName||input.motherName,150);
  return {
    photo:String(input.photo??'').trim(),
    nis:clean(input.nis,30),
    nisn:clean(input.nisn,30),
    name:clean(input.name,150),
    gender:clean(input.gender,1).toUpperCase(),
    birthPlace:clean(input.birthPlace,100),
    birthDate:clean(input.birthDate,10),
    parentName,
    phone:clean(input.phone,40),
    address:clean(input.address,500),
    classId,
  };
}

function validateFields(student){
  const errors=[];
  if(!student.nis) errors.push('NIS wajib diisi.');
  if(!student.nisn) errors.push('NISN wajib diisi.');
  if(!student.name) errors.push('Nama siswa wajib diisi.');
  if(!['L','P'].includes(student.gender)) errors.push('JK harus L atau P.');
  if(student.birthDate && !isValidDate(student.birthDate)) errors.push('Tanggal lahir harus menggunakan format YYYY-MM-DD yang valid.');
  if(student.photo && !student.photo.startsWith('data:image/')) errors.push('Foto harus berupa file gambar lokal.');
  if(student.photo.length>1500000) errors.push('Ukuran data foto terlalu besar untuk storage lokal.');
  return errors;
}

function validateDuplicates(student,records,excludeId=null){
  const errors=[];
  if(records.some(record=>record.id!==excludeId && record.nis===student.nis)) errors.push(`NIS ${student.nis} sudah digunakan dalam scope rombel ini.`);
  if(records.some(record=>record.id!==excludeId && record.nisn===student.nisn)) errors.push(`NISN ${student.nisn} sudah digunakan dalam scope rombel ini.`);
  return errors;
}

function validateStudent(student,records,excludeId=null){return [...validateFields(student),...validateDuplicates(student,records,excludeId)];}

export function createStudent(session,input){
  const classId=resolveStudentClass(session,input.classId);
  let created;
  updateDb(db=>{
    const records=studentEntries(db,session,classId).map(([,record])=>record);
    const student=normalizeStudentInput(input,classId);
    const errors=validateStudent(student,records);
    if(errors.length) throw new StudentValidationError(errors);
    const now=new Date().toISOString();
    created={...student,id:input.id||newId(),academicYear:session.academicYear,semester:session.semester,createdAt:now,updatedAt:now};
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
    const classId=resolveStudentClass(session,input.classId||existing.classId);
    const records=studentEntries(db,session,classId).map(([,record])=>record);
    const student=normalizeStudentInput({...existing,...input},classId);
    const errors=validateStudent(student,records,id);
    if(errors.length) throw new StudentValidationError(errors);
    updated={...existing,...student,id,academicYear:session.academicYear,semester:session.semester,updatedAt:new Date().toISOString()};
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

export function filterStudents(students,{query='',gender='',classId='ALL'}={}){
  const q=String(query).trim().toLowerCase();
  return students.filter(student=>(!gender || student.gender===gender)
    && (classId==='ALL' || student.classId===classId)
    && (!q || [student.nis,student.nisn,student.name,student.parentName,student.fatherName,student.motherName,student.phone,student.address]
      .some(value=>String(value||'').toLowerCase().includes(q))));
}

export function studentTemplateCsv(){return `\uFEFF${STUDENT_CSV_HEADERS.join(',')}\r\n`;}

export function studentTemplateWorkbook(){return createWorkbookBytes('Data Siswa',[STUDENT_CSV_HEADERS],{columnWidths:[14,18,28,8,18,16,28,18,36]});}

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
  const headers=csvRows[0].map(normalizeHeader);
  const mappedHeaders=headers.map(header=>HEADER_FIELDS[header]||null);
  for(const required of ['nis','nisn','name','gender']){
    if(!mappedHeaders.includes(required)) throw new Error(`Kolom wajib ${required.toUpperCase()} tidak ditemukan pada template.`);
  }
  if(session.role==='admin' && classId==='ALL' && !mappedHeaders.includes('classId')) throw new Error('Kolom Rombel wajib tersedia untuk import Admin semua rombel.');
  const db=loadDb();
  const previous=[];
  const rows=csvRows.slice(1).map((cells,index)=>{
    const raw={};mappedHeaders.forEach((field,column)=>{if(field)raw[field]=cells[column]??'';});
    const errors=[];let targetClass='';
    try{targetClass=importClass(session,raw.classId,classId);}catch(error){errors.push(error.message);}
    const data=normalizeStudentInput(raw,targetClass);
    errors.push(...validateFields(data));
    if(targetClass){
      const existing=studentEntries(db,session,targetClass).map(([,record])=>record);
      errors.push(...validateDuplicates(data,[...existing,...previous.filter(record=>record.classId===targetClass)]));
    }
    previous.push({...data,id:`preview-${index+1}`});
    return {rowNumber:index+2,data,valid:errors.length===0,errors:[...new Set(errors)]};
  });
  const invalidCount=rows.filter(row=>!row.valid).length;
  return {sourceText:String(text),selectedClass:classId,rows,validCount:rows.length-invalidCount,invalidCount,canCommit:rows.length>0 && invalidCount===0};
}

export function commitStudentImport(session,preview){
  if(!preview || typeof preview.sourceText!=='string') throw new Error('Preview import tidak valid.');
  const checked=preview.format==='excel'?previewStudentExcelImport(session,preview.sourceText,{classId:preview.selectedClass}):previewStudentImport(session,preview.sourceText,{classId:preview.selectedClass});
  if(!checked.canCommit) throw new StudentValidationError(checked.rows.flatMap(row=>row.errors));
  const now=new Date().toISOString();
  const created=[];
  updateDb(db=>{
    checked.rows.forEach(row=>{
      const id=newId();
      const student={...row.data,id,academicYear:session.academicYear,semester:session.semester,createdAt:now,updatedAt:now};
      db.students[`${studentScope(session,student.classId)}|${id}`]=student;
      created.push(student);
    });
    return db;
  });
  return clone(created);
}
