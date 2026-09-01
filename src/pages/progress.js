import { CLASSES, SEMESTERS } from '../data/constants.js';
import { getDescriptionHistory, getScoreHistory, listStudentIdentities } from '../services/analytics.js';
import { listActiveSubjects } from '../services/subjects.js';
import { el, escapeHtml } from '../ui/dom.js';
import { digitalGauge } from '../ui/digital-gauge.js';

function options(items,value,label){return items.map(item=>`<option value="${escapeHtml(value(item))}">${escapeHtml(label(item))}</option>`).join('');}
function statusClass(status){return status==='TUNTAS'?'badge-active':'badge-inactive';}

/* Perkembangan Nilai dan Grafik Nilai Rapor punya entri sidebar masing-masing, jadi halaman
   ini merender satu mode saja. Mode riwayat tetap membawa tabel nilai dan riwayat deskripsi
   supaya tidak ada perhitungan lama yang hilang. */
const PROGRESS_MODES=Object.freeze({
  progress:{title:'Perkembangan Nilai',lead:'Riwayat Nilai Rapor dan deskripsi yang benar-benar sudah tersimpan.'},
  graph:{title:'Grafik Nilai Rapor',lead:'Ketuntasan dan rata-rata Nilai Rapor tersimpan sesuai filter.'}
});

export function renderProgress(session,mode='progress'){
  const tab=Object.hasOwn(PROGRESS_MODES,mode)?mode:'progress';
  const info=PROGRESS_MODES[tab];
  let classId=session.role==='teacher'?session.classId:CLASSES[0];let scope={...session,role:'teacher',classId};let studentIdentity='';let subjectId='ALL';let semester='ALL';const root=el(`<div><div class="page-head"><div><h1>${escapeHtml(info.title)}</h1><p>${escapeHtml(info.lead)}</p></div></div><section class="card progress-filter" data-filter></section><div data-view></div></div>`);const filter=root.querySelector('[data-filter]');const view=root.querySelector('[data-view]');
  function refreshScope(){scope={...session,role:'teacher',classId};const identities=listStudentIdentities(scope);if(!identities.some(item=>item.id===studentIdentity))studentIdentity=identities[0]?.id||'';const subjects=listActiveSubjects(scope);if(subjectId!=='ALL'&&!subjects.some(item=>item.id===subjectId))subjectId='ALL';return {identities,subjects};}
  function drawFilters(){const {identities,subjects}=refreshScope();filter.innerHTML=`${session.role==='admin'?`<div class="field compact-field"><label>Rombel</label><select class="input" data-class>${options(CLASSES,item=>item,item=>`Kelas ${item}`)}</select></div>`:''}<div class="field compact-field"><label>Siswa</label><select class="input" data-student><option value="">${identities.length?'Pilih siswa':'Belum ada data siswa'}</option>${identities.map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===studentIdentity?'selected':''}>${escapeHtml(item.name)} · ${escapeHtml(item.nisn||item.nis)}</option>`).join('')}</select></div><div class="field compact-field"><label>Mata Pelajaran</label><select class="input" data-subject><option value="ALL">Semua Mapel Aktif</option>${subjects.map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===subjectId?'selected':''}>${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="field compact-field"><label>Semester</label><select class="input" data-semester><option value="ALL">Semua Semester</option>${SEMESTERS.map(item=>`<option value="${escapeHtml(item)}" ${item===semester?'selected':''}>${escapeHtml(item)}</option>`).join('')}</select></div>`;if(session.role==='admin'){const classSelect=filter.querySelector('[data-class]');classSelect.value=classId;classSelect.onchange=event=>{classId=event.target.value;studentIdentity='';subjectId='ALL';draw();};}filter.querySelector('[data-student]').onchange=event=>{studentIdentity=event.target.value;drawView();};filter.querySelector('[data-subject]').onchange=event=>{subjectId=event.target.value;drawView();};filter.querySelector('[data-semester]').onchange=event=>{semester=event.target.value;drawView();};}
  function scoreGraph(rows){const complete=rows.filter(row=>row.masteryStatus==='TUNTAS').length;const percentage=rows.length?Math.round(complete/rows.length*100):0;const average=rows.length?Math.round(rows.reduce((sum,row)=>sum+Number(row.finalScore||0),0)/rows.length):0;return `<div class="digital-gauge-grid">${digitalGauge(percentage,{label:'Ketuntasan',tone:'green',caption:`${complete}/${rows.length} tuntas`})}${digitalGauge(average,{label:'Rata-rata Nilai',tone:'blue',caption:'Riwayat terfilter'})}</div>`;}
  function scoreTable(rows){return rows.length?`<section class="card progress-history-table"><div class="table-scroll"><table class="data-table"><thead><tr><th>Semester</th><th>Mata Pelajaran</th><th>Nilai</th><th>KKTP</th><th>Ketuntasan</th><th>Sumber</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escapeHtml(row.semester)}</td><td><strong>${escapeHtml(row.subject.name)}</strong></td><td><strong>${row.finalScore}</strong></td><td>${row.kktp}</td><td><span class="badge ${statusClass(row.masteryStatus)}">${escapeHtml(row.masteryStatus||'—')}</span></td><td>${row.isManualOverride?'Override Manual':'Otomatis'}</td></tr>`).join('')}</tbody></table></div></section>`:'<section class="card empty-state"><h3>Belum ada Nilai Rapor tersimpan</h3><p>Ubah filter atau simpan Nilai Rapor dari modul Tahap 5.</p></section>';}
  function descriptionList(rows){return rows.length?`<div class="description-history-list">${rows.map(row=>`<article class="card"><div class="description-history-head"><div><strong>${escapeHtml(row.subject.name)}</strong><span>${escapeHtml(row.semester)}</span></div><span class="badge ${row.locked?'badge-active':'badge-a'}">${row.locked?'Terkunci':row.status==='EDITED'?'Diedit Guru':'Otomatis'}</span></div><p>${escapeHtml(row.text)}</p></article>`).join('')}</div>`:'<section class="card empty-state"><h3>Belum ada deskripsi tersimpan</h3><p>Ubah filter atau simpan deskripsi dari Input Nilai Rapor.</p></section>';}
  function drawView(){
    if(!studentIdentity){view.innerHTML='<section class="card empty-state"><h3>Belum ada riwayat siswa</h3><p>Data siswa pada rombel dan tahun pelajaran ini belum tersedia.</p></section>';return;}
    const rows=getScoreHistory(scope,{studentIdentity,subjectId,semester});
    if(tab==='graph'){view.innerHTML=`<section class="card trend-card"><div class="section-head"><div><h3>Grafik Perkembangan Nilai</h3><p>Rata-rata Nilai Rapor tersimpan per semester sesuai filter.</p></div></div>${scoreGraph(rows)}</section>`;return;}
    view.innerHTML=`${scoreTable(rows)}<section class="card"><div class="section-head"><div><h3>Riwayat Deskripsi Rapor</h3><p>Deskripsi tersimpan pada semester yang sesuai filter.</p></div></div></section>${descriptionList(getDescriptionHistory(scope,{studentIdentity,subjectId,semester}))}`;
  }
  function draw(){drawFilters();drawView();}draw();return root;
}
