import { CLASSES, RELIGIONS } from '../data/constants.js';
import { commitStudentImport, createStudent, deactivateStudent, deleteStudent, filterStudents, getStudent, listStudents, previewStudentImport, previewStudentWorkbookImport, studentOriginLabel, studentTemplateWorkbook, updateStudent } from '../services/students.js';
import { pickFile, saveFile } from '../services/file-io.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

function initials(name){return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();}
function avatar(student,size='small'){
  return student.photo
    ? `<img class="student-photo student-photo-${size}" src="${escapeHtml(student.photo)}" alt="Foto ${escapeHtml(student.name)}"/>`
    : `<div class="student-photo student-photo-${size} student-initials">${escapeHtml(initials(student.name))}</div>`;
}
function originBadge(student){
  /* Label resmi: Input Manual Guru, Input Manual Admin, Dapodik, atau Data Lama. */
  return `<span class="badge student-origin origin-${escapeHtml(student.origin||'legacy')}">${escapeHtml(studentOriginLabel(student))}</span>`;
}
function displayDate(value){
  if(!value)return '—';
  const date=new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())?value:date.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
}
function classOptions(selected='',includeAll=false){
  return `${includeAll?'<option value="ALL">Semua Rombel</option>':'<option value="">Pilih Rombel</option>'}${CLASSES.map(classId=>`<option value="${classId}" ${selected===classId?'selected':''}>Kelas ${classId}</option>`).join('')}`;
}

export function renderStudents(session){
  const isAdmin=session.role==='admin';
  let selectedClass=isAdmin?'ALL':session.classId;
  let query='';let gender='';
  const root=el(`<div>
    <div class="page-head"><div><h1>${isAdmin?'Data Siswa':'Update Data Siswa'}</h1><p>${isAdmin?'Kelola siswa seluruh rombel pada semester aktif.':`Kelola siswa Kelas ${session.classId} pada ${session.semester}.`}</p></div>
      <div class="actions"><button class="btn btn-light" data-template>${icon('download',17)} Template Excel</button><button class="btn btn-light" data-import>${icon('upload',17)} Import Excel</button><button class="btn btn-primary" data-add>${icon('users',17)} Tambah Siswa</button></div>
    </div>
    <section class="card student-toolbar">
      <div class="field compact-field"><label for="studentSearch">Cari</label><input class="input" id="studentSearch" placeholder="NIS, NISN, nama, orang tua..." data-search /></div>
      ${isAdmin?`<div class="field compact-field"><label for="studentClass">Rombel</label><select class="input" id="studentClass" data-class>${classOptions('ALL',true)}</select></div>`:''}
      <div class="field compact-field"><label for="studentGender">JK</label><select class="input" id="studentGender" data-gender><option value="">Semua</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div>
      <div class="student-total" data-total></div>
    </section>
    <div data-list></div>
  </div>`);
  const listHost=root.querySelector('[data-list]');

  function currentStudents(){
    const all=listStudents(session,{classId:selectedClass});
    return filterStudents(all,{query,gender,classId:selectedClass});
  }
  function draw(){
    const students=currentStudents();
    root.querySelector('[data-total]').innerHTML=`<strong>${students.length}</strong><span>siswa ditampilkan</span>`;
    if(!students.length){
      listHost.innerHTML='<section class="card empty-state"><h3>Belum ada data siswa</h3><p>Tambahkan siswa secara manual atau gunakan Import Siswa.</p></section>';
      return;
    }
    listHost.innerHTML=`
      <section class="card student-table-card"><div class="table-scroll"><table class="data-table student-table"><thead><tr><th>Foto</th><th>NIS / NISN</th><th>Nama</th>${isAdmin?'<th>Rombel</th>':''}<th>Asal Data</th><th>JK</th><th>Tempat, Tanggal Lahir</th><th>Orang Tua</th><th>Telepon</th><th class="cell-actions">Aksi</th></tr></thead><tbody>
        ${students.map(student=>`<tr><td>${avatar(student)}</td><td><strong>${escapeHtml(student.nis)}</strong><span>${escapeHtml(student.nisn)}</span></td><td><strong>${escapeHtml(student.name)}</strong><span>${escapeHtml(student.address||'Alamat belum diisi')}</span></td>${isAdmin?`<td><span class="badge badge-a">${escapeHtml(student.classId)}</span></td>`:''}<td>${originBadge(student)}</td><td>${student.gender==='L'?'Laki-laki':'Perempuan'}</td><td>${escapeHtml(student.birthPlace||'—')}, ${escapeHtml(displayDate(student.birthDate))}</td><td>${escapeHtml(student.parentName||student.fatherName||student.motherName||'—')}</td><td>${escapeHtml(student.phone||'—')}</td><td class="cell-actions"><div class="row-actions"><button class="btn btn-light btn-small" data-action="detail" data-id="${escapeHtml(student.id)}">Detail</button><button class="btn btn-light btn-small" data-action="edit" data-id="${escapeHtml(student.id)}">Edit</button><button class="btn btn-danger btn-small" data-action="delete" data-id="${escapeHtml(student.id)}">${student.origin==='dapodik'?'Nonaktifkan':'Hapus'}</button></div></td></tr>`).join('')}
      </tbody></table></div></section>
      <div class="student-card-list">${students.map(student=>`<article class="card student-mobile-card"><div class="student-card-head">${avatar(student,'large')}<div><h3>${escapeHtml(student.name)}</h3><p>${escapeHtml(student.nis)} · ${escapeHtml(student.nisn)}</p></div><span class="badge badge-a">${escapeHtml(student.classId)}</span></div><div class="student-origin-row">${originBadge(student)}</div><div class="student-card-meta"><span><b>JK</b>${student.gender}</span><span><b>Lahir</b>${escapeHtml(student.birthPlace||'—')}, ${escapeHtml(displayDate(student.birthDate))}</span><span><b>Telepon</b>${escapeHtml(student.phone||'—')}</span><span><b>Alamat</b>${escapeHtml(student.address||'—')}</span></div><div class="row-actions"><button class="btn btn-light btn-small" data-action="detail" data-id="${escapeHtml(student.id)}">Detail</button><button class="btn btn-light btn-small" data-action="edit" data-id="${escapeHtml(student.id)}">Edit</button><button class="btn btn-danger btn-small" data-action="delete" data-id="${escapeHtml(student.id)}">${student.origin==='dapodik'?'Nonaktifkan':'Hapus'}</button></div></article>`).join('')}</div>`;
    bindActions();
  }
  function bindActions(){
    listHost.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{
      const student=getStudent(session,button.dataset.id,{classId:selectedClass});
      if(!student){toast('Data siswa tidak ditemukan.','error');return;}
      if(button.dataset.action==='detail') openDetail(student);
      if(button.dataset.action==='edit') openForm(student);
      if(button.dataset.action==='delete') removeStudent(student);
    });
  }
  function closeModal(modal){modal.remove();}
  function openForm(student=null){
    let photoData=student?.photo||'';
    const initialClass=student?.classId||(selectedClass!=='ALL'?selectedClass:'');
    const modal=el(`<div class="modal-backdrop"><form class="modal-card modal-wide student-form"><div class="modal-head"><div><h3>${student?'Edit':'Tambah'} Siswa</h3><p>Data tersimpan khusus untuk rombel, semester, dan tahun pelajaran aktif.</p></div><button type="button" class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div>
      <div class="student-photo-field"><div data-photo-preview>${student?avatar(student,'form'):`<div class="student-photo student-photo-form student-initials">+</div>`}</div><div><label class="btn btn-light" for="studentPhoto">Pilih Foto</label><input class="hidden" id="studentPhoto" type="file" accept="image/*" data-photo/><p class="muted">Maksimal 1 MB. Disimpan lokal.</p></div></div>
      <div class="form-grid">
        ${isAdmin?`<div class="field"><label>Rombel *</label><select class="input" name="classId" required>${classOptions(initialClass)}</select></div>`:`<input type="hidden" name="classId" value="${escapeHtml(session.classId)}"/>`}
        <div class="field"><label>NIS *</label><input class="input" name="nis" value="${escapeHtml(student?.nis||'')}" required/></div>
        <div class="field"><label>NISN *</label><input class="input" name="nisn" value="${escapeHtml(student?.nisn||'')}" required/></div>
        <div class="field form-span-2"><label>Nama *</label><input class="input" name="name" value="${escapeHtml(student?.name||'')}" required/></div>
        <div class="field"><label>JK *</label><select class="input" name="gender" required><option value="">Pilih</option><option value="L" ${student?.gender==='L'?'selected':''}>Laki-laki</option><option value="P" ${student?.gender==='P'?'selected':''}>Perempuan</option></select></div>
        <div class="field"><label>Agama</label><select class="input" name="religion">${['',...RELIGIONS].map(item=>`<option value="${escapeHtml(item)}" ${String(student?.religion||'')===item?'selected':''}>${item?escapeHtml(item):'Pilih'}</option>`).join('')}</select></div>
        <div class="field"><label>Tempat Lahir</label><input class="input" name="birthPlace" value="${escapeHtml(student?.birthPlace||'')}"/></div>
        <div class="field"><label>Tanggal Lahir</label><input class="input" type="date" name="birthDate" value="${escapeHtml(student?.birthDate||'')}"/></div>
        <div class="field"><label>Nama Orang Tua</label><input class="input" name="parentName" value="${escapeHtml(student?.parentName||student?.fatherName||student?.motherName||'')}"/></div>
        <div class="field"><label>No. Telepon (opsional)</label><input class="input" name="phone" value="${escapeHtml(student?.phone||'')}"/></div>
        <div class="field form-span-2"><label>Alamat</label><textarea class="input" name="address" rows="3">${escapeHtml(student?.address||'')}</textarea></div>
      </div><div class="login-error hidden" data-error></div><div class="modal-actions"><button type="button" class="btn btn-light" data-cancel>Batal</button><button type="submit" class="btn btn-primary">${student?'Simpan Perubahan':'Tambah Siswa'}</button></div>
    </form></div>`);
    document.body.append(modal);
    const form=modal.querySelector('form');
    modal.querySelector('[data-close]').onclick=()=>closeModal(modal);modal.querySelector('[data-cancel]').onclick=()=>closeModal(modal);
    modal.querySelector('[data-photo]').onchange=event=>{
      const file=event.target.files?.[0];if(!file)return;
      if(!file.type.startsWith('image/') || file.size>1024*1024){toast('Foto harus berupa gambar maksimal 1 MB.','error');event.target.value='';return;}
      const reader=new FileReader();reader.onload=()=>{photoData=String(reader.result);modal.querySelector('[data-photo-preview]').innerHTML=`<img class="student-photo student-photo-form" src="${escapeHtml(photoData)}" alt="Preview foto"/>`;};reader.readAsDataURL(file);
    };
    form.onsubmit=event=>{
      event.preventDefault();const errorBox=modal.querySelector('[data-error]');errorBox.classList.add('hidden');
      const input={photo:photoData,classId:isAdmin?form.elements.classId.value:session.classId,nis:form.elements.nis.value,nisn:form.elements.nisn.value,name:form.elements.name.value,gender:form.elements.gender.value,religion:form.elements.religion.value,birthPlace:form.elements.birthPlace.value,birthDate:form.elements.birthDate.value,parentName:form.elements.parentName.value,phone:form.elements.phone.value,address:form.elements.address.value};
      try{if(student)updateStudent(session,student.id,input);else createStudent(session,input);closeModal(modal);draw();toast(student?'Data siswa berhasil diperbarui.':'Siswa berhasil ditambahkan.');}
      catch(error){errorBox.innerHTML=(error.errors||[error.message]).map(message=>`<div>${escapeHtml(message)}</div>`).join('');errorBox.classList.remove('hidden');}
    };
  }
  function openDetail(student){
    const fields=[['NIS',student.nis],['NISN',student.nisn],['Rombel',student.classId],['Asal Data',studentOriginLabel(student)],['JK',student.gender==='L'?'Laki-laki':'Perempuan'],['Agama',student.religion||'—'],['Tempat Lahir',student.birthPlace||'—'],['Tanggal Lahir',displayDate(student.birthDate)],['Nama Orang Tua',student.parentName||student.fatherName||student.motherName||'—'],['No. Telepon',student.phone||'—'],['Alamat',student.address||'—']];
    const modal=el(`<div class="modal-backdrop"><div class="modal-card modal-wide"><div class="modal-head"><div><h3>Detail Siswa</h3><p>Scope Kelas ${escapeHtml(student.classId)} · ${escapeHtml(student.semester)}</p></div><button class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div><div class="student-detail-head">${avatar(student,'form')}<div><h2>${escapeHtml(student.name)}</h2><span class="badge badge-a">Kelas ${escapeHtml(student.classId)}</span></div></div><div class="detail-grid">${fields.map(([label,value])=>`<div><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div><div class="modal-actions"><button class="btn btn-light" data-ok>Tutup</button></div></div></div>`);
    document.body.append(modal);modal.querySelector('[data-close]').onclick=()=>closeModal(modal);modal.querySelector('[data-ok]').onclick=()=>closeModal(modal);
  }
  async function removeStudent(student){
    const dapodik=student.origin==='dapodik';
    if(await confirmDialog({title:dapodik?'Nonaktifkan Data Siswa':'Hapus Data Siswa',message:dapodik?`Nonaktifkan ${student.name} dari Data Siswa Kelas ${student.classId}? Data asal Dapodik tidak dihapus.`:`Hapus ${student.name} dari Data Siswa Kelas ${student.classId}?`,confirmText:dapodik?'Nonaktifkan':'Hapus',danger:true})){
      try{if(dapodik)deactivateStudent(session,student.id,{classId:student.classId});else deleteStudent(session,student.id,{classId:student.classId});draw();toast(dapodik?'Data siswa berhasil dinonaktifkan.':'Data siswa berhasil dihapus.','warning');}catch(error){toast(error.message,'error');}
    }
  }
  async function downloadTemplate(){
    if(isAdmin&&selectedClass==='ALL'){toast('Pilih satu rombel sebelum mengunduh template.','warning');return;}
    /* Template dibawa bersama data siswa rombel aktif supaya bisa langsung diedit dan
       diimpor kembali. Rombel yang belum berisi siswa tetap mendapat baris header lengkap. */
    const jumlah=listStudents(session,{classId:selectedClass}).length;
    await saveFile({name:`TEMPLATE-DATA-SISWA-${selectedClass}-${session.semester.split(' ')[0].toUpperCase()}-${session.academicYear.replace('/','-')}.xlsx`,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',data:studentTemplateWorkbook(session,{classId:selectedClass})});
    toast(jumlah?`Template berisi ${jumlah} siswa Kelas ${selectedClass} siap diedit dan diimpor kembali.`:'Template kosong dengan format kolom lengkap berhasil diunduh.');
  }
  function openImportPreview(preview,fileName){
    const modal=el(`<div class="modal-backdrop"><div class="modal-card modal-extra-wide"><div class="modal-head"><div><h3>Preview Import Siswa</h3><p>${escapeHtml(fileName)} · ${preview.rows.length} baris · ${preview.validCount} valid · ${preview.newCount} siswa baru · ${preview.updateCount} diperbarui · ${preview.invalidCount} bermasalah</p></div><button class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div><div class="table-scroll import-preview-table"><table class="data-table"><thead><tr><th>Baris</th><th>Rombel</th><th>NIS</th><th>NISN</th><th>Nama</th><th>JK</th><th>Agama</th><th>Status</th><th>Validasi</th></tr></thead><tbody>${preview.rows.map(row=>`<tr><td>${row.rowNumber}</td><td>${escapeHtml(row.data.classId||'—')}</td><td>${escapeHtml(row.data.nis)}</td><td>${escapeHtml(row.data.nisn)}</td><td>${escapeHtml(row.data.name)}</td><td>${escapeHtml(row.data.gender)}</td><td>${escapeHtml(row.data.religion||'—')}</td><td>${row.mode==='update'?'<span class="badge badge-a">Diperbarui</span>':'<span class="badge badge-active">Baru</span>'}</td><td>${row.valid?'<span class="status-ok">Valid</span>':`<span class="status-error">${escapeHtml(row.errors.join(' '))}</span>`}</td></tr>`).join('')}</tbody></table></div>${preview.rows.length?'':'<div class="login-error">Tidak ada baris data untuk diimport.</div>'}<div class="modal-actions"><button class="btn btn-light" data-cancel>Batal</button><button class="btn btn-primary" data-commit ${preview.canCommit?'':'disabled'}>Simpan ${preview.newCount} Baru & ${preview.updateCount} Diperbarui</button></div></div></div>`);
    document.body.append(modal);modal.querySelector('[data-close]').onclick=()=>closeModal(modal);modal.querySelector('[data-cancel]').onclick=()=>closeModal(modal);
    modal.querySelector('[data-commit]').onclick=async()=>{
      if(!preview.canCommit)return;
      if(!await confirmDialog({title:'Konfirmasi Import',message:`Tambah ${preview.newCount} siswa baru dan perbarui ${preview.updateCount} siswa yang sudah ada? Siswa lain yang tidak ada di berkas tidak dihapus.`,confirmText:'Simpan Import'}))return;
      try{commitStudentImport(session,preview);closeModal(modal);draw();toast(`Import selesai: ${preview.newCount} siswa baru ditambahkan, ${preview.updateCount} siswa diperbarui. Siswa lain tidak diubah.`);}catch(error){toast(error.message,'error');}
    };
  }

  root.querySelector('[data-search]').oninput=event=>{query=event.target.value;draw();};
  root.querySelector('[data-gender]').onchange=event=>{gender=event.target.value;draw();};
  if(isAdmin)root.querySelector('[data-class]').onchange=event=>{selectedClass=event.target.value;draw();};
  root.querySelector('[data-add]').onclick=()=>openForm();root.querySelector('[data-template]').onclick=()=>downloadTemplate().catch(error=>toast(error.message,'error'));
  root.querySelector('[data-import]').onclick=async()=>{if(isAdmin&&selectedClass==='ALL'){toast('Pilih satu rombel sebelum import siswa.','warning');return;}try{const file=await pickFile({accept:'.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv'});if(!file)return;const preview=/\.csv$/i.test(file.name)?previewStudentImport(session,file.text,{classId:selectedClass}):previewStudentWorkbookImport(session,file.arrayBuffer,{classId:selectedClass});openImportPreview(preview,file.name);}catch(error){toast(error.message,'error');}};
  draw();

  /* Datang dari indikator "Agama belum diisi" pada Cek Kelengkapan: form Edit siswa yang
     bersangkutan langsung dibuka agar guru tinggal memilih agamanya. */
  let fokus='';
  try{fokus=sessionStorage.getItem('erapor-focus-student')||'';sessionStorage.removeItem('erapor-focus-student');}catch{}
  if(fokus){
    const siswaFokus=getStudent(session,fokus,{classId:selectedClass});
    if(siswaFokus)openForm(siswaFokus);
  }
  return root;
}
