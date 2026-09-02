import { SUBJECTS_DEFAULT } from '../data/constants.js';
import { normalizeMappingGroups } from './mapping.js';
import { loadDb, updateDb } from './storage.js';

/* Aplikasi ini dipakai banyak sekolah, sehingga TIDAK ADA data siswa contoh yang ikut
   didistribusikan maupun dimasukkan otomatis. Instalasi baru dimulai dengan nol siswa
   sampai Admin menginput atau mengimpor datanya sendiri. Siswa yang sudah tersimpan pada
   instalasi lama tidak pernah disentuh oleh perubahan ini.

   Penanda seed lama dibiarkan apa adanya di settings pengguna lama: membacanya tidak
   diperlukan lagi, dan menghapusnya tidak memberi manfaat apa pun. */

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

