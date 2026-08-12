import { CLASSES } from '../data/constants.js';
import { assertReportPrintable, getDocumentIdentity, getLeger, getReportCompleteness, getReportDocument, legerWorkbookBytes } from '../services/documents.js';
import { listStudents } from '../services/students.js';
import { saveFile } from '../services/file-io.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { digitalGauge } from '../ui/digital-gauge.js';
import { isDesktop, printCurrentDocument, showDocumentPreview } from '../services/print-service.js';

const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const DOTS='..................................';
const PAGE_SIZE_STYLE_ID='erapor-print-page-size';

/* Logo bawaan aplikasi untuk Cover. Logo pada master sekolah selalu diprioritaskan
   agar setiap sekolah dapat memasang lambang daerahnya sendiri. */
export const COVER_LOGO_DEFAULTS=Object.freeze({
  ministry:'./assets/logo-tut-wuri-handayani.png',
  region:'./assets/logo-kabupaten-bekasi.png',
});

/* Leger memakai A4 landscape. Ukuran halaman default harus ditimpa sebelum cetak
   karena lebar layout cetak Chromium mengikuti @page default, bukan named page. */
export function setPrintPageSize(orientation){
  const host=globalThis.document;if(!host?.head)return null;
  const existing=host.getElementById(PAGE_SIZE_STYLE_ID);
  if(!orientation){existing?.remove();return null;}
  const style=existing||host.createElement('style');
  style.id=PAGE_SIZE_STYLE_ID;
  style.textContent=`@media print{@page{size:A4 ${orientation};margin:8mm}}`;
  if(!existing)host.head.append(style);
  return style;
}

function number(value){return value===null||value===undefined?'—':Number(value).toLocaleString('id-ID',{maximumFractionDigits:2});}
function classes(selected){return CLASSES.map(item=>`<option value="${item}" ${item===selected?'selected':''}>Kelas ${item}</option>`).join('');}
function badge(complete){return `<span class="badge ${complete?'badge-active':'badge-inactive'}">${complete?'Lengkap':'Belum Lengkap'}</span>`;}
function blank(value){return escapeHtml(String(value??'').trim());}
function longDate(value){const raw=String(value||'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return '';const [year,month,day]=raw.split('-').map(Number);return `${String(day).padStart(2,'0')} ${MONTHS[month-1]} ${year}`;}
function genderLabel(value){return value==='L'?'Laki-Laki':value==='P'?'Perempuan':'';}
function fileNamePart(value){return String(value??'').trim().replace(/[\\/:*?"<>|]+/g,'-');}

function identityRow(index,label,value,{indent=false}={}){
  return `<tr class="${indent?'is-indent':''}"><td class="identity-no">${index?`${index}.`:''}</td><td class="identity-label">${escapeHtml(label)}</td><td class="identity-sep">:</td><td class="identity-value">${blank(value)}</td></tr>`;
}

function signatureBlock(name,nip){
  return `<strong>${name?escapeHtml(name):DOTS}</strong>${nip?`<small>NIP. ${escapeHtml(nip)}</small>`:'<small>NIP.</small>'}`;
}

export function renderPrint(session){
  let classId=session.role==='teacher'?session.classId:CLASSES[0];
  let scope={...session,role:'teacher',classId};
  let tab='leger';let studentId='';let showLandscape=false;let previewed=false;
  const root=el(`<div class="print-workspace"><div class="page-head no-print"><div><h1>Cetak Nilai</h1><p>Leger, cover, perlengkapan rapor, pemeriksaan kelengkapan, dan Cetak Rapor A4 dari data tersimpan.</p></div></div><div class="report-tabs print-tabs no-print"><button class="tab active" data-tab="leger">Leger</button><button class="tab" data-tab="cover">Cover</button><button class="tab" data-tab="equipment">Perlengkapan</button><button class="tab" data-tab="completeness">Kelengkapan Rapor</button><button class="tab" data-tab="report">Cetak Rapor</button></div>${session.role==='admin'?`<section class="card module-filter no-print"><div class="field compact-field"><label>Rombel</label><select class="input" data-class>${classes(classId)}</select></div><div class="scope-note">Dokumen Kelas<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section>`:''}<div data-view></div></div>`);
  const view=root.querySelector('[data-view]');

  function refresh(){scope={...session,role:'teacher',classId};const students=listStudents(scope,{classId});if(!students.some(student=>student.id===studentId))studentId=students[0]?.id||'';return students;}
  function documentTitle(label,student){return [label,`Kelas ${classId}`,student?.name,session.semester,session.academicYear.replace('/','-')].filter(Boolean).map(fileNamePart).join(' - ');}

  function bindActions(label,{student=null,requireComplete=false,onPreview=null}={}){
    const run=async savePdf=>{
      try{
        if(requireComplete)assertReportPrintable(scope,studentId);
        /* Pada desktop, dialog cetak Windows tidak menyediakan preview. Dokumen ditampilkan
           dan dikonfirmasi lebih dulu di aplikasi agar guru tetap memeriksa sebelum mencetak. */
        if(!savePdf&&isDesktop()){
          showDocumentPreview();
          const lanjut=await confirmDialog({title:`Preview ${label}`,message:'Dokumen sudah tampil di layar. Periksa hasilnya, lalu lanjutkan ke dialog cetak Windows. Dialog Windows memang tidak menampilkan preview, jadi pemeriksaan dilakukan di aplikasi ini.',confirmText:'Lanjut Cetak'});
          if(!lanjut)return;
        }
        if(savePdf&&!globalThis.desktopBridge)toast('Pilih tujuan “Save as PDF” pada dialog cetak perangkat.');
        const hasil=await printCurrentDocument({title:documentTitle(label,student),savePdf});
        if(savePdf&&hasil?.saved)toast(`PDF berhasil disimpan: ${hasil.path}`);
        else if(savePdf&&hasil?.canceled)toast('Penyimpanan PDF dibatalkan.','warning');
      }catch(error){toast(error.message,'error');}
    };
    view.querySelector('[data-print]')?.addEventListener('click',()=>run(false));
    view.querySelector('[data-pdf]')?.addEventListener('click',()=>run(true));
    view.querySelector('[data-preview]')?.addEventListener('click',()=>{
      if(onPreview){onPreview();return;}
      view.querySelector('.document-sheet')?.scrollIntoView({behavior:'smooth',block:'start'});
      toast(`Preview ${label} siap dicetak.`);
    });
  }

  /* Cetak massal: seluruh siswa rombel aktif dirender sekaligus, tiap siswa mulai di halaman
     baru. Pilihan cetak satu siswa tetap tersedia lewat pemilih siswa di atas. */
  let bulkMode=false;
  function bulkToolbar(label,count){
    return `<section class="card report-print-control bulk-print-control no-print"><span>${escapeHtml(label)} · ${count} siswa</span><button class="btn btn-light" data-bulk-toggle>${bulkMode?'Kembali ke Satu Siswa':'Semua Siswa'}</button><button class="btn btn-light" data-print>${icon('printer',16)} Cetak</button><button class="btn btn-primary" data-pdf>${icon('download',16)} Simpan PDF</button></section>`;
  }
  function bindBulkToggle(){
    view.querySelector('[data-bulk-toggle]')?.addEventListener('click',()=>{bulkMode=!bulkMode;previewed=bulkMode;draw();});
  }
  function bulkSheets(students,builder){
    return students.map(student=>{
      try{return builder(getReportDocument(scope,student.id));}
      catch{return '';}
    }).join('');
  }

  function studentPicker(students){return `<div class="field compact-field"><label>Pilih Siswa</label><select class="input" data-student>${students.map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===studentId?'selected':''}>${escapeHtml(item.name)} · ${escapeHtml(item.nisn)}</option>`).join('')}</select></div>`;}
  function toolbar(lead,{disabled=false,bulk=false}={}){return `<section class="card report-print-control no-print">${lead}${bulk?`<button class="btn btn-light" data-bulk-toggle>Semua Siswa</button>`:''}<button class="btn btn-light" data-preview>${icon('file',16)} Preview</button><button class="btn btn-light" data-print ${disabled?'disabled':''}>${icon('printer',16)} Cetak</button><button class="btn btn-primary" data-pdf ${disabled?'disabled':''}>${icon('download',16)} Simpan PDF</button></section>`;}
  function bindStudentPicker(){const picker=view.querySelector('[data-student]');if(picker)picker.onchange=event=>{studentId=event.target.value;previewed=false;draw();};}
  function emptyClass(){view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan Data Siswa pada rombel ini sebelum mencetak dokumen rapor.</p></section>';}

  /* ---------------------------------------------------------------- Leger */

  function legerHeading(data){
    return `<section class="document-print-heading leger-heading"><strong>LEGER NILAI RAPOR SISWA TAHUN PELAJARAN ${escapeHtml(data.academicYear)} ${escapeHtml(String(data.semester).split(' ')[0].toUpperCase())}</strong><span>SEKOLAH : ${escapeHtml(data.school.name)}</span><span>Kelas : ${escapeHtml(data.classLabel||`Kelas ${classId}`)}</span></section>`;
  }

  function legerTable(data){
    const span=data.subjects.length;
    const footRow=(label,values)=>`<tr><th colspan="4">${escapeHtml(label)}</th>${values.map(value=>`<th>${number(value)}</th>`).join('')}<th colspan="6"></th></tr>`;
    return `<section class="card leger-table-card ${showLandscape?'show-mobile-table':''}"><div class="table-scroll"><table class="data-table leger-table"><thead><tr><th rowspan="2">NO</th><th rowspan="2">NAMA SISWA</th><th rowspan="2">NISN</th><th rowspan="2">NIS</th><th colspan="${span}">MATA PELAJARAN</th><th rowspan="2">TOTAL</th><th rowspan="2">RATA-RATA</th><th rowspan="2">RANK</th><th colspan="3">Ketidakhadiran</th></tr><tr>${data.subjects.map(subject=>`<th title="${escapeHtml(subject.name)}">${escapeHtml(subject.name)}</th>`).join('')}<th>Sakit</th><th>Izin</th><th>Alpa</th></tr></thead><tbody>${data.students.map((row,index)=>`<tr><td>${index+1}</td><td class="leger-name">${escapeHtml(row.student.name)}</td><td>${escapeHtml(row.student.nisn)}</td><td>${escapeHtml(row.student.nis)}</td>${row.scores.map(item=>`<td>${number(item.score)}</td>`).join('')}<td>${number(row.total)}</td><td><strong>${number(row.average)}</strong></td><td>${row.rank??'—'}</td><td>${row.attendance.Sakit}</td><td>${row.attendance.Izin}</td><td>${row.attendance.Alpa}</td></tr>`).join('')}</tbody><tfoot>${footRow('NILAI TERTINGGI',data.subjectAverages.map(item=>item.highest))}${footRow('NILAI TERENDAH',data.subjectAverages.map(item=>item.lowest))}${footRow('RATA-RATA MAPEL',data.subjectAverages.map(item=>item.average))}</tfoot></table></div></section>`;
  }

  function drawLeger(){
    refresh();const data=getLeger(scope);
    view.innerHTML=`${toolbar('<span>Leger Kelas · seluruh siswa rombel</span>')}<div class="assessment-summary leger-summary no-print"><article class="stat-card"><div class="stat-label">Jumlah Siswa</div><div class="stat-value">${data.students.length}</div></article><article class="stat-card"><div class="stat-label">Mapel Aktif</div><div class="stat-value">${data.subjects.length}</div></article><article class="stat-card"><div class="stat-label">Rata-rata Kelas</div><div class="stat-value">${number(data.classAverage)}</div></article></div><div class="print-toolbar no-print"><span>Urutan kolom mengikuti Mapping Mata Pelajaran.</span><div class="actions"><button class="btn btn-light" data-excel>${icon('download',16)} Unduh Excel</button><button class="btn btn-light" data-landscape>${showLandscape?'Sembunyikan Tabel Landscape':'Tampilkan Tabel Landscape'}</button></div></div><div class="document-sheet document-leger">${legerHeading(data)}${legerTable(data)}</div><div class="leger-card-list">${data.students.map(row=>`<article class="card"><div><strong>${escapeHtml(row.student.name)}</strong><span>${escapeHtml(row.student.nisn)}</span></div><b>${number(row.average)}</b><small>${row.completeCount}/${data.subjects.length} nilai tersedia · Rank ${row.rank??'—'}</small></article>`).join('')}</div>`;
    view.querySelector('[data-landscape]').onclick=()=>{showLandscape=!showLandscape;draw();};
    view.querySelector('[data-excel]').onclick=async()=>{
      try{await saveFile({name:`${documentTitle('Leger')}.xlsx`,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',data:legerWorkbookBytes(scope)});toast('Leger Excel berhasil disimpan.');}
      catch(error){toast(error.message,'error');}
    };
  }

  /* ---------------------------------------------------------------- Cover */

  /* Slot memangkas ruang kosong bawaan kanvas file logo agar ukuran yang tampak dan
     jaraknya mengikuti gambar referensi Cover. Logo unggahan Admin tidak diketahui
     ruang kosongnya sehingga ditampilkan utuh. */
  function coverLogo(source,fallback,className,label){
    return `<span class="cover-logo ${className}${source?' cover-logo-custom':''}"><img src="${escapeHtml(source||fallback)}" alt="${escapeHtml(label)}" data-cover-logo="${escapeHtml(label)}"/></span>`;
  }

  /* Slot logo yang filenya belum tersedia diganti penanda layar agar hasil cetak tetap bersih. */
  function bindCoverLogos(){
    view.querySelectorAll('[data-cover-logo]').forEach(image=>image.addEventListener('error',()=>{
      const slot=image.closest('.cover-logo')||image;
      slot.replaceWith(el(`<span class="${slot.className||''} cover-logo-empty no-print">${escapeHtml(image.dataset.coverLogo)}<small>Unggah di Data Referensi → Sekolah</small></span>`));
    },{once:true}));
  }

  function coverSheet(doc){
    const school=doc.master.school,student=doc.student;
    /* Susunan dan ukuran mengikuti berkas referensi cover.pdf. */
    return `<section class="document-a4 document-sheet report-cover-a4">${coverLogo(school.ministryLogo,COVER_LOGO_DEFAULTS.ministry,'cover-logo-ministry','Logo Tut Wuri Handayani')}<div class="cover-title"><strong>SEKOLAH DASAR</strong><span>( SD )</span></div>${coverLogo(school.regionLogo,COVER_LOGO_DEFAULTS.region,'cover-logo-region','Lambang Daerah')}<div class="cover-fields"><div class="cover-field"><span>Nama Peserta Didik</span><div class="cover-box">${escapeHtml(student.name)}</div></div><div class="cover-field"><span>NISN / NIS</span><div class="cover-box">${escapeHtml(student.nisn)} / ${escapeHtml(student.nis)}</div></div></div><div class="cover-ministry"><strong>KEMENTERIAN PENDIDIKAN DASAR DAN MENENGAH</strong><strong>REPUBLIK INDONESIA</strong></div></section>`;
  }

  function drawCover(){
    const students=refresh();if(!students.length){emptyClass();return;}
    if(bulkMode){
      view.innerHTML=`${bulkToolbar('Cetak Semua Cover',students.length)}${bulkSheets(students,coverSheet)}`;
      bindCoverLogos();bindBulkToggle();return;
    }
    const doc=getReportDocument(scope,studentId);
    view.innerHTML=`${toolbar(studentPicker(students),{bulk:true})}${coverSheet(doc)}`;
    bindCoverLogos();bindStudentPicker();bindBulkToggle();
  }

  /* -------------------------------------------------- Perlengkapan Rapor */

  function schoolSheet(doc){
    const school=doc.master.school;
    const row=(label,value)=>`<tr><td class="identity-label">${escapeHtml(label)}</td><td class="identity-sep">:</td><td class="identity-value">${blank(value)}</td></tr>`;
    return `<section class="document-a4 document-sheet equipment-sheet"><div class="cover-title equipment-title"><strong>SEKOLAH DASAR</strong><span>( SD )</span></div><table class="document-identity equipment-identity"><tbody>${row('Nama Sekolah',school.name)}${row('NPSN',school.npsn)}${row('NIS/NSS/NDS',school.registrationNumber)}${row('Alamat Sekolah',school.address)}${row('Kelurahan / Desa',school.village)}${row('Kecamatan',school.district)}${row('Kota/Kabupaten',school.city)}${row('Provinsi',school.province)}${row('Website',school.website)}${row('E-mail',school.email)}</tbody></table></section>`;
  }

  function studentIdentitySheet(doc){
    const student=doc.student,school=doc.master.school,settings=doc.printSettings;
    const father=student.fatherName||student.parentName||'';
    const rows=[
      identityRow(1,'Nama Lengkap Peserta Didik',student.name),
      identityRow(2,'Nomor Induk/NISN',`${student.nis} / ${student.nisn}`),
      identityRow(3,'Tempat, Tanggal Lahir',[student.birthPlace,longDate(student.birthDate)].filter(Boolean).join(', ')),
      identityRow(4,'Jenis Kelamin',genderLabel(student.gender)),
      identityRow(5,'Agama',student.religion),
      identityRow(6,'Status dalam Keluarga',student.familyStatus),
      identityRow(7,'Anak ke',student.childOrder),
      identityRow(8,'Alamat Peserta Didik',student.address),
      identityRow(9,'Nomor Telepon Rumah',student.phone),
      identityRow(10,'Sekolah Asal',student.previousSchool),
      identityRow(11,'Diterima di sekolah ini',''),
      identityRow(0,'Di kelas',student.admissionClass,{indent:true}),
      identityRow(0,'Pada tanggal',longDate(student.admissionDate),{indent:true}),
      identityRow(12,'Nama Orang Tua',''),
      identityRow(0,'a. Ayah',father,{indent:true}),
      identityRow(0,'b. Ibu',student.motherName,{indent:true}),
      identityRow(13,'Alamat Orang Tua',student.parentAddress),
      identityRow(0,'Nomor Telepon Rumah',student.parentPhone,{indent:true}),
      identityRow(14,'Pekerjaan Orang Tua',''),
      identityRow(0,'a. Ayah',student.fatherJob,{indent:true}),
      identityRow(0,'b. Ibu',student.motherJob,{indent:true}),
      identityRow(15,'Nama Wali Siswa',student.guardianName),
      identityRow(16,'Alamat Wali Peserta Didik',student.guardianAddress),
      identityRow(0,'Nomor Telepon Rumah',student.guardianPhone,{indent:true}),
      identityRow(17,'Pekerjaan Wali Peserta Didik',student.guardianJob),
    ].join('');
    return `<section class="document-a4 document-sheet equipment-sheet"><h2 class="document-heading">IDENTITAS PESERTA DIDIK</h2><table class="document-identity equipment-identity numbered"><tbody>${rows}</tbody></table><div class="equipment-sign"><div class="equipment-photo">${student.photo?`<img src="${escapeHtml(student.photo)}" alt=""/>`:'<span>Foto 3 × 4</span>'}</div><div class="equipment-sign-block"><span>${escapeHtml(settings.printDateLabel||`${settings.city||'Bekasi'}, ${DOTS}`)}</span><span>Kepala Sekolah</span>${signatureBlock(school.principalName,school.principalNip)}</div></div></section>`;
  }

  function transferOutSheet(doc){
    const body=[1,2,3].map(()=>`<tr><td></td><td></td><td></td><td class="transfer-sign"><span>${DOTS.slice(0,26)},${DOTS.slice(0,10)}</span><span>Kepala Sekolah,</span><span class="transfer-line">${DOTS}</span><span>NIP.</span><span>Orang Tua/Wali,</span><span class="transfer-line">${DOTS}</span></td></tr>`).join('');
    return `<section class="document-a4 document-sheet equipment-sheet"><h2 class="document-heading">KETERANGAN PINDAH SEKOLAH</h2><p class="equipment-note">Nama Peserta Didik : ${escapeHtml(doc.student.name)}</p><table class="document-table transfer-table"><thead><tr><th colspan="4">KELUAR</th></tr><tr><th>Tanggal</th><th>Kelas yang ditinggalkan</th><th>Sebab-sebab Keluar atau Atas Permintaan (Tertulis)</th><th>Tanda Tangan Kepala Sekolah, Stempel Sekolah, dan Tanda Tangan Orang Tua/Wali</th></tr></thead><tbody>${body}</tbody></table></section>`;
  }

  function transferInSheet(doc){
    const entry=`<td class="transfer-entry"><ol><li>Nama Siswa <i></i></li><li>Nomor Induk <i></i></li><li>Nama Sekolah <i></i></li><li>Masuk di Sekolah ini:<ul><li>a. Tanggal <i></i></li><li>b. Di Kelas <i></i></li></ul></li><li>Tahun Pelajaran <i></i></li></ol></td><td class="transfer-sign"><span>${DOTS.slice(0,26)},${DOTS.slice(0,10)}</span><span>Kepala Sekolah,</span><span class="transfer-line">${DOTS}</span><span>NIP.</span></td>`;
    return `<section class="document-a4 document-sheet equipment-sheet"><h2 class="document-heading">KETERANGAN PINDAH SEKOLAH</h2><p class="equipment-note">Nama Peserta Didik : ${escapeHtml(doc.student.name)}</p><table class="document-table transfer-table"><thead><tr><th colspan="2">MASUK</th></tr></thead><tbody>${[1,2,3].map(()=>`<tr>${entry}</tr>`).join('')}</tbody></table></section>`;
  }

  function drawEquipment(){
    const students=refresh();if(!students.length){emptyClass();return;}
    if(bulkMode){
      view.innerHTML=`${bulkToolbar('Cetak Semua Perlengkapan Rapor',students.length)}${bulkSheets(students,doc=>`${schoolSheet(doc)}${studentIdentitySheet(doc)}${transferOutSheet(doc)}${transferInSheet(doc)}`)}`;
      bindBulkToggle();return;
    }
    const doc=getReportDocument(scope,studentId);
    view.innerHTML=`${toolbar(studentPicker(students),{bulk:true})}${schoolSheet(doc)}${studentIdentitySheet(doc)}${transferOutSheet(doc)}${transferInSheet(doc)}`;
    bindStudentPicker();bindBulkToggle();
  }

  /* ------------------------------------------------------- Kelengkapan */

  function drawCompleteness(){
    refresh();const data=getReportCompleteness(scope);
    view.innerHTML=`<div class="assessment-summary completeness-report-summary"><article class="stat-card"><div class="stat-label">Siswa Lengkap</div><div class="stat-value">${data.completeStudents}</div><div class="stat-foot">dari ${data.studentCount} siswa</div></article><article class="stat-card"><div class="stat-label">Belum Lengkap</div><div class="stat-value">${data.incompleteStudents}</div></article><article class="stat-card"><div class="stat-label">Progress Seluruh Kelas</div><div class="stat-value">${data.overallPercentage}%</div><div class="bar"><span style="width:${data.overallPercentage}%"></span></div></article></div>${data.students.length?`<div class="report-completeness-list">${data.students.map(row=>`<article class="card"><div class="completion-student-head"><div><strong>${escapeHtml(row.student.name)}</strong><span>${escapeHtml(row.student.nis)} · ${escapeHtml(row.student.nisn)}</span></div>${badge(row.status==='COMPLETE')}</div><div class="completion-progress"><div class="bar"><span style="width:${row.percentage}%"></span></div><b>${row.percentage}%</b></div><div class="completion-category-grid">${Object.entries(row.categories).map(([key,complete])=>{const label={identity:'Identitas',religion:'Agama',scores:'Nilai Mapel',descriptions:'Deskripsi',attendance:'Absensi',homeroomNote:'Catatan'}[key]||key;return complete?`<span class="complete">✓ ${escapeHtml(label)}</span>`:`<button type="button" class="missing" data-goto="${escapeHtml(key)}" data-goto-student="${escapeHtml(row.student.id)}" title="Buka halaman ${escapeHtml(label)}">! ${escapeHtml(label)}</button>`;}).join('')}</div>${row.missing.length?`<p>Kurang: ${escapeHtml(row.missing.join(', '))}</p>`:'<p class="complete-text">Semua komponen rapor sudah lengkap.</p>'}</article>`).join('')}</div>`:'<section class="card empty-state"><h3>Belum ada Data Siswa</h3></section>'}`;
  }

  /* Indikator merah menjadi tombol yang langsung membuka halaman sumber ketidaklengkapan,
     lengkap dengan siswa yang bersangkutan, sehingga guru tidak perlu mencari manual. */
  /* "Agama belum diisi" mengarah ke Data Siswa agar guru langsung mengisi agama siswa itu. */
  const COMPLETENESS_ROUTES={identity:'students',religion:'students',scores:'report-input',descriptions:'report-input',attendance:'attendance',homeroomNote:'completeness-input'};
  function bindCompletenessNavigation(){
    view.querySelectorAll('[data-goto]').forEach(button=>button.onclick=()=>{
      const route=COMPLETENESS_ROUTES[button.dataset.goto];
      if(!route){toast('Bagian ini tidak memiliki halaman input khusus.','warning');return;}
      try{sessionStorage.setItem('erapor-focus-student',button.dataset.gotoStudent);}catch{}
      globalThis.location.hash=`#${route}`;
    });
  }

  function completenessHeading(){
    const identity=getDocumentIdentity(scope);const data=getReportCompleteness(scope);
    view.insertAdjacentHTML('afterbegin',`${toolbar('<span>Kelengkapan Rapor</span>')}<section class="document-print-heading"><strong>KELENGKAPAN RAPOR · ${escapeHtml(identity.school.name)}</strong><span>${escapeHtml(identity.classLabel)} · ${escapeHtml(identity.semester)} · ${escapeHtml(identity.academicYear)}</span>${identity.printSettings.printDateLabel?`<small>${escapeHtml(identity.printSettings.printDateLabel)}</small>`:''}<small>Wali Kelas: ${escapeHtml(identity.teacher.name||'—')} · Kepala Sekolah: ${escapeHtml(identity.school.principalName||'—')}</small></section>`);
    view.querySelector('.completeness-report-summary')?.insertAdjacentHTML('afterend',`<section class="card completion-gauge-row no-print">${digitalGauge(data.overallPercentage,{label:'Kelengkapan Rapor',tone:'green',caption:`${data.completeStudents}/${data.studentCount} siswa lengkap`})}</section>`);
  }

  /* ------------------------------------------------------------- Rapor */

  function subjectRows(doc){
    return ['A','B'].map(group=>{
      const rows=doc.subjects.filter(row=>(row.subject.group||'B')===group);
      if(!rows.length)return '';
      return `<tr class="subject-group-row"><td colspan="4">Kelompok ${group}</td></tr>${rows.map((row,index)=>`<tr><td>${index+1}</td><td class="subject-name-cell">${escapeHtml(row.subject.name)}</td><td class="subject-score-cell">${row.score??'—'}</td><td class="subject-description-cell">${escapeHtml(row.description||'')}</td></tr>`).join('')}`;
    }).join('');
  }

  function attitudeBlock(doc){
    const body=doc.attitudes?.length
      ? doc.attitudes.map(item=>`<p>${escapeHtml(item.description||`${item.dimensionLabel}: ${item.level}`)}</p>`).join('')
      : '<p class="document-empty">Deskripsi capaian profil lulusan belum tersedia.</p>';
    return `<h3 class="document-section">A. Sikap</h3><section class="document-box"><div class="document-box-head">Deskripsi Capaian Profil Lulusan</div><div class="document-box-body attitude-body">${body}</div></section>`;
  }

  /* Ekstrakurikuler opsional: bagian ini tidak dicetak bila memang belum diisi. */
  function extracurricularTable(doc){
    const items=doc.extracurricular||[];
    if(!items.length)return '';
    const rows=items.length;
    return `<table class="document-table extracurricular-table"><thead><tr><th>No</th><th>Ekstrakurikuler</th><th>Keterangan</th></tr></thead><tbody>${Array.from({length:rows},(_,index)=>{const item=items[index];return `<tr><td>${index+1}</td><td class="subject-name-cell">${item?escapeHtml(item.name):''}</td><td class="subject-description-cell">${item?escapeHtml([item.predicate,item.description].filter(Boolean).join('. ')):''}</td></tr>`;}).join('')}</tbody></table>`;
  }

  function cocurricularBlock(doc){
    if(!doc.cocurricular)return '';
    return `<section class="document-box"><div class="document-box-head">Kokurikuler</div><div class="document-box-body"><p><strong>${escapeHtml(doc.cocurricular.activity||'—')}</strong> — ${escapeHtml(doc.cocurricular.predicate||'')}</p><p>${escapeHtml(doc.cocurricular.description||'')}</p></div></section>`;
  }

  function finalStatusBlock(doc){
    if(!doc.finalStatusLabel)return '';
    return `<section class="document-box"><div class="document-box-head">${Number.parseInt(classId,10)===6?'Kelulusan':'Kenaikan Kelas'}</div><div class="document-box-body"><p>${escapeHtml(doc.finalStatusLabel)}</p></div></section>`;
  }

  function reportA4(doc){
    const student=doc.student,school=doc.master.school,teacher=doc.master.teacher,settings=doc.printSettings;
    const head=`<table class="report-head-table"><tbody><tr><td>Nama Murid</td><td>:</td><td>${escapeHtml(student.name)}</td><td>Kelas</td><td>:</td><td>${escapeHtml(doc.classLabel)}</td></tr><tr><td>NIS/NISN</td><td>:</td><td>${escapeHtml(student.nis)} / ${escapeHtml(student.nisn)}</td><td>Semester</td><td>:</td><td>${doc.semesterNumber}</td></tr><tr><td>Sekolah</td><td>:</td><td>${escapeHtml(school.name)}</td><td>Tahun Ajaran</td><td>:</td><td>${escapeHtml(doc.academicYear)}</td></tr><tr><td>Alamat</td><td>:</td><td colspan="4">${blank(school.address)}</td></tr></tbody></table>`;
    const signatures=`<div class="report-signatures"><div><span>Orang Tua Murid</span><span class="signature-spacer"></span><strong>${DOTS}</strong></div><div><span>Kepala Sekolah</span><span class="signature-spacer"></span>${signatureBlock(school.principalName,school.principalNip)}</div><div><span>${escapeHtml(settings.printDateLabel||`${settings.city||'Bekasi'}, ${DOTS.slice(0,18)}`)}</span><span>Wali Kelas</span><span class="signature-spacer"></span>${signatureBlock(teacher.name,teacher.nip)}</div></div>`;
    return `<section class="document-a4 document-sheet report-a4">${head}<h2 class="document-heading">LAPORAN HASIL BELAJAR</h2>${attitudeBlock(doc)}<h3 class="document-section">B. Pengetahuan dan Keterampilan</h3><table class="document-table report-learning-table"><thead><tr><th>No</th><th>Mata Pelajaran</th><th>Nilai Akhir</th><th>Capaian Kompetensi</th></tr></thead><tbody>${subjectRows(doc)}</tbody></table>${extracurricularTable(doc)}${cocurricularBlock(doc)}<div class="report-lower-grid"><section class="document-box"><div class="document-box-head">Ketidakhadiran</div><div class="document-box-body"><table class="absence-document-table"><tbody><tr><th>Sakit</th><td>: ${doc.attendance.Sakit} hari</td></tr><tr><th>Izin</th><td>: ${doc.attendance.Izin} hari</td></tr><tr><th>Tanpa Keterangan</th><td>: ${doc.attendance.Alpa} hari</td></tr></tbody></table></div></section><section class="document-box"><div class="document-box-head">Catatan Wali Kelas</div><div class="document-box-body"><p>${escapeHtml(doc.homeroomNote||'')}</p></div></section></div>${finalStatusBlock(doc)}<section class="document-box response-box"><div class="document-box-head">Tanggapan Orang Tua/Wali Murid</div><div class="document-box-body"></div></section>${signatures}<div class="document-foot">${escapeHtml(doc.classLabel)} | ${escapeHtml(student.name)} | ${escapeHtml(student.nis)}</div></section>`;
  }

  /* Mapel agama hanya bisa ditentukan dari agama siswa dan tidak pernah ditebak. Ketika kolom
     Agama masih kosong, rapor memang tampil tanpa PAI maupun PAK, sehingga penyebabnya
     disampaikan langsung di atas lembar preview beserta tombol menuju Data Siswa siswa itu. */
  function religionNotice(doc){
    if(doc.categories?.religion!==false)return '';
    return `<div class="source-banner warning-banner no-print religion-banner"><span>Mata pelajaran agama belum tampil karena <strong>Agama ${escapeHtml(doc.student.name)} belum diisi</strong> pada Data Siswa. Isi agamanya, lalu rapor otomatis memakai PAI BP atau PAK BP sesuai agama siswa.</span><button class="btn btn-light btn-small" data-goto="religion" data-goto-student="${escapeHtml(doc.student.id)}">Isi Agama Siswa</button></div>`;
  }

  function drawReport(){
    const students=refresh();if(!students.length){emptyClass();return;}
    const doc=getReportDocument(scope,studentId);
    if(bulkMode){
      view.innerHTML=`${bulkToolbar('Cetak Semua Rapor',students.length)}${bulkSheets(students,reportA4)}`;
      bindBulkToggle();return;
    }
    view.innerHTML=`${toolbar(studentPicker(students),{bulk:true})}${religionNotice(doc)}${doc.complete?'<div class="source-banner no-print">Rapor lengkap dan siap dicetak final.</div>':`<div class="source-banner warning-banner no-print">Catatan: masih kurang ${escapeHtml(doc.missing.join(', '))}. Rapor tetap dapat dicetak.</div>`}${previewed?reportA4(doc):'<section class="card empty-state no-print"><h3>Preview belum dibuka</h3><p>Pilih siswa lalu klik Preview untuk menampilkan lembar A4.</p></section>'}`;
    bindStudentPicker();bindBulkToggle();bindCompletenessNavigation();
  }

  function openPreview(){previewed=true;draw();}

  /* -------------------------------------------------------------- Router */

  function draw(){
    root.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));
    setPrintPageSize(tab==='leger'?'landscape':null);
    if(tab==='leger'){drawLeger();bindActions('Leger');return;}
    if(tab==='cover'){drawCover();bindActions('Cover Rapor',{student:listStudents(scope,{classId}).find(item=>item.id===studentId)});return;}
    if(tab==='equipment'){drawEquipment();bindActions('Perlengkapan Rapor',{student:listStudents(scope,{classId}).find(item=>item.id===studentId)});return;}
    if(tab==='completeness'){drawCompleteness();completenessHeading();bindCompletenessNavigation();bindActions('Kelengkapan Rapor');return;}
    drawReport();bindActions('Rapor',{student:listStudents(scope,{classId}).find(item=>item.id===studentId),onPreview:openPreview});
  }

  if(session.role==='admin')root.querySelector('[data-class]').onchange=event=>{classId=event.target.value;studentId='';previewed=false;draw();};
  root.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;previewed=false;bulkMode=false;draw();});
  globalThis.addEventListener?.('hashchange',()=>setPrintPageSize(null),{once:true});
  draw();return root;
}
