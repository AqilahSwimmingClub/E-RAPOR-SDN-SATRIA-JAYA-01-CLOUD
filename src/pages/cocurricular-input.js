import { DIMENSI_PROFIL_PELAJAR_PANCASILA, dimensiKokurikuler,
  generateCocurricularDescription } from '../data/cocurricular.js';
import { COCURRICULAR_PREDICATES, DEFAULT_COCURRICULAR_PREDICATE, getStudentCocurricular,
  hapusSemuaCocurricular, listCocurricularActivities, predikatKokurikuler, previewAllCocurricular,
  saveAllCocurricular } from '../services/completeness.js';
import { listStudents } from '../services/students.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* INPUT NILAI KOKURIKULER — POLA YANG SAMA PERSIS DENGAN INTRAKURIKULER.

     Pilih Kegiatan -> pilih Predikat -> [Isi Otomatis Semua Siswa] -> guru cek/edit ->
     [Simpan Semua]

   BUG YANG DIPERBAIKI DI SINI. Halaman lama menaruh deskripsi hasil Generate ke dalam satu
   kotak, lalu TIDAK menangani perubahan pilihan kegiatan sama sekali: dropdown kegiatan tidak
   punya satu pun penangan `onchange`. Guru yang membuat deskripsi untuk Kegiatan A lalu
   berpindah ke Kegiatan B melihat kalimat A masih terpampang, dan menekan Simpan menuliskan
   kalimat A sebagai deskripsi B.

   Sekarang draf DIPISAH PER KEGIATAN. Setiap baris draf membawa nama kegiatannya sendiri, dan
   berpindah kegiatan menampilkan draf kegiatan itu - bukan draf kegiatan sebelumnya. Draf
   Kegiatan A tetap utuh bila guru kembali ke A.

   Seperti Intrakurikuler: [Isi Otomatis Semua Siswa] tidak menyimpan apa pun. Selama Simpan
   Semua belum ditekan, memuat ulang aplikasi mengembalikan keadaan sebelumnya. */

function studentOptions(students,selected=''){
  return students.map(student=>`<option value="${escapeHtml(student.id)}" ${student.id===selected?'selected':''}>${escapeHtml(student.name)} · ${escapeHtml(student.nis)}</option>`).join('');
}
/* KOKURIKULER MEMAKAI PREDIKAT PERKEMBANGAN, bukan predikat penguasaan materi. Istilah versi
   lama tidak lagi ditawarkan untuk catatan baru; yang sudah tersimpan diterjemahkan lebih dulu
   oleh layanan, sehingga pilihan yang terlihat guru selalu salah satu dari empat ini. */
function predicateOptions(selected){
  const nilai=predikatKokurikuler(selected)?.label||DEFAULT_COCURRICULAR_PREDICATE;
  return COCURRICULAR_PREDICATES.map(value=>`<option value="${escapeHtml(value)}" ${value===nilai?'selected':''}>${escapeHtml(value)}</option>`).join('');
}
/* Indikator penilaian kokurikuler adalah Dimensi Profil Pelajar Pancasila. Daftarnya tetap dan
   diambil dari data aplikasi, sehingga rapor tidak pernah menyebut dimensi yang diketik bebas. */
function dimensiOptions(selected){
  return DIMENSI_PROFIL_PELAJAR_PANCASILA.map(item=>
    `<option value="${escapeHtml(item.id)}" ${item.id===selected?'selected':''}>${escapeHtml(item.label)}</option>`).join('');
}

export function renderCocurricularInput(session){
  let selectedStudentId='';
  let kegiatan='';
  let predicate=DEFAULT_COCURRICULAR_PREDICATE;
  let dimensi='';
  /* Dimensi yang DIPILIH SENDIRI oleh guru, disimpan per kegiatan.

     Tanpa ini, menggambar ulang layar akan mengembalikan dimensi ke nilai yang sudah tersimpan
     - sehingga guru yang mengganti dimensi sesudah menekan Simpan Semua melihat pilihannya
     kembali sendiri ke dimensi lama. Pilihan guru yang sedang berjalan harus menang atas
     catatan lama; catatan lama tetap dipakai ketika guru belum memilih apa pun. */
  const dimensiPilihan=new Map();
  /* Draf per kegiatan: Map<namaKegiatan, Map<studentId,baris>>. Inilah yang membuat deskripsi
     satu kegiatan tidak pernah menjadi deskripsi kegiatan lain. */
  const drafPerKegiatan=new Map();
  const draf=()=>{
    if(!drafPerKegiatan.has(kegiatan))drafPerKegiatan.set(kegiatan,new Map());
    return drafPerKegiatan.get(kegiatan);
  };

  const root=el(`<div><div class="page-head"><div><h1>Input Nilai Kokurikuler</h1><p>Catat kegiatan kokurikuler Kelas ${escapeHtml(session.classId)} pada scope aktif.</p></div></div><div data-view></div></div>`);
  const view=root.querySelector('[data-view]');

  function draw(){
    const students=listStudents(session,{classId:session.classId});
    if(!students.length){
      view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa melalui menu Data Siswa terlebih dahulu.</p></section>';
      return;
    }
    if(!students.some(student=>student.id===selectedStudentId))selectedStudentId=students[0].id;
    const student=students.find(item=>item.id===selectedStudentId);
    const tersimpan=getStudentCocurricular(session,selectedStudentId);
    const choices=[...listCocurricularActivities()];
    const kegiatanTersimpan=tersimpan?.activity||tersimpan?.projectTitle||tersimpan?.theme||'';
    if(kegiatanTersimpan&&!choices.includes(kegiatanTersimpan))choices.unshift(kegiatanTersimpan);
    if(!choices.includes(kegiatan))kegiatan=kegiatanTersimpan||choices[0]||'';

    /* Dimensi utama kegiatan dipakai sebagai pilihan awal, lalu guru bebas menggantinya. */
    const bawaanDimensi=dimensiKokurikuler(kegiatan,'')?.id||DIMENSI_PROFIL_PELAJAR_PANCASILA[0].id;
    const isian=draf();
    const barisSiswa=isian.get(selectedStudentId);
    /* Kotak deskripsi HANYA menampilkan isi yang memang milik kegiatan yang sedang dipilih. */
    const cocokTersimpan=kegiatanTersimpan===kegiatan?tersimpan:null;
    if(barisSiswa)predicate=barisSiswa.predicate;
    else if(cocokTersimpan?.predicate)predicate=cocokTersimpan.predicate;
    dimensi=dimensiPilihan.get(kegiatan)
      ||barisSiswa?.dimension||cocokTersimpan?.dimension||bawaanDimensi;
    if(!DIMENSI_PROFIL_PELAJAR_PANCASILA.some(item=>item.id===dimensi))dimensi=bawaanDimensi;
    const isiDeskripsi=barisSiswa?barisSiswa.description:(cocokTersimpan?.description||'');

    const baris=students.map((item,index)=>{
      const drafBaris=isian.get(item.id);
      const simpan=getStudentCocurricular(session,item.id);
      const simpanCocok=(simpan?.activity||'')===kegiatan?simpan:null;
      const sumber=drafBaris||simpanCocok;
      const status=drafBaris?'<span class="badge badge-inactive">Draf · belum disimpan</span>'
        :simpanCocok?'<span class="badge badge-active">Tersimpan</span>'
        :'<span class="badge badge-inactive">Belum diisi</span>';
      return `<tr><td>${index+1}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(sumber?.predicate||'-')}</td><td>${status}</td><td>${escapeHtml(sumber?.description||'')}</td></tr>`;
    }).join('');

    view.innerHTML=`<section class="card module-filter"><div class="field compact-field"><label>Siswa</label><select class="input" data-student>${studentOptions(students,selectedStudentId)}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section>
      <section class="card"><div class="section-head"><div><h3>Kokurikuler ${escapeHtml(student.name)}</h3><p>Pilih kegiatan dan predikat, tekan Isi Otomatis Semua Siswa untuk melihat hasilnya, lalu Simpan Semua untuk menyimpannya.</p></div></div>
      <div class="form-grid"><div class="field form-span-2"><label>Kegiatan Kokurikuler *</label><select class="input" data-activity>${choices.map(nama=>`<option value="${escapeHtml(nama)}" ${nama===kegiatan?'selected':''}>${escapeHtml(nama)}</option>`).join('')}</select></div>
      <div class="field"><label>Predikat *</label><select class="input" data-predicate>${predicateOptions(predicate)}</select></div>
      <div class="field"><label>Dimensi Profil Pelajar Pancasila *</label><select class="input" data-dimension>${dimensiOptions(dimensi)}</select><p class="muted">Indikator penilaian kokurikuler. Dimensi ini yang disebut pada deskripsi rapor.</p></div>
      <div class="field form-span-2"><label>Deskripsi *</label><textarea class="input" rows="4" data-description placeholder="Tekan Isi Otomatis Semua Siswa atau tuliskan sendiri...">${escapeHtml(isiDeskripsi)}</textarea><div class="actions" style="margin-top:8px"><button class="btn btn-light" type="button" data-generate-description>${icon('activity',16)} Generate Deskripsi Otomatis</button></div></div></div>
      <div class="actions"><button class="btn btn-light" type="button" data-fill-all>${icon('activity',16)} Isi Otomatis Semua Siswa</button><button class="btn btn-primary" type="button" data-save-all ${isian.size?'':'disabled'}>${icon('save',16)} Simpan Semua</button><button class="btn btn-danger" type="button" data-clear-all>${icon('trash',16)} Hapus Semua</button></div></section>
      <section class="card"><div class="section-head"><div><h3>Hasil Semua Siswa</h3><p>${isian.size?`${isian.size} siswa berstatus draf pada kegiatan ${escapeHtml(kegiatan)} dan belum tersimpan.`:`Belum ada hasil baru untuk kegiatan ${escapeHtml(kegiatan)}.`}</p></div></div><div class="table-scroll"><table class="data-table" data-preview><thead><tr><th>No</th><th>Siswa</th><th>Predikat</th><th>Status</th><th>Deskripsi</th></tr></thead><tbody>${baris}</tbody></table></div></section>`;

    const susun=murid=>generateCocurricularDescription({studentName:murid.name,activity:kegiatan,
      predicate,classId:session.classId,dimension:dimensi});
    const catatDraf=teks=>{
      isian.set(selectedStudentId,{studentId:selectedStudentId,name:student.name,activity:kegiatan,
        predicate,dimension:dimensi,description:String(teks||'').trim()});
    };
    view.querySelector('[data-description]').oninput=event=>catatDraf(event.target.value);
    view.querySelector('[data-generate-description]').onclick=()=>{
      const teks=susun(student);
      view.querySelector('[data-description]').value=teks;
      catatDraf(teks);
      draw();
      toast('Deskripsi kokurikuler dibuat otomatis dan menunggu Simpan Semua.');
    };
    /* BERGANTI KEGIATAN MEMBUANG TAMPILAN KEGIATAN SEBELUMNYA. Draf kegiatan lama tetap
       tersimpan di dalam Map-nya sendiri, tetapi tidak pernah tampil sebagai milik kegiatan
       yang baru dipilih. */
    view.querySelector('[data-activity]').onchange=event=>{
      kegiatan=event.target.value;
      /* Dimensi ikut menyesuaikan kegiatan yang baru: dimensi kegiatan sebelumnya belum tentu
         relevan, dan membawanya diam-diam akan membuat rapor menyebut indikator yang salah.
         Pilihan guru untuk kegiatan LAIN tetap disimpan, jadi kembali ke kegiatan itu
         menemukan dimensinya lagi. */
      dimensi='';
      draw();
    };
    view.querySelector('[data-dimension]').onchange=event=>{
      dimensi=event.target.value;
      dimensiPilihan.set(kegiatan,dimensi);
      if(isian.has(selectedStudentId))catatDraf(view.querySelector('[data-description]').value);
      draw();
    };
    view.querySelector('[data-predicate]').onchange=event=>{
      predicate=event.target.value;
      if(isian.has(selectedStudentId))catatDraf(view.querySelector('[data-description]').value);
      draw();
    };
    view.querySelector('[data-fill-all]').onclick=()=>{
      try{
        const hasil=previewAllCocurricular(session,{activity:kegiatan,predicate,dimension:dimensi,
          predicates:Object.fromEntries([...isian].map(([id,row])=>[id,row.predicate])),
          describe:({student:murid,activity,predicate:predikat,dimension})=>generateCocurricularDescription(
            {studentName:murid.name,activity,predicate:predikat,classId:session.classId,dimension})});
        for(const row of hasil.rows)isian.set(row.studentId,{...row});
        draw();
        toast(`${hasil.rows.length} dari ${hasil.total} siswa tersusun · belum disimpan`);
      }catch(error){toast(error.message,'error');}
    };
    view.querySelector('[data-save-all]').onclick=()=>{
      try{
        const hasil=saveAllCocurricular(session,{activity:kegiatan,rows:[...isian.values()]});
        isian.clear();
        draw();
        const catatan=[`${hasil.tersimpan} dari ${hasil.total} siswa tersimpan`];
        if(hasil.gagal.length)catatan.push(`${hasil.gagal.length} gagal`);
        toast(catatan.join(' · '),hasil.gagal.length?'warning':'success');
      }catch(error){toast(error.message,'error');}
    };
    /* HAPUS SEMUA: membatalkan SATU kegiatan. Kegiatan kokurikuler lain tidak tersentuh, dan
       kegiatan ini tetap ada di daftar pilihan supaya dapat diisi ulang kapan pun. */
    view.querySelector('[data-clear-all]').onclick=async()=>{
      if(!await confirmDialog({title:'Hapus semua data kegiatan ini?',
        message:`Seluruh penilaian dan deskripsi siswa untuk kegiatan ${kegiatan} pada semester ini akan dihapus dan tidak akan tampil di Rapor. Kegiatan kokurikuler lain tidak ikut terhapus, dan kegiatan ini tetap dapat dipilih lagi nanti.`,
        confirmText:'Hapus Semua',danger:true}))return;
      try{
        const hasil=hapusSemuaCocurricular(session,kegiatan);
        drafPerKegiatan.delete(kegiatan);
        draw();
        toast(hasil.terhapus?`Data kegiatan berhasil dihapus · ${hasil.terhapus} catatan siswa`:'Tidak ada data kegiatan yang perlu dihapus.',hasil.terhapus?'success':'warning');
      }catch(error){toast(error.message,'error');}
    };
    view.querySelector('[data-student]').onchange=event=>{selectedStudentId=event.target.value;draw();};
  }

  draw();
  return root;
}
