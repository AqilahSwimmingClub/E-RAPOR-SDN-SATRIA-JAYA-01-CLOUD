/* Normalisasi respons Dapodik. Modul ini murni: tidak membaca atau menulis basis data lokal,
   tidak menyentuh jaringan, dan hanya menyimpan kolom yang benar-benar dipakai aplikasi ini.
   Bentuk payload yang tidak dikenal ditolak lebih dulu supaya data lokal tidak pernah berubah
   berdasarkan tebakan struktur. */

function clean(value,max=180){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max);}
function digits(value,max=20){return String(value??'').replace(/\D/g,'').slice(0,max);}
function isObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}

export function normalizeDapodikEnvelope(payload){
  if(Array.isArray(payload))return payload;
  if(isObject(payload)){
    for(const key of ['rows','data','results']){
      if(Array.isArray(payload[key]))return payload[key];
    }
    if(payload.result!==undefined)return normalizeDapodikEnvelope(payload.result);
  }
  throw new Error('Format respons Dapodik tidak didukung.');
}

function requireId(value,label,index){
  const id=clean(value,120);
  if(!id)throw new Error(`${label} baris ${index+1} tidak memiliki ID Dapodik.`);
  return id;
}

function requireName(value,label,index){
  const name=clean(value,150);
  if(!name)throw new Error(`Nama ${label} baris ${index+1} kosong pada respons Dapodik.`);
  return name;
}

/* ID Dapodik kembar berarti respons tidak konsisten; sinkronisasi dihentikan sebelum preview
   dibuat supaya tidak ada baris yang menimpa baris lain secara diam-diam. */
function assertUniqueIds(rows,label){
  const seen=new Set();
  for(const row of rows){
    if(seen.has(row.dapodikId))throw new Error(`${label} dengan ID Dapodik kembar: ${row.dapodikId}.`);
    seen.add(row.dapodikId);
  }
  return rows;
}

function activeFlag(row){return row?.soft_delete!==1&&row?.soft_delete!=='1';}

export function normalizeSchool(payload){
  const [row]=normalizeDapodikEnvelope(payload);
  if(!isObject(row))throw new Error('Data sekolah Dapodik tidak ditemukan.');
  const npsn=digits(row.npsn,10);
  if(!npsn)throw new Error('Data sekolah Dapodik tidak memiliki NPSN.');
  return {npsn,name:clean(row.nama||row.name,150),semesterId:clean(row.semester_id||row.semesterId,20)};
}

function normalizeStudent(row,index){
  return {
    dapodikId:requireId(row.peserta_didik_id||row.id,'Siswa',index),
    nisn:digits(row.nisn),
    nis:clean(row.nis,40),
    name:requireName(row.nama||row.name,'siswa',index),
    gender:clean(row.jenis_kelamin||row.gender,4).toUpperCase(),
    classDapodikId:clean(row.rombongan_belajar_id||row.rombel_id,120),
    isActive:activeFlag(row)
  };
}

function normalizeTeacher(row,index){
  return {
    dapodikId:requireId(row.ptk_id||row.id,'Guru',index),
    name:requireName(row.nama||row.name,'guru',index),
    nip:clean(row.nip,40),
    gender:clean(row.jenis_kelamin||row.gender,4).toUpperCase(),
    isActive:activeFlag(row)
  };
}

function normalizeClass(row,index){
  const grade=Number.parseInt(row.tingkat_pendidikan_id??row.tingkat??'',10);
  return {
    dapodikId:requireId(row.rombongan_belajar_id||row.id,'Rombel',index),
    name:requireName(row.nama||row.name,'rombel',index),
    grade:Number.isFinite(grade)?grade:null,
    teacherDapodikId:clean(row.ptk_id,120),
    isActive:activeFlag(row)
  };
}

function normalizeSubject(row,index){
  return {
    dapodikId:requireId(row.mata_pelajaran_id||row.id,'Mata pelajaran',index),
    name:requireName(row.nama||row.name,'mata pelajaran',index),
    isActive:activeFlag(row)
  };
}

function normalizeLesson(row,index){
  return {
    dapodikId:requireId(row.pembelajaran_id||row.id,'Pembelajaran',index),
    classDapodikId:clean(row.rombongan_belajar_id||row.rombel_id,120),
    subjectDapodikId:clean(row.mata_pelajaran_id,120),
    teacherDapodikId:clean(row.ptk_id,120),
    isActive:activeFlag(row)
  };
}

function normalizeList(payload,mapper,label){
  if(payload===undefined||payload===null)return [];
  return assertUniqueIds(normalizeDapodikEnvelope(payload).map(mapper),label);
}

export function normalizeDapodikDataset(payload){
  if(!isObject(payload))throw new Error('Format respons Dapodik tidak didukung.');
  return {
    school:normalizeSchool(payload.school),
    teachers:normalizeList(payload.teachers,normalizeTeacher,'Guru'),
    students:normalizeList(payload.students,normalizeStudent,'Siswa'),
    classes:normalizeList(payload.classes,normalizeClass,'Rombel'),
    subjects:normalizeList(payload.subjects,normalizeSubject,'Mata pelajaran'),
    lessons:normalizeList(payload.lessons,normalizeLesson,'Pembelajaran')
  };
}

/* Dipanggil sebelum preview dibuat. NPSN atau semester yang berbeda berarti operator sedang
   terhubung ke sekolah atau periode lain, sehingga proses dihentikan sebelum ada mutasi lokal. */
export function validateSchoolContext(school,expected){
  const npsn=digits(school?.npsn,10),harapan=digits(expected?.npsn,10);
  if(!harapan)throw new Error('NPSN sekolah pada pengaturan Dapodik belum diisi.');
  if(npsn!==harapan)throw new Error(`NPSN Dapodik berbeda dari NPSN sekolah (${npsn||'kosong'}).`);
  const semester=clean(school?.semesterId,20),semesterHarapan=clean(expected?.semesterId,20);
  if(!semesterHarapan)throw new Error('Semester Dapodik pada pengaturan belum diisi.');
  if(semester!==semesterHarapan)throw new Error(`Semester Dapodik berbeda dari semester aktif (${semester||'kosong'}).`);
  return true;
}
