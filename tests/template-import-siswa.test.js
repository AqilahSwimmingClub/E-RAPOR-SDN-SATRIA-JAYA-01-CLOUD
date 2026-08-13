import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR } from '../src/data/constants.js';
import { createWorkbookBytes, readWorkbookRows } from '../src/services/excel.js';
import { commitStudentImport, createStudent, listStudents, previewStudentWorkbookImport, STUDENT_CSV_HEADERS, studentTemplateWorkbook } from '../src/services/students.js';
import { invalidateDbCache, storageKey } from '../src/services/storage.js';

let simpanan=new Map();
function pasangStorage(){globalThis.localStorage={getItem:key=>simpanan.has(key)?simpanan.get(key):null,setItem:(key,value)=>simpanan.set(key,String(value)),removeItem:key=>simpanan.delete(key),clear:()=>simpanan.clear()};invalidateDbCache();}
function useMemoryStorage(){simpanan=new Map();pasangStorage();}
/* Meniru aplikasi ditutup lalu dibuka lagi: cache dibuang, isi penyimpanan tetap. */
function bukaUlang(){const isi=simpanan.get(storageKey());simpanan=new Map([[storageKey(),isi]]);pasangStorage();}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function siswa(session,suffix,extra={}){return createStudent(session,{classId:session.classId,nis:`2223${suffix}`,nisn:`3157${suffix}`,name:`Siswa ${suffix}`,gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Kp. Gebang',photo:'',...extra});}
const templateRows=(session,classId)=>readWorkbookRows(studentTemplateWorkbook(session,{classId}));
const importKembali=(session,rows,classId='5B')=>previewStudentWorkbookImport(session,createWorkbookBytes('Data Siswa',rows),{classId});

/* --------------------------------------------------------------- 1-3. Template unduhan */

test('1. Rombel yang belum punya siswa menghasilkan template berisi header saja',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const rows=templateRows(session,'5B');
  assert.equal(rows.length,1,'hanya baris header');
  assert.deepEqual(rows[0],STUDENT_CSV_HEADERS,'format kolom tetap lengkap');
});

test('2. Rombel berisi 33 siswa menghasilkan template berisi 33 baris data',()=>{
  useMemoryStorage();
  const session=guru('5B');
  for(let index=1;index<=33;index+=1)siswa(session,String(index).padStart(2,'0'));
  const rows=templateRows(session,'5B');
  assert.equal(rows.length,34,'header + 33 siswa');
  assert.deepEqual(rows[0],STUDENT_CSV_HEADERS);
  assert.equal(rows[1].length,STUDENT_CSV_HEADERS.length,'jumlah kolom tiap baris sama dengan header');
  const nama=rows.slice(1).map(row=>row[2]);
  assert.equal(new Set(nama).size,33,'seluruh siswa rombel aktif ikut, tanpa duplikat');
});

test('3. Kolom Agama ikut pada template beserta isinya',()=>{
  useMemoryStorage();
  const session=guru('5B');
  siswa(session,'01',{religion:'Islam'});
  siswa(session,'02',{religion:'Kristen'});
  const rows=templateRows(session,'5B');
  assert.equal(rows[0][4],'Agama','posisi kolom Agama setelah JK');
  assert.deepEqual(rows.slice(1).map(row=>row[4]).sort(),['Islam','Kristen']);
});

test('12. Format kolom template sesuai kesepakatan final',()=>{
  assert.deepEqual(STUDENT_CSV_HEADERS,['NIS','NISN','Nama','JK','Agama','Tempat/Tanggal Lahir','Orang Tua','Telepon','Alamat']);
  useMemoryStorage();
  const session=guru('5B');
  siswa(session,'01');
  const [,baris]=templateRows(session,'5B');
  assert.deepEqual(baris,['222301','315701','Siswa 01','L','Islam','Bekasi, 2 Januari 2015','Orang Tua','0812','Kp. Gebang']);
});

/* ------------------------------------------------------------ 4-6. Round-trip dan edit */

test('4. Template diunduh lalu diimpor kembali apa adanya tidak menggandakan siswa',()=>{
  useMemoryStorage();
  const session=guru('5B');
  for(let index=1;index<=33;index+=1)siswa(session,String(index).padStart(2,'0'));
  const sebelum=listStudents(session,{classId:'5B'});
  const rows=templateRows(session,'5B');

  const preview=importKembali(session,rows);
  assert.equal(preview.invalidCount,0,preview.rows.flatMap(row=>row.errors).join(' | '));
  assert.equal(preview.newCount,0,'tidak ada siswa baru');
  assert.equal(preview.updateCount,33,'seluruh baris dikenali sebagai siswa lama');
  commitStudentImport(session,preview);

  const sesudah=listStudents(session,{classId:'5B'});
  assert.equal(sesudah.length,33,'jumlah siswa tetap');
  assert.deepEqual(sesudah.map(item=>item.id).sort(),sebelum.map(item=>item.id).sort(),'ID internal siswa tidak berubah');
  assert.deepEqual(sesudah.map(item=>item.name).sort(),sebelum.map(item=>item.name).sort(),'tidak ada data hilang');
});

test('5. Menambah satu siswa lewat Excel memasukkannya ke Data Siswa dan bertahan setelah dibuka ulang',()=>{
  useMemoryStorage();
  const session=guru('5B');
  siswa(session,'01');siswa(session,'02');
  const rows=templateRows(session,'5B');
  rows.push(['222399','315799','Siswa Baru Excel','P','Kristen','Bekasi, 5 Mei 2015','Orang Tua Baru','0813','Kp. Baru']);

  const preview=importKembali(session,rows);
  assert.equal(preview.newCount,1);
  assert.equal(preview.updateCount,2);
  commitStudentImport(session,preview);

  const daftar=listStudents(session,{classId:'5B'});
  assert.equal(daftar.length,3);
  const baru=daftar.find(item=>item.name==='Siswa Baru Excel');
  assert.equal(baru.nis,'222399');assert.equal(baru.nisn,'315799');
  assert.equal(baru.religion,'Kristen');assert.equal(baru.address,'Kp. Baru');
  assert.equal(baru.birthPlace,'Bekasi');assert.equal(baru.birthDate,'2015-05-05');

  bukaUlang();
  const setelahBuka=listStudents(session,{classId:'5B'});
  assert.equal(setelahBuka.length,3,'hasil import bertahan setelah aplikasi dibuka kembali');
  assert.ok(setelahBuka.some(item=>item.name==='Siswa Baru Excel'));
});

test('6. Mengubah alamat dan agama lewat Excel memperbarui siswa lama tanpa membuat duplikat',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const lama=siswa(session,'01',{religion:'Islam',address:'Kp. Gebang'});
  siswa(session,'02');
  const rows=templateRows(session,'5B');
  const baris=rows.find(row=>row[0]==='222301');
  baris[4]='Kristen';baris[8]='Kp. Pindah Baru';

  const preview=importKembali(session,rows);
  assert.equal(preview.newCount,0);assert.equal(preview.updateCount,2);
  commitStudentImport(session,preview);

  const daftar=listStudents(session,{classId:'5B'});
  assert.equal(daftar.length,2,'tidak ada siswa duplikat');
  const diperbarui=daftar.find(item=>item.id===lama.id);
  assert.equal(diperbarui.religion,'Kristen');
  assert.equal(diperbarui.address,'Kp. Pindah Baru');
  assert.equal(diperbarui.createdAt,lama.createdAt,'waktu dibuat tetap');
});

/* ------------------------------------------------------- 7-11. Keamanan data saat import */

test('7. Siswa tanpa NIS tetap dapat diimpor dan dikenali lewat NISN',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const tanpaNis=siswa(session,'01',{nis:''});
  const rows=templateRows(session,'5B');
  assert.equal(rows[1][0],'','NIS kosong ikut apa adanya di template');
  rows[1][8]='Alamat Baru Tanpa NIS';
  rows.push(['','315798','Siswa Baru Tanpa NIS','P','Islam','Bekasi, 6 Juni 2015','Orang Tua','','Kp. Baru']);

  const preview=importKembali(session,rows);
  assert.equal(preview.invalidCount,0,preview.rows.flatMap(row=>row.errors).join(' | '));
  assert.equal(preview.newCount,1);assert.equal(preview.updateCount,1);
  commitStudentImport(session,preview);

  const daftar=listStudents(session,{classId:'5B'});
  assert.equal(daftar.length,2);
  assert.equal(daftar.find(item=>item.id===tanpaNis.id).address,'Alamat Baru Tanpa NIS');
  assert.ok(daftar.some(item=>item.name==='Siswa Baru Tanpa NIS'&&item.nis===''));
});

test('8. Nomor kosong tidak dianggap duplikat, nomor ganda tetap ditolak',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const rows=[STUDENT_CSV_HEADERS,
    ['','315701','Siswa Tanpa NIS Satu','L','Islam','Bekasi, 1 Januari 2015','Orang Tua','','Kp. A'],
    ['','315702','Siswa Tanpa NIS Dua','P','Islam','Bekasi, 2 Januari 2015','Orang Tua','','Kp. B'],
  ];
  const preview=importKembali(session,rows);
  assert.equal(preview.invalidCount,0,'dua siswa sama-sama tanpa NIS tetap valid');
  commitStudentImport(session,preview);
  assert.equal(listStudents(session,{classId:'5B'}).length,2);

  const ganda=importKembali(session,[STUDENT_CSV_HEADERS,
    ['222310','315710','Siswa Ganda A','L','Islam','Bekasi, 1 Januari 2015','Orang Tua','','Kp. A'],
    ['222311','315710','Siswa Ganda B','P','Islam','Bekasi, 2 Januari 2015','Orang Tua','','Kp. B'],
  ]);
  assert.equal(ganda.canCommit,false,'NISN ganda pada satu berkas ditolak');
  assert.match(ganda.rows[1].errors.join(' '),/NISN/);
});

test('9. Import tidak menghapus siswa yang tidak ada di berkas',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const tetap=siswa(session,'01');
  siswa(session,'02');siswa(session,'03');
  const preview=importKembali(session,[STUDENT_CSV_HEADERS,
    ['222390','315790','Siswa Import Saja','L','Islam','Bekasi, 3 Maret 2015','Orang Tua','','Kp. C'],
  ]);
  commitStudentImport(session,preview);
  const daftar=listStudents(session,{classId:'5B'});
  assert.equal(daftar.length,4,'tiga siswa lama tetap ada, satu siswa baru ditambahkan');
  assert.ok(daftar.some(item=>item.id===tetap.id));
});

test('10. Kolom yang tidak ada di berkas tidak menghapus data lama',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const lama=siswa(session,'01',{religion:'Islam',phone:'0812',photo:''});
  /* Berkas lama tanpa kolom Agama dan Telepon: data itu tidak boleh ikut terhapus. */
  const preview=importKembali(session,[
    ['NIS','NISN','Nama','JK','Alamat'],
    ['222301','315701','Siswa 01 Ganti Nama','L','Kp. Alamat Baru'],
  ]);
  assert.equal(preview.updateCount,1);
  commitStudentImport(session,preview);
  const [siswaBaru]=listStudents(session,{classId:'5B'});
  assert.equal(siswaBaru.id,lama.id);
  assert.equal(siswaBaru.name,'Siswa 01 Ganti Nama');
  assert.equal(siswaBaru.address,'Kp. Alamat Baru');
  assert.equal(siswaBaru.religion,'Islam','agama lama tetap');
  assert.equal(siswaBaru.phone,'0812','telepon lama tetap');
  assert.equal(siswaBaru.birthDate,'2015-01-02','tanggal lahir lama tetap');
});

test('11. Template hanya membawa siswa rombel aktif pada scope yang benar',()=>{
  useMemoryStorage();
  const admin={role:'admin',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
  createStudent(admin,{classId:'5B',nis:'2223B1',nisn:'3157B1',name:'Siswa 5B',gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'',address:'Kp. Gebang',photo:''});
  createStudent(admin,{classId:'4A',nis:'2223A1',nisn:'3157A1',name:'Siswa 4A',gender:'P',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'',address:'Kp. Gebang',photo:''});

  const rows5b=templateRows(guru('5B'),'5B');
  assert.equal(rows5b.length,2);
  assert.equal(rows5b[1][2],'Siswa 5B','template 5B tidak membawa siswa rombel lain');

  const semesterLain={...guru('5B'),semester:`Genap ${ACADEMIC_YEAR}`};
  assert.equal(templateRows(semesterLain,'5B').length,1,'scope semester lain masih kosong');
});
