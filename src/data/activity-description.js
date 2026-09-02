/* Kalimat deskripsi kegiatan disusun dari satu tempat supaya Ekstrakurikuler, Kokurikuler,
   dan Intrakurikuler menghasilkan bentuk kalimat yang sama: nama siswa, capaian sesuai
   predikat, nama kegiatan, lalu fokus kegiatannya bila tersedia. */

export const PREDICATE_SENTENCES=Object.freeze({
  'Sangat Baik':'menunjukkan penguasaan yang sangat baik, aktif, mandiri, dan konsisten',
  'Baik':'menunjukkan penguasaan yang baik dan mampu menyelesaikan kegiatan dengan cukup mandiri',
  'Cukup':'menunjukkan penguasaan yang cukup dan masih memerlukan arahan pada beberapa bagian',
  'Perlu Bimbingan':'masih memerlukan bimbingan bertahap agar dapat memahami dan menyelesaikan kegiatan dengan lebih baik',
});

function lowerFirst(text){return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;}

export function composeActivityDescription({studentName='',activityName='',detail='',predicate='Baik',fallbackActivity='kegiatan'}={}){
  const name=String(studentName||'Siswa').trim()||'Siswa';
  const kegiatan=String(activityName||'').trim()||fallbackActivity;
  const fokus=String(detail||'').trim();
  const capaian=PREDICATE_SENTENCES[predicate]||PREDICATE_SENTENCES.Baik;
  const tambahan=fokus?` Fokus kegiatan mencakup ${lowerFirst(fokus)}`:'';
  return `${name} ${capaian} pada kegiatan ${kegiatan}.${tambahan}`.replace(/\.\./g,'.');
}
