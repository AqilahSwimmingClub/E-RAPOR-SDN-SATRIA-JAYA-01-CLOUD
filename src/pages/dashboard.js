import { CLASSES } from '../data/constants.js';
import { dailyAttendanceRecap, semesterAttendanceRecap } from '../services/attendance.js';
import { getAdminAssessmentStatus } from '../services/admin-status.js';
import { getReportCompleteness } from '../services/documents.js';
import { getAdminProfile, getSchoolMaster, getTeacherProfile } from '../services/master.js';
import { getSubjectMapping } from '../services/storage.js';
import { listStudents } from '../services/students.js';
import { digitalGauge } from '../ui/digital-gauge.js';
import { icon } from '../ui/icons.js';
import { el, escapeHtml } from '../ui/dom.js';

/* Seluruh angka pada dashboard berasal dari layanan data aplikasi. Tidak ada satu pun deret
   angka karangan: bila datanya belum ada, yang tampil nol beserta keterangan apa adanya. */

const TONES=['cyan','teal','purple','amber'];
/* Garis bantu sumbu Y grafik: skala tetap 0-100 persen, bukan data. */
const AXIS_TICKS=[0,25,50,75,100];

function stat(label,value,iconName,foot,tone){
  return `<article class="dash-stat dash-stat-${tone}"><div class="dash-stat-head"><span class="dash-stat-label">${escapeHtml(label)}</span><span class="dash-stat-icon">${icon(iconName,18)}</span></div><div class="dash-stat-value">${escapeHtml(String(value))}</div><div class="dash-stat-foot">${escapeHtml(foot)}</div></article>`;
}

function categoryProgress(report,key){
  return report.studentCount?Math.round(report.students.filter(row=>row.categories[key]!==false).length/report.studentCount*100):0;
}

/* Grafik area dari deret nilai nyata. Sumbu Y selalu 0-100 supaya perbandingan antar hari
   tidak menyesatkan, dan titik tunggal tetap tergambar sebagai garis datar. */
function sparkArea(points,{labels=[],tone='cyan'}={}){
  const values=points.map(value=>Math.max(0,Math.min(100,Math.round(Number(value)||0))));
  if(!values.length)return '<div class="dash-empty">Belum ada data tersimpan untuk digambarkan.</div>';
  const width=560,height=170,pad=26;
  const span=values.length>1?values.length-1:1;
  const x=index=>pad+(index*(width-pad*2))/span;
  const y=value=>height-pad-(value/100)*(height-pad*2);
  const line=values.map((value,index)=>`${index?'L':'M'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
  const area=`${line} L${x(values.length-1).toFixed(1)} ${height-pad} L${x(0).toFixed(1)} ${height-pad} Z`;
  const grid=AXIS_TICKS.map(value=>`<line class="dash-grid" x1="${pad}" x2="${width-pad}" y1="${y(value).toFixed(1)}" y2="${y(value).toFixed(1)}"/><text class="dash-axis" x="${pad-8}" y="${(y(value)+4).toFixed(1)}" text-anchor="end">${value}</text>`).join('');
  const dots=values.map((value,index)=>`<circle class="dash-dot" cx="${x(index).toFixed(1)}" cy="${y(value).toFixed(1)}" r="3.5"><title>${escapeHtml(labels[index]||'')}: ${value}%</title></circle>`).join('');
  const ticks=values.map((value,index)=>labels[index]&&(values.length<=8||index===0||index===values.length-1||index%Math.ceil(values.length/6)===0)?`<text class="dash-axis" x="${x(index).toFixed(1)}" y="${height-6}" text-anchor="middle">${escapeHtml(labels[index])}</text>`:'').join('');
  return `<svg class="dash-chart dash-chart-${escapeHtml(tone)}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Grafik tren"><defs><linearGradient id="dashFill-${tone}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" class="dash-fill-top"/><stop offset="100%" class="dash-fill-bottom"/></linearGradient></defs>${grid}<path class="dash-area" d="${area}" fill="url(#dashFill-${tone})"/><path class="dash-line" d="${line}"/>${dots}${ticks}</svg>`;
}

/* Grafik batang horizontal untuk daftar bernama, misalnya kelengkapan rapor tiap rombel. */
function barChart(rows,{tone='cyan'}={}){
  if(!rows.length)return '<div class="dash-empty">Belum ada data tersimpan untuk digambarkan.</div>';
  return `<div class="dash-bars dash-bars-${escapeHtml(tone)}">${rows.map(row=>{
    const value=Math.max(0,Math.min(100,Math.round(Number(row.value)||0)));
    return `<div class="dash-bar-row"><span class="dash-bar-name">${escapeHtml(row.name)}</span><span class="dash-bar-track"><span class="dash-bar-fill" style="width:${value}%"></span></span><span class="dash-bar-value">${value}%</span></div>`;
  }).join('')}</div>`;
}

function donut(parts){
  const total=parts.reduce((sum,part)=>sum+part.value,0);
  if(!total)return '<div class="dash-empty">Belum ada rekap kehadiran tersimpan.</div>';
  let offset=0;
  const segments=parts.map(part=>{
    const share=part.value/total*100;
    const dash=`${share.toFixed(2)} ${(100-share).toFixed(2)}`;
    const circle=`<circle class="dash-donut-seg dash-donut-${part.tone}" cx="21" cy="21" r="15.9155" stroke-dasharray="${dash}" stroke-dashoffset="${(100-offset).toFixed(2)}"><title>${escapeHtml(part.name)}: ${part.value}</title></circle>`;
    offset+=share;
    return circle;
  }).join('');
  return `<div class="dash-donut-wrap"><svg class="dash-donut" viewBox="0 0 42 42" role="img" aria-label="Rekap kehadiran"><circle class="dash-donut-track" cx="21" cy="21" r="15.9155"/>${segments}<text class="dash-donut-total" x="21" y="20.5" text-anchor="middle">${total}</text><text class="dash-donut-cap" x="21" y="25" text-anchor="middle">catatan</text></svg><ul class="dash-legend">${parts.map(part=>`<li><i class="dash-dot-${part.tone}"></i>${escapeHtml(part.name)}<b>${part.value}</b></li>`).join('')}</ul></div>`;
}

function panel(title,subtitle,body,extra=''){
  return `<article class="dash-panel"><div class="dash-panel-head"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></div>${extra}</div>${body}</article>`;
}

export function renderDashboard(session){
  const isAdmin=session.role==='admin';
  const school=getSchoolMaster();
  const profile=isAdmin?getAdminProfile():getTeacherProfile(session.classId);
  const activeSubjects=getSubjectMapping(session).filter(subject=>subject.active).length;
  const students=listStudents(session,{classId:isAdmin?'ALL':session.classId});
  const today=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);

  const adminStatus=isAdmin?getAdminAssessmentStatus(session):null;
  const report=isAdmin?null:getReportCompleteness(session);
  const daily=isAdmin?null:dailyAttendanceRecap(session,today,{classId:session.classId});
  const recap=isAdmin?null:semesterAttendanceRecap(session,{classId:session.classId});
  const attendancePercentage=daily?.saved&&students.length?Math.round(daily.totals.Hadir/students.length*100):0;
  const reportPercentage=isAdmin?adminStatus.reportPercentage:report.overallPercentage;

  const stats=isAdmin
    ?[stat('Jumlah Rombel',CLASSES.length,'school','Kelas 1A sampai 6D',TONES[0]),
      stat('Data Siswa',adminStatus.totalStudents,'users','Semester aktif',TONES[1]),
      stat('Rombel Lengkap',`${adminStatus.completeClasses}/${adminStatus.classCount}`,'check-circle',`${adminStatus.incompleteClasses} rombel belum lengkap`,TONES[2]),
      stat('Mata Pelajaran',activeSubjects,'book','Mengikuti mapping aktif',TONES[3])]
    :[stat('Rombel Aktif',session.classId,'school',session.semester,TONES[0]),
      stat('Jumlah Siswa',students.length,'users',students.length?'Data siswa tersimpan':'Belum ada data siswa',TONES[1]),
      stat('Kehadiran Hari Ini',daily?.saved?`${attendancePercentage}%`:'—','calendar',daily?.saved?`${daily.totals.Hadir} dari ${students.length} siswa`:'Absensi hari ini belum diisi',TONES[2]),
      stat('Kelengkapan Rapor',`${reportPercentage}%`,'check-circle',`${report.completeStudents} dari ${report.studentCount} siswa lengkap`,TONES[3])];

  const gauges=isAdmin
    ?[digitalGauge(adminStatus.scorePercentage,{label:'Nilai',caption:`${adminStatus.classCount} rombel`}),
      digitalGauge(adminStatus.descriptionPercentage,{label:'Deskripsi',tone:'blue',caption:`${adminStatus.classCount} rombel`}),
      digitalGauge(adminStatus.reportPercentage,{label:'Kelengkapan',tone:'green',caption:'Seluruh kelas'})]
    :[digitalGauge(attendancePercentage,{label:'Hadir Hari Ini',tone:'blue',caption:daily?.saved?'Absensi tersimpan':'Belum tersimpan'}),
      digitalGauge(reportPercentage,{label:'Rapor Lengkap',tone:'green',caption:`Kelas ${session.classId}`})];

  /* Admin: kelengkapan rapor tiap rombel, langsung dari ringkasan penilaian. */
  const classRows=isAdmin?adminStatus.classes.map(item=>({name:`Kelas ${item.classId}`,value:item.reportPercentage})):[];
  const gradeSeries=isAdmin
    ?[...new Set(CLASSES.map(classId=>Number.parseInt(classId,10)))].sort((a,b)=>a-b).map(grade=>{
        const anggota=adminStatus.classes.filter(item=>Number.parseInt(item.classId,10)===grade);
        const total=anggota.reduce((sum,item)=>sum+item.reportTotalItems,0);
        const selesai=anggota.reduce((sum,item)=>sum+item.reportCompletedItems,0);
        return {label:`Kelas ${grade}`,value:total?Math.round(selesai/total*100):0};
      })
    :[];

  /* Guru: tren kehadiran harian dihitung dari tanggal absensi yang benar-benar tersimpan. */
  const attendanceSeries=isAdmin?[]:recap.dates.map(date=>{
    const harian=dailyAttendanceRecap(session,date,{classId:session.classId});
    const jumlah=harian.total||students.length;
    return {label:date.slice(8),value:jumlah?Math.round(harian.totals.Hadir/jumlah*100):0};
  });
  const categoryRows=isAdmin?[]:['scores','descriptions','attendance','extracurricular','homeroomNote',...(String(session.semester).startsWith('Genap ')?['finalStatus']:[])]
    .map(key=>({name:{scores:'Nilai',descriptions:'Deskripsi',attendance:'Absensi',extracurricular:'Ekskul',homeroomNote:'Catatan',finalStatus:'Status Akhir'}[key],value:categoryProgress(report,key)}));

  const chartPanel=isAdmin
    ?panel('Kelengkapan Rapor per Tingkat','Persentase butir rapor yang sudah terisi pada setiap tingkat kelas.',sparkArea(gradeSeries.map(item=>item.value),{labels:gradeSeries.map(item=>item.label),tone:'cyan'}))
    :panel('Tren Kehadiran Kelas','Persentase siswa hadir pada setiap hari absensi yang tersimpan.',sparkArea(attendanceSeries.map(item=>item.value),{labels:attendanceSeries.map(item=>item.label),tone:'cyan'}),`<span class="dash-chip">${recap.daysRecorded} hari tercatat</span>`);

  const listPanel=isAdmin
    ?panel('Progres Rapor per Rombel','Diurutkan sesuai daftar rombel 1A sampai 6D.',barChart(classRows,{tone:'teal'}))
    :panel('Status Kelengkapan Kelas','Dihitung dari data kelengkapan rapor yang tersimpan.',barChart(categoryRows,{tone:'teal'}));

  const sidePanel=isAdmin
    ?panel('Data Master Aktif','Identitas yang dipakai seluruh dokumen.',`<div class="dash-list"><div class="dash-list-item"><strong>${escapeHtml(school.name)}</strong><span>Kepala Sekolah: ${escapeHtml(school.principalName||'belum diisi')}</span></div><div class="dash-list-item"><strong>${escapeHtml(profile.name)}</strong><span>Administrator · NIP ${escapeHtml(profile.nip||'belum diisi')}</span></div><div class="dash-list-item"><strong>${escapeHtml(adminStatus.academicYear)}</strong><span>${escapeHtml(adminStatus.semester)}</span></div></div>`)
    :panel('Rekap Kehadiran Semester','Seluruh catatan absensi yang tersimpan pada semester ini.',donut([
        {name:'Hadir',value:recap.totals.Hadir,tone:'cyan'},
        {name:'Sakit',value:recap.totals.Sakit,tone:'teal'},
        {name:'Izin',value:recap.totals.Izin,tone:'purple'},
        {name:'Alpa',value:recap.totals.Alpa,tone:'amber'}
      ]));

  return el(`<div class="dash">
    <section class="dash-hero">
      <div class="dash-hero-text">
        <span class="dash-chip">${escapeHtml(session.semester)}</span>
        <h1>Dashboard ${escapeHtml(profile.name)}</h1>
        <p>${escapeHtml(school.name)}${isAdmin?'':` · Wali Kelas ${escapeHtml(session.classId)}`}</p>
      </div>
      <div class="dash-hero-gauges">${gauges.join('')}</div>
    </section>
    <section class="dash-stat-grid">${stats.join('')}</section>
    <section class="dash-panel-grid">${chartPanel}${listPanel}</section>
    <section class="dash-panel-grid dash-panel-grid-wide">${sidePanel}</section>
  </div>`);
}
