import { escapeHtml } from '../ui/dom.js';

/* LEMBAR A4 TRANSKRIP, SKL, DAN SKKB.

   Ketiganya dirakit di sini sebagai HTML murni dari objek dokumen yang sudah lengkap, tanpa
   menyentuh storage sama sekali. Karena itu test dapat memanggilnya langsung dengan dokumen
   buatan sendiri, dan yang diuji benar-benar lembar yang dicetak - bukan tiruannya.

   TIDAK ADA IDENTITAS YANG DITANAM DI SINI. Nama sekolah, daerah, lambang, kepala sekolah,
   nomor surat, dan tanggal seluruhnya datang dari objek dokumen. Berkas ini tidak mengenal
   satu pun sekolah tertentu.

   TIDAK ADA KELOMPOK A/B. Tabel mata pelajaran adalah satu daftar bernomor 1..N mengikuti
   Mapping Mata Pelajaran aktif - urutan yang sama dengan Rapor. */

const kosong='..............................';
function teks(value){return escapeHtml(String(value??'').trim());}
function isi(value,cadangan=kosong){const bersih=String(value??'').trim();return escapeHtml(bersih||cadangan);}
/* Nilai dokumen resmi ditulis dua desimal dengan koma, sesuai contoh transkrip sekolah. */
function nilai(value){return Number.isFinite(value)?escapeHtml(Number(value).toFixed(2).replace('.',',')):'—';}

/* Lambang daerah dicetak dengan tinggi tetap dan lebar mengikuti rasionya sendiri, sehingga
   lambang berbentuk apa pun tidak pernah gepeng, terpotong, maupun teregang. Slotnya tetap
   ada walau lambang belum diunggah supaya kop tidak bergeser. */
function lambangDaerah(school){
  const logo=String(school?.regionLogo||'').trim();
  return `<div class="letter-crest">${logo?`<img src="${escapeHtml(logo)}" alt="Lambang daerah"/>`:''}</div>`;
}

export function letterHead(doc){
  const school=doc.school||{};
  const baris=[school.regionHeading,'DINAS PENDIDIKAN',String(school.name||'').toUpperCase()].map(item=>String(item||'').trim()).filter(Boolean);
  const alamat=[school.addressLine,[school.phone&&`Telp. ${school.phone}`,school.email].filter(Boolean).join(' · ')]
    .map(item=>String(item||'').trim()).filter(Boolean);
  return `<header class="letter-head">${lambangDaerah(school)}<div class="letter-head-text">${
    baris.map((item,index)=>`<${index===baris.length-1?'strong':'span'}>${teks(item)}</${index===baris.length-1?'strong':'span'}>`).join('')
  }${alamat.map(item=>`<small>${teks(item)}</small>`).join('')}</div></header>`;
}

/* Satu baris identitas: label, titik dua sejajar, lalu isinya. Titik dua berada di kolomnya
   sendiri supaya seluruh isi mulai pada garis yang sama sepanjang label apa pun. */
function barisIdentitas(label,value){
  return `<tr><td class="letter-label">${teks(label)}</td><td class="letter-colon">:</td><td class="letter-value">${isi(value)}</td></tr>`;
}
function tabelIdentitas(rows){
  return `<table class="letter-identity"><tbody>${rows.map(([label,value])=>barisIdentitas(label,value)).join('')}</tbody></table>`;
}

/* Tabel mata pelajaran dipakai Transkrip dan SKL dengan bentuk yang sama persis, sehingga
   keduanya tidak mungkin memakai urutan atau penomoran yang berbeda.

   BARIS REKAP NILAI RATA-RATA. Sebelumnya labelnya rata kanan sehingga menempel ke garis
   kolom Nilai dan terbaca seperti catatan kecil, bukan seperti rekap. Sekarang ia menjadi
   baris tersendiri sesudah mata pelajaran terakhir: satu sel menggabungkan kolom No dan Mata
   Pelajaran dengan labelnya di TENGAH, dan angkanya tetap berdiri pada kolom Nilai, juga di
   tengah. Yang berubah hanya tata letaknya - angkanya dihitung oleh penyusun dokumen dan
   tidak disentuh sama sekali di sini. */
export function subjectScoreTable(doc){
  const rows=Array.isArray(doc.rows)?doc.rows:[];
  return `<table class="letter-table"><thead><tr><th class="letter-no">No.</th><th class="letter-subject">Mata Pelajaran</th><th class="letter-score">Nilai</th></tr></thead><tbody>${
    rows.map(row=>`<tr><td class="letter-no">${row.number}.</td><td class="letter-subject">${teks(row.name)}</td><td class="letter-score">${nilai(row.score)}</td></tr>`).join('')
  }</tbody>${rows.length?`<tfoot><tr class="letter-average-row"><th class="letter-average" colspan="2">NILAI RATA-RATA</th><th class="letter-score letter-average-score">${nilai(doc.average)}</th></tr></tfoot>`:''}</table>`;
}

/* Blok tanda tangan Kepala Sekolah. Nama dan NIP datang dari Data Sekolah; tempat dan tanggal
   dari Pengaturan TRANSKRIP-SKL-SKKB. Ruang tanda tangannya cukup untuk dibubuhi tanpa
   menghabiskan setengah halaman. */
export function principalSignature(doc){
  const school=doc.school||{};
  const tanggal=String(doc.settings?.documentDateLabel||'').trim();
  return `<div class="letter-sign"><div class="letter-sign-block"><span>${isi(tanggal,'')}</span><span>Kepala ${teks(school.name)}</span><strong>${isi(school.principalName)}</strong><small>NIP. ${isi(school.principalNip,'-')}</small></div></div>`;
}

export function transcriptSheet(doc){
  return `<section class="document-a4 letter-a4 transcript-letter">${letterHead(doc)}
    <div class="letter-title"><h1>${teks(doc.title)}</h1><p>Nomor: ${isi(doc.number)}</p></div>
    ${tabelIdentitas([
      ['Satuan Pendidikan',doc.school?.name],
      ['Nomor Pokok Sekolah Nasional',doc.school?.npsn],
      ['Nama Lengkap',doc.student?.name],
      ['Tempat, Tanggal Lahir',doc.student?.birthPlaceDate],
      ['Nomor Induk Siswa Nasional',doc.student?.nisn],
      ['Nomor Ijazah',doc.diplomaNumber],
      ['Tanggal Kelulusan',doc.settings?.graduationDateLabel],
    ])}
    ${subjectScoreTable(doc)}
    ${principalSignature(doc)}</section>`;
}

/* JUDUL SKL DITULIS SEBAGAI SATU BARIS.

   Sebelumnya judulnya berisi <br/> di dalam h1, yang memaksa "LULUS" turun ke baris kedua.
   Pemenggalan itu bukan hasil aturan tata letak melainkan pemisah yang ditanam di markup,
   sehingga selalu terjadi berapa pun lebar kertasnya. Lebar A4 lebih dari mencukupi untuk
   "SURAT KETERANGAN LULUS", jadi <br/>-nya dibuang dan judulnya dibiarkan mengalir sendiri -
   tanpa positioning absolut, transform, maupun pengecilan huruf.

   Penjelasan ini sengaja berada di sumber, bukan sebagai komentar HTML di dalam lembar:
   apa pun yang ditulis di dalam template ikut terbawa ke dokumen yang dicetak.

   SKKB TIDAK IKUT BERUBAH - judulnya tetap dua baris seperti format aslinya. */
export function sklSheet(doc){
  const school=doc.school||{};
  const keputusan=String(doc.number||'').trim();
  return `<section class="document-a4 letter-a4 skl-letter">${letterHead(doc)}
    <div class="letter-title"><h1>SURAT KETERANGAN LULUS</h1><p class="letter-year">TAHUN AJARAN ${teks(doc.academicYear)}</p><p>Nomor: ${isi(keputusan)}</p></div>
    <p class="letter-lead">Yang bertanda tangan di bawah ini Kepala ${teks(school.name)} menerangkan bahwa:</p>
    ${tabelIdentitas([
      ['Nama Lengkap',doc.student?.name],
      ['Tempat, Tanggal Lahir',doc.student?.birthPlaceDate],
      ['Nomor Induk Siswa',doc.student?.nis],
      ['Nomor Induk Siswa Nasional',doc.student?.nisn],
    ])}
    <p class="letter-body">Berdasarkan hasil penilaian dan rapat penetapan kelulusan ${teks(school.name)} Tahun Ajaran ${teks(doc.academicYear)}${keputusan?` Nomor ${teks(keputusan)}`:''}, yang bersangkutan dinyatakan:</p>
    <p class="letter-verdict">${isi(doc.statusLabel,'BELUM DITETAPKAN')}</p>
    <p class="letter-body">Dengan hasil sebagai berikut:</p>
    ${subjectScoreTable(doc)}
    ${principalSignature(doc)}</section>`;
}

export function skkbSheet(doc){
  const school=doc.school||{};
  const daerah=[String(school.district||'').trim()&&`Kecamatan ${String(school.district).trim()}`,String(school.city||'').trim()]
    .filter(Boolean).join(' ');
  return `<section class="document-a4 letter-a4 skkb-letter">${letterHead(doc)}
    <div class="letter-title"><h1>SURAT KETERANGAN KELAKUAN<br/>BAIK</h1><p>Nomor: ${isi(doc.number)}</p></div>
    <p class="letter-lead">Kepala ${teks(school.name)}${daerah?` ${teks(daerah)}`:''} dengan ini menerangkan bahwa:</p>
    ${tabelIdentitas([
      ['N A M A',doc.student?.name],
      ['Tempat / Tanggal Lahir',doc.student?.birthPlaceDate],
      ['Jenis Kelamin',doc.student?.genderLabel],
      ['Nama Orang Tua',doc.student?.parentName],
      ['No. Induk',doc.student?.nis],
      ['No. NISN',doc.student?.nisn],
      ['No. Peserta Ujian',doc.examNumber],
    ])}
    <p class="letter-body">Berdasarkan catatan dan pengamatan kami selama yang bersangkutan menjadi peserta didik di ${teks(school.name)}, yang bersangkutan dinyatakan berkelakuan:</p>
    <p class="letter-verdict">${isi(String(doc.predicate||'').toUpperCase(),'BELUM DITETAPKAN')}</p>
    <p class="letter-body">Surat keterangan ini diberikan untuk melengkapi persyaratan melanjutkan pendidikan ke jenjang berikutnya, dan dipergunakan sebagaimana mestinya.</p>
    ${principalSignature(doc)}</section>`;
}
