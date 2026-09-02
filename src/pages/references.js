import { getSchoolMaster, getTeacherProfile, saveSchoolMaster } from '../services/master.js';
import { formatIndonesianPrintDate } from '../services/print-settings.js';
import { getSubjectMapping } from '../services/storage.js';
import { copyAcademicYearData, createAcademicYear, getReferenceOverview, setSemesterReferenceActive, updateReferenceSubject } from '../services/references.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const REFERENCE_SECTIONS=Object.freeze({
  school:{title:'Data Sekolah',lead:'Identitas sekolah dan Kepala Sekolah yang dipakai seluruh dokumen.'},
  classes:{title:'Data Kelas/Rombel',lead:'Tahun pelajaran, semester, dan 24 rombel beserta wali kelasnya.'},
  subjects:{title:'Mata Pelajaran',lead:'Master mata pelajaran yang tersedia untuk seluruh rombel.'},
  learning:{title:'Pembelajaran',lead:'Penugasan rombel, wali kelas, dan mata pelajaran aktif.'},
  branding:{title:'Logo dan Tanda Tangan',lead:'Logo dan identitas penanda tangan pada dokumen cetak.'},
  'report-date':{title:'Tanggal Rapor',lead:'Tanggal dan kota bawaan yang dipakai saat mencetak rapor.'}
});

/* Satu sumber daftar field identitas sekolah supaya form dan penyimpanan tidak pernah
   berbeda. Nama sekolah ikut di dalamnya. */
export const SCHOOL_FORM_FIELDS=Object.freeze(['name','npsn','status','registrationNumber','phone','address','village','district','city','province','postalCode','website','email','principalName','principalNip']);

export function renderReferences(session,section='school'){
  const bagian=Object.hasOwn(REFERENCE_SECTIONS,section)?section:'school';
  const info=REFERENCE_SECTIONS[bagian];
  const root=el(`<div><div class="page-head"><div><h1>${escapeHtml(info.title)}</h1><p>${escapeHtml(info.lead)}</p></div></div><div data-view></div></div>`);const view=root.querySelector('[data-view]');
  let periodsHost=view,classesHost=view;
  function drawPeriods(){const data=getReferenceOverview();const years=[...data.academicYears].sort((a,b)=>a.id.localeCompare(b.id));periodsHost.innerHTML=`<div class="reference-period-layout"><form class="card" data-year-form><div class="section-head"><div><h3>Tambah Tahun Pelajaran</h3><p>Dua semester unik dibuat otomatis. Periode lama tetap menjadi arsip.</p></div></div><div class="field"><label>Tahun Pelajaran</label><input class="input" name="academicYear" placeholder="Contoh: 2027/2028" required/></div><button class="btn btn-primary" type="submit">${icon('save',16)} Simpan Referensi</button></form><section class="card"><div class="section-head"><div><h3>Periode Tersedia</h3><p>${data.academicYears.length} tahun pelajaran · ${data.semesters.length} semester</p></div></div><div class="reference-period-list">${years.map((year,index)=>`<article><div><strong>${escapeHtml(year.label)}</strong><span>${year.active?'Periode aktif':'Arsip (tetap tersimpan)'}</span>${index>0?`<button class="btn btn-light btn-small" data-copy="${escapeHtml(year.id)}" data-source="${escapeHtml(years[index-1].id)}">Salin Mapping/Bobot/KKTP/TP</button>`:''}</div><div class="reference-semester-tags">${data.semesters.filter(item=>item.academicYear===year.id).map(item=>`<label class="reference-semester-toggle"><input type="checkbox" data-semester="${escapeHtml(item.id)}" ${item.active?'checked':''}/><span>${escapeHtml(item.name)}</span></label>`).join('')}</div></article>`).join('')}</div></section></div>`;periodsHost.querySelector('[data-year-form]').onsubmit=event=>{event.preventDefault();try{createAcademicYear(session,event.currentTarget.elements.academicYear.value);drawPeriods();toast('Tahun pelajaran dan semester berhasil ditambahkan.');}catch(error){toast(error.message,'error');}};periodsHost.querySelectorAll('[data-semester]').forEach(input=>input.onchange=()=>{try{setSemesterReferenceActive(session,input.dataset.semester,input.checked);drawPeriods();toast(input.checked?'Semester diaktifkan.':'Semester diarsipkan.');}catch(error){input.checked=!input.checked;toast(error.message,'error');}});periodsHost.querySelectorAll('[data-copy]').forEach(button=>button.onclick=async()=>{if(!await confirmDialog({title:'Salin Pengaturan Tahun Sebelumnya',message:`Salin Mapping, Bobot, KKTP, dan TP dari ${button.dataset.source} ke ${button.dataset.copy}? Data sumber tidak berubah dan data tujuan yang sudah ada tidak ditimpa.`,confirmText:'Salin Data'}))return;try{const result=copyAcademicYearData(session,{fromAcademicYear:button.dataset.source,toAcademicYear:button.dataset.copy});toast(`Tersalin: ${result.copiedMappings} mapping, ${result.copiedAssessmentSettings} bobot/KKTP, ${result.copiedLearningObjectives} TP.`);}catch(error){toast(error.message,'error');}});}
  function drawClasses(){const data=getReferenceOverview();classesHost.innerHTML=`<section class="card"><div class="section-head"><div><h3>Master 24 Rombel</h3><p>Rombel tetap 1A–6D dan menggunakan profil wali kelas pada Data Pengguna.</p></div><span class="badge badge-active">${data.classes.length} rombel</span></div><div class="reference-class-grid">${data.classes.map(classId=>{const teacher=getTeacherProfile(classId);return `<article><span>${escapeHtml(classId)}</span><div><strong>Kelas ${escapeHtml(classId)}</strong><small>${escapeHtml(teacher.name)}</small></div></article>`;}).join('')}</div></section>`;}
  function openSubjectForm(subject){const modal=el(`<div class="modal-backdrop"><form class="modal-card"><div class="modal-head"><div><h3>Edit Mata Pelajaran</h3><p>Perubahan nama diterapkan ke master dan Mapping yang sudah tersimpan.</p></div><button class="btn btn-light btn-icon" type="button" data-close>${icon('x',17)}</button></div><div class="field"><label>Kode</label><input class="input readonly" value="${escapeHtml(subject.id)}" readonly/></div><div class="field"><label>Nama Mata Pelajaran</label><input class="input" name="name" value="${escapeHtml(subject.name)}" required/></div><div class="field"><label>Kelompok</label><input class="input readonly" value="Kelompok ${escapeHtml(subject.group)}" readonly/></div><div class="login-error hidden" data-error></div><div class="modal-actions"><button class="btn btn-light" type="button" data-cancel>Batal</button><button class="btn btn-primary" type="submit">Simpan</button></div></form></div>`);document.body.append(modal);const form=modal.querySelector('form'),close=()=>modal.remove();modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;form.onsubmit=event=>{event.preventDefault();try{updateReferenceSubject(session,subject.id,{name:form.elements.name.value});close();drawSubjects();toast('Master mata pelajaran berhasil diperbarui.');}catch(error){const box=modal.querySelector('[data-error]');box.textContent=error.message;box.classList.remove('hidden');}};}
  function drawSubjects(){const data=getReferenceOverview();view.innerHTML=`<section class="card reference-subject-card"><div class="section-head"><div><h3>Master Mata Pelajaran</h3><p>Urutan dan status aktif per rombel tetap dikelola melalui Mapping Mata Pelajaran.</p></div><span class="badge badge-active">${data.subjects.length} mapel</span></div><div class="table-scroll"><table class="data-table reference-subject-table"><thead><tr><th>No.</th><th>Kelompok</th><th>Kode</th><th>Mata Pelajaran</th><th>Aksi</th></tr></thead><tbody>${data.subjects.map(subject=>`<tr><td>${subject.order}</td><td><span class="badge badge-${subject.group.toLowerCase()}">Kelompok ${escapeHtml(subject.group)}</span></td><td>${escapeHtml(subject.id)}</td><td><strong>${escapeHtml(subject.name)}</strong></td><td><button class="btn btn-light btn-small" data-edit="${escapeHtml(subject.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div></section>`;view.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>openSubjectForm(data.subjects.find(item=>item.id===button.dataset.edit)));}
  function logoField(name,label,value){return `<div class="school-logo-field"><label>${escapeHtml(label)}</label><div class="school-logo-preview" data-logo-preview="${name}">${value?`<img src="${escapeHtml(value)}" alt=""/>`:'<span>Belum ada logo</span>'}</div><div class="row-actions"><label class="btn btn-light btn-small" for="logo-${name}">Pilih Logo</label><input class="hidden" id="logo-${name}" type="file" accept="image/*" data-logo="${name}"/><button class="btn btn-light btn-small" type="button" data-logo-clear="${name}">Hapus</button></div><p class="muted">PNG/JPG maksimal 1 MB, disimpan lokal.</p></div>`;}
  /* Nama sekolah dapat diedit Admin: aplikasi ini dipakai banyak sekolah dan tidak menanam
     identitas sekolah mana pun di dalam kode. */
  function drawSchool(){const school=getSchoolMaster();const text=(name,label,value,extra='')=>`<div class="field"><label>${escapeHtml(label)}</label><input class="input" name="${name}" value="${escapeHtml(value||'')}" ${extra}/></div>`;view.innerHTML=`<form class="card reference-school-form" data-school><div class="section-head"><div><h3>Data Sekolah & Kepala Sekolah</h3><p>Data yang sama dipakai pada profil, cover, perlengkapan rapor, rapor, transkrip, leger, dan area tanda tangan.</p></div><span class="badge badge-active">Master Aktif</span></div><div class="form-grid"><div class="field form-span-2"><label>Nama Sekolah *</label><input class="input" name="name" value="${escapeHtml(school.name||'')}" placeholder="Contoh: SDN Contoh Nusantara 02" maxlength="150" required/></div>${text('npsn','NPSN',school.npsn)}<div class="field"><label>Status Sekolah</label><select class="input" name="status">${['','Negeri','Swasta'].map(value=>`<option value="${escapeHtml(value)}" ${value===(school.status||'')?'selected':''}>${escapeHtml(value||'Belum dipilih')}</option>`).join('')}</select></div>${text('registrationNumber','NIS/NSS/NDS',school.registrationNumber)}${text('phone','Nomor Telepon',school.phone)}<div class="field form-span-2"><label>Alamat Sekolah</label><input class="input" name="address" value="${escapeHtml(school.address||'')}"/></div>${text('village','Kelurahan / Desa',school.village)}${text('district','Kecamatan',school.district)}${text('city','Kota/Kabupaten',school.city)}${text('province','Provinsi',school.province)}${text('postalCode','Kode Pos',school.postalCode,'inputmode="numeric" maxlength="5" pattern="\\d{5}"')}${text('website','Website',school.website)}${text('email','E-mail',school.email)}${text('principalName','Nama Kepala Sekolah',school.principalName,'required')}${text('principalNip','NIP Kepala Sekolah',school.principalNip,'required')}</div><div class="actions"><button class="btn btn-primary" type="submit">${icon('save',16)} Simpan Data Sekolah</button></div></form>`;
    const logos={ministryLogo:school.ministryLogo||'',regionLogo:school.regionLogo||'',schoolLogo:school.schoolLogo||''};
    view.querySelector('[data-school]').onsubmit=event=>{event.preventDefault();const fields=event.currentTarget.elements;try{saveSchoolMaster(session,{...Object.fromEntries(SCHOOL_FORM_FIELDS.map(name=>[name,fields[name].value])),...logos});drawSchool();toast('Data sekolah dan Kepala Sekolah berhasil disimpan.');}catch(error){toast(error.message,'error');}};}
  /* Logo dan identitas penanda tangan dipisahkan dari form identitas sekolah, tetapi tetap
     menulis ke master sekolah yang sama supaya tidak ada store kedua. */
  function drawBranding(){
    const school=getSchoolMaster();
    view.innerHTML=`<form class="card reference-school-form" data-branding><div class="section-head"><div><h3>Logo dan Tanda Tangan</h3><p>Logo dan nama penanda tangan dipakai pada cover, rapor, transkrip, dan leger.</p></div><span class="badge badge-active">Master Aktif</span></div><div class="school-logo-grid">${logoField('schoolLogo','Logo Sekolah',school.schoolLogo)}${logoField('ministryLogo','Logo Tut Wuri Handayani',school.ministryLogo)}${logoField('regionLogo','Lambang Kota/Kabupaten',school.regionLogo)}</div><div class="form-grid"><div class="field"><label>Nama Kepala Sekolah</label><input class="input" name="principalName" value="${escapeHtml(school.principalName||'')}" required/></div><div class="field"><label>NIP Kepala Sekolah</label><input class="input" name="principalNip" value="${escapeHtml(school.principalNip||'')}" required/></div></div><div class="actions"><button class="btn btn-primary" type="submit">${icon('save',16)} Simpan Logo dan Tanda Tangan</button></div></form>`;
    const logos={ministryLogo:school.ministryLogo||'',regionLogo:school.regionLogo||'',schoolLogo:school.schoolLogo||''};
    bindLogoFields(logos);
    view.querySelector('[data-branding]').onsubmit=event=>{
      event.preventDefault();const fields=event.currentTarget.elements;
      try{saveSchoolMaster(session,{...school,principalName:fields.principalName.value,principalNip:fields.principalNip.value,...logos});drawBranding();toast('Logo dan tanda tangan berhasil disimpan.');}
      catch(error){toast(error.message,'error');}
    };
  }
  function bindLogoFields(logos){
    view.querySelectorAll('[data-logo]').forEach(input=>input.onchange=event=>{
      const file=event.target.files?.[0];if(!file)return;
      if(!file.type.startsWith('image/')||file.size>1024*1024){toast('Logo harus berupa gambar maksimal 1 MB.','error');return;}
      const reader=new FileReader();reader.onload=()=>{logos[input.dataset.logo]=String(reader.result);view.querySelector(`[data-logo-preview="${input.dataset.logo}"]`).innerHTML=`<img src="${escapeHtml(logos[input.dataset.logo])}" alt=""/>`;};reader.readAsDataURL(file);
    });
    view.querySelectorAll('[data-logo-clear]').forEach(button=>button.onclick=()=>{const key=button.dataset.logoClear;logos[key]='';view.querySelector(`[data-logo-preview="${key}"]`).innerHTML='<span>Belum ada logo</span>';});
  }
  /* Tanggal dan kota bawaan disimpan pada master sekolah lalu dipakai getPrintSettings
     sebagai nilai awal bagi setiap rombel yang belum menyimpan pengaturan cetaknya sendiri. */
  function drawReportDate(){
    const school=getSchoolMaster();
    view.innerHTML=`<form class="card reference-school-form" data-report-date><div class="section-head"><div><h3>Tanggal Rapor</h3><p>Dipakai sebagai nilai awal Tanggal Rapor pada seluruh rombel yang belum mengatur sendiri.</p></div></div><div class="form-grid"><div class="field"><label>Tanggal Rapor</label><input class="input" type="date" name="reportDate" value="${escapeHtml(school.reportDate||'')}"/></div><div class="field"><label>Kota Penandatanganan</label><input class="input" name="reportCity" value="${escapeHtml(school.reportCity||school.city||'Bekasi')}"/></div></div><p class="muted">${school.reportDate?escapeHtml(formatIndonesianPrintDate(school.reportDate,school.reportCity||school.city||'Bekasi')):'Belum ada tanggal bawaan.'}</p><div class="actions"><button class="btn btn-primary" type="submit">${icon('save',16)} Simpan Tanggal Rapor</button></div></form>`;
    view.querySelector('[data-report-date]').onsubmit=event=>{
      event.preventDefault();const fields=event.currentTarget.elements;
      try{saveSchoolMaster(session,{...school,reportDate:fields.reportDate.value,reportCity:fields.reportCity.value});drawReportDate();toast('Tanggal rapor bawaan berhasil disimpan.');}
      catch(error){toast(error.message,'error');}
    };
  }
  /* Pembelajaran hanya menampilkan penugasan yang sudah ada. Perubahannya tetap dilakukan
     lewat Data Pengguna dan Mapping Mata Pelajaran, bukan lewat store kedua di sini. */
  function drawLearning(){
    const data=getReferenceOverview();
    const baris=data.classes.map(classId=>{
      const teacher=getTeacherProfile(classId);
      const mapping=getSubjectMapping({role:'teacher',classId,academicYear:session.academicYear,semester:session.semester});
      const aktif=mapping.filter(item=>item.active!==false);
      return {classId,teacher,aktif,total:mapping.length};
    });
    view.innerHTML=`<section class="card saved-table-card"><div class="section-head"><div><h3>Pembelajaran per Rombel</h3><p>Wali kelas dan mata pelajaran aktif pada ${escapeHtml(session.semester)}. Ubah melalui Data Pengguna dan Mapping Mata Pelajaran.</p></div><span class="badge badge-active">${baris.length} rombel</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Rombel</th><th>Wali Kelas</th><th>Mapel Aktif</th><th>Daftar Mata Pelajaran</th></tr></thead><tbody>${baris.map(item=>`<tr><td><strong>Kelas ${escapeHtml(item.classId)}</strong></td><td>${escapeHtml(item.teacher.name)}<span>${escapeHtml(item.teacher.nip||'NIP belum diisi')}</span></td><td><strong>${item.aktif.length}</strong> dari ${item.total}</td><td>${item.aktif.length?escapeHtml(item.aktif.map(mapel=>mapel.name).join(', ')):'<span class="muted">Belum ada mapel aktif</span>'}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function draw(){
    if(bagian==='classes'){
      view.innerHTML='<div data-periods></div><div data-classes></div>';
      periodsHost=view.querySelector('[data-periods]');classesHost=view.querySelector('[data-classes]');
      drawPeriods();
      periodsHost.querySelectorAll('[data-copy]').forEach(button=>{button.textContent='Salin dari Tahun Sebelumnya';});
      drawClasses();
      return;
    }
    if(bagian==='subjects')drawSubjects();
    else if(bagian==='learning')drawLearning();
    else if(bagian==='branding')drawBranding();
    else if(bagian==='report-date')drawReportDate();
    else drawSchool();
  }
  draw();return root;
}
