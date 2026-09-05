import { activateTeacherUsage, deactivateTeacherUsage, getAdminReadiness } from '../services/admin-readiness.js';
import { getAdminAssessmentStatus } from '../services/admin-status.js';
import { listUserAccounts, resetTeacherPassword, setTeacherActive } from '../services/auth.js';
import { getTeacherProfile, listMasterClasses, saveTeacherProfile } from '../services/master.js';
import { listTeacherAssignments, setTeacherAssignment } from '../services/teacher-assignments.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

function initials(name){return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();}
function avatar(profile){return profile.photo?`<img class="student-photo student-photo-small" src="${escapeHtml(profile.photo)}" alt="Foto ${escapeHtml(profile.name)}"/>`:`<div class="student-photo student-photo-small student-initials">${escapeHtml(initials(profile.name))}</div>`;}

const USER_SECTIONS=Object.freeze({
  teachers:{title:'Data Guru',lead:'Identitas wali kelas yang dipakai pada rapor, transkrip, dan area tanda tangan.'},
  assignments:{title:'Akun Guru & Penugasan',lead:'Admin menentukan rombel dan mata pelajaran yang menjadi hak kerja setiap Guru pada tahun pelajaran dan semester aktif.'},
  readiness:{title:'Kesiapan Guru',lead:'Periksa kelengkapan data sebelum membuka penggunaan e-Rapor untuk Guru.'},
  access:{title:'Hak Akses Guru',lead:'Ringkasan batas akses dan progres pekerjaan setiap Guru. Admin memantau, tanpa mengubah nilai Guru.'}
});

export function renderUsers(session,section='users'){
  const bagian=Object.hasOwn(USER_SECTIONS,section)?section:'assignments';
  const info=USER_SECTIONS[bagian];
  const root=el(`<div><div class="page-head"><div><h1>${escapeHtml(info.title)}</h1><p>${escapeHtml(info.lead)}</p></div></div><div data-view></div></div>`);const view=root.querySelector('[data-view]');
  function showCredential(password,classId){const modal=el(`<div class="modal-backdrop"><div class="modal-card"><h3>Password Sementara Guru ${escapeHtml(classId)}</h3><p>Sampaikan secara aman kepada Guru terkait. Password hanya ditampilkan sekali dan tidak disimpan plaintext.</p><div class="recovery-code">${escapeHtml(password)}</div><div class="modal-actions"><button class="btn btn-primary" data-close>Selesai</button></div></div></div>`);document.body.append(modal);modal.querySelector('[data-close]').onclick=()=>modal.remove();}
  /* Form identitas lengkap (dengan foto) milik Akun Guru & Penugasan. */
  function openAccountIdentityForm(classId,done){let profile=getTeacherProfile(classId),photoData=profile.photo||'';const modal=el(`<div class="modal-backdrop"><form class="modal-card modal-wide"><div class="modal-head"><div><h3>Edit Guru/Wali Kelas ${escapeHtml(classId)}</h3><p>Profil otomatis digunakan pada Dashboard, Rapor, Transkrip, dan tanda tangan.</p></div><button type="button" class="btn btn-light btn-icon" data-close>${icon('x',17)}</button></div><div class="student-photo-field"><div data-photo-preview>${avatar(profile)}</div><div><label class="btn btn-light" for="adminTeacherPhoto">Pilih Foto</label><input class="hidden" id="adminTeacherPhoto" type="file" accept="image/*" data-photo/><p class="muted">Maksimal 1 MB.</p></div></div><div class="form-grid"><div class="field form-span-2"><label>Nama</label><input class="input" name="name" value="${escapeHtml(profile.name)}" required/></div><div class="field"><label>NIP</label><input class="input" name="nip" value="${escapeHtml(profile.nip||'')}"/></div><div class="field"><label>Rombel</label><input class="input readonly" value="${escapeHtml(classId)}" readonly/></div><div class="field"><label>No. HP</label><input class="input" name="phone" value="${escapeHtml(profile.phone||'')}"/></div><div class="field"><label>Email</label><input class="input" type="email" name="email" value="${escapeHtml(profile.email||'')}"/></div></div><div class="login-error hidden" data-error></div><div class="modal-actions"><button type="button" class="btn btn-light" data-cancel>Batal</button><button class="btn btn-primary" type="submit">Simpan Profil</button></div></form></div>`);document.body.append(modal);const form=modal.querySelector('form');const close=()=>modal.remove();modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;modal.querySelector('[data-photo]').onchange=event=>{const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>1024*1024){toast('Foto harus berupa gambar maksimal 1 MB.','error');return;}const reader=new FileReader();reader.onload=()=>{photoData=String(reader.result);modal.querySelector('[data-photo-preview]').innerHTML=`<img class="student-photo student-photo-form" src="${escapeHtml(photoData)}" alt="Preview foto"/>`;};reader.readAsDataURL(file);};form.onsubmit=event=>{event.preventDefault();try{saveTeacherProfile(session,classId,{name:form.elements.name.value,nip:form.elements.nip.value,phone:form.elements.phone.value,email:form.elements.email.value,photo:photoData});close();done();toast('Profil Guru berhasil diperbarui.');}catch(error){const box=modal.querySelector('[data-error]');box.textContent=error.message;box.classList.remove('hidden');}};}
  function drawTeachers(){
    const rows=listMasterClasses().map(classId=>getTeacherProfile(classId));
    view.innerHTML=`<section class="card wide-table-card"><div class="section-head"><div><h3>Identitas 24 Wali Kelas</h3><p>Nama dan NIP di sini yang tercetak pada rapor dan area tanda tangan.</p></div><span class="badge badge-active">${rows.length} rombel</span></div><div class="table-scroll"><table class="data-table users-table"><thead><tr><th>Rombel</th><th>Nama Guru</th><th>NIP</th><th>Kontak</th><th>Aksi</th></tr></thead><tbody>${rows.map(item=>`<tr><td><strong>Kelas ${escapeHtml(item.classId)}</strong></td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.nip||'—')}</td><td>${escapeHtml(item.phone||'—')}<span>${escapeHtml(item.email||'—')}</span></td><td><button class="btn btn-light btn-small" data-edit-teacher="${escapeHtml(item.classId)}">Edit</button></td></tr>`).join('')}</tbody></table></div></section>`;
    view.querySelectorAll('[data-edit-teacher]').forEach(button=>button.onclick=()=>openReferenceTeacherForm(getTeacherProfile(button.dataset.editTeacher)));
  }
  /* Form identitas ringkas milik Data Referensi → Data Guru. */
  function openReferenceTeacherForm(profile){
    const modal=el(`<div class="modal-backdrop"><form class="modal-card"><div class="modal-head"><div><h3>Identitas Guru Kelas ${escapeHtml(profile.classId)}</h3><p>Perubahan langsung dipakai pada dokumen cetak rombel ini.</p></div><button class="btn btn-light btn-icon" type="button" data-close>${icon('x',17)}</button></div><div class="form-grid"><div class="field form-span-2"><label>Nama Guru</label><input class="input" name="name" value="${escapeHtml(profile.name||'')}" required/></div><div class="field"><label>NIP</label><input class="input" name="nip" value="${escapeHtml(profile.nip||'')}"/></div><div class="field"><label>No. Telepon</label><input class="input" name="phone" value="${escapeHtml(profile.phone||'')}"/></div><div class="field form-span-2"><label>E-mail</label><input class="input" name="email" value="${escapeHtml(profile.email||'')}"/></div></div><div class="login-error hidden" data-error></div><div class="modal-actions"><button class="btn btn-light" type="button" data-cancel>Batal</button><button class="btn btn-primary" type="submit">Simpan</button></div></form></div>`);
    document.body.append(modal);const close=()=>modal.remove();
    modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;
    modal.querySelector('form').onsubmit=event=>{
      event.preventDefault();const fields=event.currentTarget.elements;
      try{saveTeacherProfile(session,profile.classId,{...profile,name:fields.name.value,nip:fields.nip.value,phone:fields.phone.value,email:fields.email.value});close();drawTeachers();toast('Identitas guru berhasil disimpan.');}
      catch(error){const box=modal.querySelector('[data-error]');box.textContent=error.message;box.classList.remove('hidden');}
    };
  }
  /* ------------------------------------------------ Akun Guru & Penugasan (kendali Admin)

     Guru tidak menentukan sendiri rombel maupun mapel yang dikerjakannya. Halaman inilah
     sumber otorisasinya, dan pilihannya tersimpan per tahun pelajaran dan semester sehingga
     penugasan tahun berikutnya tidak menimpa arsip tahun sebelumnya. */
  function openAssignmentForm(row,done){
    const dipilih=new Set(row.subjectIds);
    const modal=el(`<div class="modal-backdrop"><div class="modal-card modal-wide" role="dialog" aria-modal="true">
      <div class="modal-head"><div><h3>Penugasan Kelas ${escapeHtml(row.classId)}</h3>
        <p>${escapeHtml(row.teacher.name)} · ${escapeHtml(row.semester)} · ${escapeHtml(row.academicYear)}</p></div>
        <button type="button" class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div>
      ${row.availableSubjects.length
        ?`<p class="objective-picker-note">Centang mata pelajaran yang menjadi hak kerja Guru rombel ini. Mapel di luar centang tidak dapat dibuka Guru.</p>
          <div class="objective-reference-list assignment-list">${row.availableSubjects.map(item=>`<label class="objective-reference-item"><input type="checkbox" data-subject-pick value="${escapeHtml(item.id)}" ${dipilih.has(item.id)?'checked':''}/><span><strong>${escapeHtml(item.name)}</strong></span></label>`).join('')}</div>`
        :'<p class="objective-picker-note">Rombel ini belum punya mata pelajaran aktif pada Mapping Mata Pelajaran. Lengkapi mapping terlebih dahulu.</p>'}
      <label class="objective-reference-item assignment-active"><input type="checkbox" data-assignment-active ${row.assigned?(row.active?'checked':''):'checked'}/><span><strong>Penugasan aktif</strong> — Guru dapat bekerja pada rombel ini.</span></label>
      <div class="modal-actions"><span class="objective-picker-count" data-pick-count>${dipilih.size} mapel dipilih</span>
        <button type="button" class="btn btn-light" data-cancel>Batal</button>
        <button type="button" class="btn btn-primary" data-apply${row.availableSubjects.length?'':' disabled'}>Simpan Penugasan</button></div></div></div>`);
    document.body.append(modal);
    const tutup=()=>modal.remove();
    const kotak=()=>[...modal.querySelectorAll('[data-subject-pick]')];
    kotak().forEach(box=>box.onchange=()=>{
      modal.querySelector('[data-pick-count]').textContent=`${kotak().filter(item=>item.checked).length} mapel dipilih`;});
    modal.querySelector('[data-close]').onclick=tutup;
    modal.querySelector('[data-cancel]').onclick=tutup;
    modal.querySelector('[data-apply]').onclick=()=>{
      try{
        setTeacherAssignment(session,row.classId,{
          subjectIds:kotak().filter(item=>item.checked).map(item=>item.value),
          active:modal.querySelector('[data-assignment-active]').checked});
        tutup();done();toast(`Penugasan Kelas ${row.classId} tersimpan.`);
      }catch(error){toast(error.message,'error');}
    };
  }

  async function drawAssignments(){
    view.innerHTML='<section class="card empty-state"><h3>Memuat penugasan Guru...</h3></section>';
    try{
      const akun=await listUserAccounts(session);
      const status=new Map(akun.map(item=>[item.classId,item]));
      const rows=listTeacherAssignments(session);
      const ditugaskan=rows.filter(row=>row.assigned&&row.active&&row.subjectIds.length);
      /* Akun Guru dibuat NONAKTIF sejak awal: lisensi yang sah membuka aplikasi untuk Admin,
         bukan untuk seluruh wali kelas sekaligus. Jumlah yang belum aktif ditampilkan supaya
         Admin tahu persis siapa yang masih belum dapat masuk. */
      const belumAktif=rows.filter(row=>!status.get(row.classId)?.active).length;
      view.innerHTML=`<section class="card user-summary"><div><strong>${ditugaskan.length}</strong><span>rombel sudah ditugaskan</span></div><div><strong>${rows.length-ditugaskan.length}</strong><span>belum ditugaskan</span></div><div><strong>${belumAktif}</strong><span>akun belum diaktifkan</span></div><div><strong>${escapeHtml(session.semester)}</strong><span>${escapeHtml(session.academicYear)}</span></div></section>
        <section class="card users-table-card"><div class="section-head"><div><h3>Penugasan Guru</h3><p>Penugasan di halaman ini adalah satu-satunya sumber hak kerja Guru. Rombel yang belum ditugaskan dapat login tetapi belum dapat membuka fungsi akademik apa pun; mencabut penugasan tidak menghapus data yang sudah tersimpan.</p><p>Akun Guru baru berstatus <strong>Nonaktif</strong> dan belum dapat login. Tekan <strong>Aktifkan</strong> pada rombel yang dipakai tahun ini; menonaktifkan kembali tidak menghapus data apa pun.</p></div></div>${belumAktif?`<p class="cp-empty">${belumAktif} akun Guru belum diaktifkan sehingga wali kelasnya belum dapat masuk.</p>`:''}
        <div class="table-scroll"><table class="data-table users-table"><thead><tr><th>Guru</th><th>Rombel</th><th>Username</th><th>Status Akun</th><th>Mata Pelajaran Ditugaskan</th><th>Aksi</th></tr></thead><tbody>${rows.map(row=>`<tr><td><div class="user-profile-cell">${avatar(row.teacher)}<span><strong>${escapeHtml(row.teacher.name)}</strong><small>${escapeHtml(row.teacher.nip||'NIP belum diisi')}</small></span></div></td><td><span class="badge badge-a">${escapeHtml(row.classId)}</span></td><td><strong>${escapeHtml(status.get(row.classId)?.username||'—')}</strong>${status.get(row.classId)?.mustChangePassword?'<span>Password sementara</span>':''}</td><td>${status.get(row.classId)?.active?'<span class="badge badge-active">Aktif</span>':'<span class="badge badge-inactive">Nonaktif</span>'}</td><td>${row.assigned?(row.subjectIds.length?`<strong>${row.subjects.length} mapel</strong><span>${escapeHtml(row.subjects.map(item=>item.name).join(', '))}</span>${row.active?'':'<span class="badge badge-inactive">Penugasan nonaktif</span>'}`:'<span class="badge badge-inactive">Tidak ada mapel</span>'):'<span class="muted">Belum ditugaskan</span>'}</td><td><div class="row-actions"><button class="btn btn-primary btn-small" data-assign="${escapeHtml(row.classId)}">${row.assigned?'Ubah Penugasan':'Tugaskan'}</button><button class="btn btn-light btn-small" data-edit="${escapeHtml(row.classId)}">Edit Identitas</button><button class="btn btn-light btn-small" data-reset="${escapeHtml(row.classId)}">Reset Password</button><button class="btn btn-light btn-small" data-toggle="${escapeHtml(row.classId)}" data-next="${status.get(row.classId)?.active?'false':'true'}">${status.get(row.classId)?.active?'Nonaktifkan':'Aktifkan'}</button></div></td></tr>`).join('')}</tbody></table></div></section>
        <div class="teacher-account-cards">${rows.map(row=>`<article class="card teacher-account-card"><div class="user-profile-cell">${avatar(row.teacher)}<span><strong>${escapeHtml(row.teacher.name)}</strong><small>${escapeHtml(row.teacher.nip||'NIP belum diisi')}</small></span>${status.get(row.classId)?.active?'<span class="badge badge-active">Aktif</span>':'<span class="badge badge-inactive">Nonaktif</span>'}</div><dl class="teacher-account-facts"><div><dt>Rombel</dt><dd><span class="badge badge-a">${escapeHtml(row.classId)}</span></dd></div><div><dt>Username</dt><dd><strong>${escapeHtml(status.get(row.classId)?.username||'—')}</strong>${status.get(row.classId)?.mustChangePassword?'<small>Password sementara</small>':''}</dd></div><div class="teacher-account-subjects"><dt>Mata Pelajaran Ditugaskan</dt><dd>${row.assigned?(row.subjectIds.length?`<strong>${row.subjects.length} mapel</strong><small>${escapeHtml(row.subjects.map(item=>item.name).join(', '))}</small>${row.active?'':'<span class="badge badge-inactive">Penugasan nonaktif</span>'}`:'<span class="badge badge-inactive">Tidak ada mapel</span>'):'<span class="muted">Belum ditugaskan</span>'}</dd></div></dl><div class="row-actions"><button class="btn btn-primary btn-small" data-assign="${escapeHtml(row.classId)}">${row.assigned?'Ubah Penugasan':'Tugaskan'}</button><button class="btn btn-light btn-small" data-edit="${escapeHtml(row.classId)}">Edit Identitas</button><button class="btn btn-light btn-small" data-reset="${escapeHtml(row.classId)}">Reset Password</button><button class="btn btn-light btn-small" data-toggle="${escapeHtml(row.classId)}" data-next="${status.get(row.classId)?.active?'false':'true'}">${status.get(row.classId)?.active?'Nonaktifkan':'Aktifkan'}</button></div></article>`).join('')}</div>`;
      view.querySelectorAll('[data-assign]').forEach(button=>button.onclick=()=>{
        const row=rows.find(item=>item.classId===button.dataset.assign);
        openAssignmentForm(row,drawAssignments);
      });
      /* Pengelolaan akun Guru dipindahkan ke sini dari menu Data Pengguna lama supaya satu
         fungsi hanya punya satu tempat. Layanannya tidak berubah sama sekali. */
      view.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>
        openAccountIdentityForm(button.dataset.edit,drawAssignments));
      view.querySelectorAll('[data-reset]').forEach(button=>button.onclick=async()=>{
        if(!await confirmDialog({title:'Reset Password Guru',
          message:`Reset password Guru Kelas ${button.dataset.reset} dan buat password sementara baru?`,
          confirmText:'Reset Password'}))return;
        try{const hasil=await resetTeacherPassword(session,button.dataset.reset);
          showCredential(hasil.temporaryPassword,button.dataset.reset);drawAssignments();}
        catch(error){toast(error.message,'error');}
      });
      view.querySelectorAll('[data-toggle]').forEach(button=>button.onclick=async()=>{
        try{await setTeacherActive(session,button.dataset.toggle,button.dataset.next==='true');
          drawAssignments();toast('Status akun Guru diperbarui.');}
        catch(error){toast(error.message,'error');}
      });
    }catch(error){view.innerHTML=`<section class="card empty-state"><h3>Penugasan gagal dimuat</h3><p>${escapeHtml(error.message)}</p></section>`;}
  }

  /* ------------------------------------------------------------------- Kesiapan Guru */
  function drawReadiness(){
    const kesiapan=getAdminReadiness(session);
    const status=kesiapan.active?'AKTIF':(kesiapan.ready?'SIAP DIAKTIFKAN':'BELUM SIAP');
    view.innerHTML=`<section class="card readiness-head"><div><h3>Status: <span class="badge ${kesiapan.active?'badge-active':(kesiapan.ready?'badge-a':'badge-inactive')}" data-readiness-status>${status}</span></h3>
      <p>${escapeHtml(kesiapan.active?'Guru sudah dapat memakai menu penilaian pada periode ini.':(kesiapan.ready?'Seluruh syarat terpenuhi. Tekan tombol di bawah untuk membuka penggunaan e-Rapor bagi Guru.':'Lengkapi syarat yang belum tercentang sebelum mengaktifkan.'))}</p>
      <p class="muted">${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</p></div>
      <div class="row-actions">${kesiapan.active
        ?'<button class="btn btn-light" data-deactivate>Tutup Penggunaan</button>'
        :`<button class="btn btn-primary" data-activate${kesiapan.ready?'':' disabled'}>AKTIFKAN e-RAPOR UNTUK GURU</button>`}</div></section>
      <section class="card"><div class="section-head"><div><h3>Checklist Kesiapan</h3><p>Seluruh butir wajib tercentang sebelum penggunaan dibuka.</p></div><span class="badge ${kesiapan.ready?'badge-active':'badge-inactive'}">${kesiapan.items.filter(item=>item.done).length}/${kesiapan.items.length} siap</span></div>
      <div class="readiness-list">${kesiapan.items.map(item=>`<article class="readiness-item${item.done?' is-done':''}"><span class="readiness-mark">${item.done?icon('check',15):icon('x',15)}</span><div><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.reason)}</p></div></article>`).join('')}</div>
      ${kesiapan.blockers?.length?`<div class="readiness-missing"><strong>BELUM SIAP</strong><ul>${kesiapan.blockers.slice(0,12).map(item=>`<li>${escapeHtml(item)} belum tersedia</li>`).join('')}${kesiapan.blockers.length>12?`<li>dan ${kesiapan.blockers.length-12} lainnya</li>`:''}</ul></div>`:''}</section>`;
    const aktifkan=view.querySelector('[data-activate]');
    if(aktifkan)aktifkan.onclick=async()=>{
      if(!await confirmDialog({title:'Aktifkan e-Rapor untuk Guru',
        message:`Buka penggunaan e-Rapor untuk seluruh Guru pada ${session.semester} ${session.academicYear}?`,
        confirmText:'Aktifkan'}))return;
      try{activateTeacherUsage(session);drawReadiness();toast('Penggunaan e-Rapor untuk Guru diaktifkan.');}
      catch(error){toast(error.message,'error');}
    };
    const tutup=view.querySelector('[data-deactivate]');
    if(tutup)tutup.onclick=async()=>{
      if(!await confirmDialog({title:'Tutup Penggunaan',
        message:'Menu penilaian Guru ditutup sementara. Tidak ada satu pun data yang dihapus. Lanjutkan?',
        confirmText:'Tutup Penggunaan'}))return;
      try{deactivateTeacherUsage(session);drawReadiness();toast('Penggunaan e-Rapor untuk Guru ditutup.');}
      catch(error){toast(error.message,'error');}
    };
  }

  /* ------------------------------------------------ Hak Akses Guru dan progres pekerjaan */
  async function drawAccess(){
    view.innerHTML='<section class="card empty-state"><h3>Memuat hak akses Guru...</h3></section>';
    try{
      const akun=await listUserAccounts(session);
      const status=new Map(akun.map(item=>[item.classId,item]));
      const rows=listTeacherAssignments(session);
      let progres=[];
      try{progres=getAdminAssessmentStatus(session)?.classes||[];}catch{progres=[];}
      const capaian=new Map(progres.map(item=>[item.classId,item]));
      view.innerHTML=`<section class="card source-banner">Guru hanya dapat membuka tahun pelajaran, semester, rombel, dan mata pelajaran sesuai penugasan Admin. Pembatasan ini juga berlaku pada lapisan data, bukan sekadar menyembunyikan menu. Admin memantau progres di sini tanpa mengubah nilai Guru.</section>
        <section class="card wide-table-card"><div class="section-head"><div><h3>Hak Akses dan Progres</h3><p>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</p></div></div>
        <div class="table-scroll"><table class="data-table users-table"><thead><tr><th>Guru</th><th>Rombel</th><th>Mapel</th><th>Status Akun</th><th>Penilaian</th><th>Deskripsi</th><th>Kelengkapan Rapor</th></tr></thead><tbody>${rows.map(row=>{
          const ringkas=capaian.get(row.classId)||{};
          const akses=row.assigned?(row.active?(row.subjectIds.length?`${row.subjects.length} mapel`:'Tidak ada mapel'):'Penugasan nonaktif'):'Tanpa batas (belum ditugaskan)';
          /* Angka progres diambil apa adanya dari Status Penilaian yang sudah ada; halaman ini
             hanya membacanya, tidak pernah menulis nilai Guru. */
          const rasio=(selesai,total)=>Number(total)>0?`${selesai}/${total}`:'—';
          const lengkap=ringkas.status==='COMPLETE';
          return `<tr><td><strong>${escapeHtml(row.teacher.name)}</strong></td><td><span class="badge badge-a">${escapeHtml(row.classId)}</span></td><td>${escapeHtml(akses)}</td><td>${status.get(row.classId)?.active?'<span class="badge badge-active">Aktif</span>':'<span class="badge badge-inactive">Nonaktif</span>'}</td><td>${escapeHtml(rasio(ringkas.scoreComplete,ringkas.scoreTotal))}</td><td>${escapeHtml(rasio(ringkas.descriptionComplete,ringkas.descriptionTotal))}</td><td>${escapeHtml(rasio(ringkas.reportCompletedItems,ringkas.reportTotalItems))}${ringkas.status?` <span class="badge ${lengkap?'badge-active':'badge-inactive'}">${lengkap?'Lengkap':'Belum'}</span>`:''}</td></tr>`;
        }).join('')}</tbody></table></div></section>`;
    }catch(error){view.innerHTML=`<section class="card empty-state"><h3>Hak akses gagal dimuat</h3><p>${escapeHtml(error.message)}</p></section>`;}
  }

  function draw(){
    if(bagian==='teachers')drawTeachers();
    else if(bagian==='assignments')drawAssignments();
    else if(bagian==='readiness')drawReadiness();
    else if(bagian==='access')drawAccess();
    else drawAssignments();
  }draw();return root;
}
