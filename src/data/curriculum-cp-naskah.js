/* NASKAH CAPAIAN PEMBELAJARAN RESMI — berkas data, bukan logika.

   Berkas ini sengaja dipisahkan dari `curriculum-cp.js`. Di sana ada aturan: mata pelajaran
   apa, fase mana, elemen apa, regulasi siapa. Di sini hanya ada KUTIPAN dari dokumen resmi.
   Pemisahan itu yang membuat janji "naskah dapat dimuat kemudian hanya dengan perubahan data"
   benar-benar dapat ditepati: mengisi naskah tidak perlu menyentuh satu baris logika pun.

   ATURAN PENGISIAN — dibaca sebelum menambah satu huruf pun:

   1. Naskah HANYA disalin dari dokumen resmi penetapnya. Bukan dari blog, Scribd, situs
      sekolah, rangkuman guru, media sosial, repositori tidak resmi, ataupun hasil generatif.
   2. Salin apa adanya. Jangan diparafrase, diringkas, digabung, atau "dirapikan".
   3. Kombinasi yang naskahnya belum diverifikasi TIDAK DIISI. Kosong itu jujur; terisi tebakan
      itu berbahaya, karena guru akan memakainya sebagai acuan penilaian.
   4. Satu entri = satu mata pelajaran pada satu fase. Kuncinya `subjectId|phase`.

   BENTUK ENTRI:

     'mtk|A':{
       ringkas:'... naskah CP fase, apa adanya dari dokumen ...',
       elemen:{
         'Bilangan':'... capaian elemen Bilangan pada Fase A, apa adanya ...',
         'Geometri':'...',
       },
     }

   `ringkas` adalah naskah CP untuk fase itu secara keseluruhan; `elemen` memuat capaian per
   elemen. Keduanya opsional: dokumen yang hanya memuat capaian per elemen boleh mengisi
   `elemen` saja, dan sebaliknya. Nama kunci pada `elemen` harus PERSIS sama dengan nama elemen
   pada `curriculum-cp.js`, karena itulah yang menautkan keduanya.

   STATUS SAAT INI: KOSONG.

   Tidak ada satu pun naskah yang berhasil diverifikasi dari lingkungan kerja ini:

   - Keputusan Kepala BSKAP Nomor 046/H/KR/2025 (mapel nasional dan Agama) serta Panduan Mata
     Pelajaran Koding dan Kecerdasan Artifisial 2025 berada di kurikulum.kemendikdasmen.go.id
     dan repositori.kemendikdasmen.go.id. Kedua domain ditolak oleh kebijakan jaringan
     lingkungan ini (gateway menjawab 403 atas CONNECT), sehingga dokumennya tidak terjangkau.
   - Naskah Bahasa Sunda ada pada berkas "Buku Saku KM Mulok Sunda.pdf" milik pengguna. Berkas
     itu belum ada di repositori maupun workspace, jadi belum dapat diekstrak.

   Selama daftar ini kosong, antarmuka menampilkan elemen CP beserta kutipan regulasinya dan
   menyatakan terus terang bahwa naskahnya belum tersedia. `cpNaskahReport()` melaporkan sisa
   pekerjaannya beserta alasan tiap kekosongan. */

export const CP_NASKAH=Object.freeze({});

/* Naskah CP satu mata pelajaran pada satu fase, atau null bila belum dimuat. */
export function naskahCp(subjectId,phase){
  return CP_NASKAH[`${subjectId}|${phase}`]?.ringkas??null;
}

/* Capaian satu elemen CP, atau null bila belum dimuat. */
export function naskahElemen(subjectId,phase,elementName){
  return CP_NASKAH[`${subjectId}|${phase}`]?.elemen?.[elementName]??null;
}
