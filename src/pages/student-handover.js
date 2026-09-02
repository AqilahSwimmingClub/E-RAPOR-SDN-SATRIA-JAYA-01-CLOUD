import { exportStudentHandover, handoverFilename, importStudentHandover, previewStudentHandover,
  suggestPromotionClass } from '../services/student-handover.js';
import { listStudents } from '../services/students.js';
import { listMasterClasses } from '../services/master.js';
import { listReferenceAcademicYears, listReferenceSemesters } from '../services/references.js';
import { saveFile, pickFile } from '../services/file-io.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Halaman Serah Terima Data Siswa.

   Alurnya sengaja dibuat dua langkah: pilih siswa lalu unduh berkas, atau buka berkas lalu
   lihat pratinjau sebelum apa pun ditulis. Berkasnya hanya membawa biodata; nilai, absensi,
   akun, dan lisensi tidak pernah ikut. */

export function renderStudentHandover(session){
  let berkasMasuk=null;
  const root=el(`<div><div class="page-head"><div><h1>Serah Terima Data Siswa</h1>
    <p>Pindahkan biodata siswa antar rombel, tahun pelajaran, atau perangkat. Nilai, absensi, akun, dan lisensi tidak ikut terbawa.</p></div></div>
    <div data-view></div></div>`);
  const view=root.querySelector('[data-view]');

  function daftarSiswa(){
    try{return listStudents(session,{classId:session.classId});}catch{return [];}
  }

  function draw(){
    const siswa=daftarSiswa();
    const rombel=listMasterClasses();
    const tahun=listReferenceAcademicYears();
    const saran=suggestPromotionClass(session.classId)||session.classId;
    view.innerHTML=`
      <section class="card">
        <div class="section-head"><div><h3>Kirim Data Siswa</h3>
          <p>Kelas ${escapeHtml(session.classId||'-')} · ${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</p></div>
          <span class="badge badge-a">${siswa.length} siswa</span></div>
        ${siswa.length?`<div class="handover-list">${siswa.map(item=>`<label class="handover-row">
            <input type="checkbox" data-pilih value="${escapeHtml(item.id)}" checked/>
            <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.nis||item.nisn||'-')}</small></span></label>`).join('')}</div>
          <div class="actions">
            <button class="btn btn-light" data-semua>Pilih Semua</button>
            <button class="btn btn-light" data-kosong>Kosongkan</button>
            <button class="btn btn-primary" data-unduh>${icon('download',16)} Unduh Berkas Serah Terima</button>
          </div>`
        :'<div class="empty-inline">Belum ada siswa pada rombel ini.</div>'}
      </section>

      <section class="card">
        <div class="section-head"><div><h3>Terima Data Siswa</h3>
          <p>Buka berkas serah terima, periksa pratinjaunya, lalu tentukan rombel dan periode tujuan.</p></div></div>
        <div class="form-grid">
          <div class="field form-span-2"><label>Berkas Serah Terima</label>
            <input class="input" type="file" accept="application/json,.json" data-berkas/></div>
          <div class="field"><label>Rombel Tujuan</label><select class="input" data-tujuan>
            ${rombel.map(id=>`<option value="${escapeHtml(id)}" ${id===saran?'selected':''}>${escapeHtml(id)}</option>`).join('')}</select></div>
          <div class="field"><label>Tahun Pelajaran Tujuan</label><select class="input" data-tahun>
            ${tahun.map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===session.academicYear?'selected':''}>${escapeHtml(item.label)}</option>`).join('')}</select></div>
          <div class="field form-span-2"><label>Semester Tujuan</label><select class="input" data-semester></select></div>
        </div>
        <div data-pratinjau></div>
        <div class="actions">
          <button class="btn btn-light" data-lihat disabled>Lihat Pratinjau</button>
          <button class="btn btn-primary" data-terima disabled>${icon('save',16)} Terima Data Siswa</button>
        </div>
      </section>`;

    const pilihan=()=>[...view.querySelectorAll('[data-pilih]:checked')].map(item=>item.value);
    view.querySelector('[data-semua]')?.addEventListener('click',()=>{
      view.querySelectorAll('[data-pilih]').forEach(item=>{item.checked=true;});});
    view.querySelector('[data-kosong]')?.addEventListener('click',()=>{
      view.querySelectorAll('[data-pilih]').forEach(item=>{item.checked=false;});});

    view.querySelector('[data-unduh]')?.addEventListener('click',async()=>{
      try{
        const payload=exportStudentHandover(session,{studentIds:pilihan()});
        await saveFile({name:handoverFilename(payload),mime:'application/json',
          data:JSON.stringify(payload,null,2)});
        toast(`${payload.students.length} biodata siswa siap diserahterimakan.`);
      }catch(error){toast(error.message,'error');}
    });

    function isiSemester(){
      const tahunTerpilih=view.querySelector('[data-tahun]').value;
      const daftar=listReferenceSemesters({academicYear:tahunTerpilih});
      view.querySelector('[data-semester]').innerHTML=daftar
        .map(item=>`<option value="${escapeHtml(item.label)}" ${item.label===session.semester?'selected':''}>${escapeHtml(item.name)}</option>`).join('');
    }
    view.querySelector('[data-tahun]').onchange=isiSemester;
    isiSemester();

    view.querySelector('[data-berkas]').onchange=async event=>{
      const file=event.target.files?.[0];
      berkasMasuk=null;
      view.querySelector('[data-pratinjau]').innerHTML='';
      view.querySelector('[data-lihat]').disabled=true;
      view.querySelector('[data-terima]').disabled=true;
      if(!file)return;
      try{
        berkasMasuk=JSON.parse(await file.text());
        view.querySelector('[data-lihat]').disabled=false;
        toast('Berkas terbaca. Tekan Lihat Pratinjau sebelum menerima.');
      }catch{toast('Berkas tidak dapat dibaca sebagai JSON.','error');}
    };

    const opsiTujuan=()=>({
      targetClassId:view.querySelector('[data-tujuan]').value,
      targetAcademicYear:view.querySelector('[data-tahun]').value,
      targetSemester:view.querySelector('[data-semester]').value,
    });

    view.querySelector('[data-lihat]').onclick=()=>{
      try{
        const hasil=previewStudentHandover(session,berkasMasuk,opsiTujuan());
        view.querySelector('[data-pratinjau]').innerHTML=`<div class="handover-preview">
          <p>Berkas dari Kelas ${escapeHtml(hasil.source.classId||'-')} · ${escapeHtml(hasil.source.academicYear||'-')}</p>
          <p><strong>${hasil.newStudents}</strong> siswa akan masuk ke Kelas ${escapeHtml(hasil.targetClassId)}
             pada ${escapeHtml(hasil.targetSemester)} ${escapeHtml(hasil.targetAcademicYear)}.</p>
          ${hasil.duplicates?`<p class="handover-skip">${hasil.duplicates} siswa dilewati karena sudah terdaftar pada periode tujuan: ${escapeHtml(hasil.duplicateNames.join(', '))}.</p>`:''}
        </div>`;
        view.querySelector('[data-terima]').disabled=hasil.newStudents===0;
      }catch(error){toast(error.message,'error');}
    };

    view.querySelector('[data-terima]').onclick=()=>{
      try{
        const hasil=importStudentHandover(session,berkasMasuk,opsiTujuan());
        toast(hasil.skipped
          ? `${hasil.imported} siswa diterima. ${hasil.skipped} dilewati karena sudah terdaftar.`
          : `${hasil.imported} siswa berhasil diterima.`);
        draw();
      }catch(error){toast(error.message,'error');}
    };
  }

  draw();
  return root;
}
