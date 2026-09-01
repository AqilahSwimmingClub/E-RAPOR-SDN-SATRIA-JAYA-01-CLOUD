# Assessment, Transcript, and Printing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Admin and Guru/Wali Kelas assessment, completeness, progress, transcript, and print flows, including separate Kokurikuler and Intrakurikuler storage.

**Architecture:** Reuse existing report, analytics, transcript, document, and print engines behind canonical child routes. Add a parallel Intrakurikuler service and focused route pages; keep score stores separate and expose a publication registry rather than treating generated PDF files as the source of truth.

**Tech Stack:** Vanilla ES modules, Node.js `node:test`, localStorage JSON database, XLSX import/export, browser printing, Electron file/print helpers.

**Spec:** `docs/superpowers/specs/2026-08-31-admin-guru-dapodik-redesign.md`

## Global Constraints

- This plan starts after `2026-08-31-core-navigation-manual-students.md` passes its regression gate.
- Kokurikuler and Intrakurikuler must use separate activity and score collections.
- Existing report, attendance, extracurricular, transcript, analytics, and print data must remain readable.
- Canonical child routes may wrap existing engines, but no duplicate sidebar entries are allowed.
- Generated PDFs are outputs; stored scores and publication records remain the source of truth.
- Printing supports A4, margins, signatures, class/student selection, per-student generation, and whole-class generation.
- Admin owns reference mapping and assessment dimensions; Teacher does not receive separate Mapping or Dimensi menu entries.

## File Map

- `src/services/intracurricular.js`: Admin CRUD for Intrakurikuler activities.
- `src/services/completeness.js`: student-level Kokurikuler/Intrakurikuler/extracurricular/note/promotion records.
- `src/pages/intracurricular.js`: Admin activity management.
- `src/pages/completeness.js`: canonical child pages for Wali Kelas completeness input.
- `src/pages/references.js`: route-selected Admin reference sections.
- `src/pages/reports.js`, `src/pages/admin-status.js`, `src/pages/class-overview.js`, `src/pages/progress.js`: canonical status/progress views.
- `src/services/transcript-admin.js`: diploma numbers, transcript settings, and mapping records.
- `src/pages/transcript-admin.js`, `src/pages/transcript.js`: Admin and Teacher transcript flows.
- `src/services/print-settings.js`, `src/services/publications.js`, `src/services/documents.js`: print configuration and publication state.
- `src/pages/print.js`: ledger, supplement, report generation and publication controls.
- `src/app.js`, `src/data/navigation.js`, `src/styles/app.css`, `package.json`: route wiring, UI, and checks.
- New and existing tests under `tests/`: isolated services, route contracts, report documents, printing, imports, and regressions.

---

### Task 1: Intrakurikuler Activity Service

**Files:**
- Create: `src/services/intracurricular.js`
- Create: `tests/intracurricular.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `listIntracurricularActivities(session, filters): IntracurricularActivity[]`
  - `createIntracurricularActivity(session, input): IntracurricularActivity`
  - `updateIntracurricularActivity(session, id, input): IntracurricularActivity`
  - `deleteIntracurricularActivity(session, id): boolean`
  - `IntracurricularActivity = {id,name,description,classId,semester,academicYear,active,createdAt,updatedAt}`
- Consumes: schema 5 `intracurricularActivities`, `loadDb()`, and `updateDb()`.

- [x] **Step 1: Write Admin CRUD and separation tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCocurricularActivity } from '../src/services/cocurricular.js';
import {
  createIntracurricularActivity,listIntracurricularActivities
} from '../src/services/intracurricular.js';
import { loadDb } from '../src/services/storage.js';

test('Intrakurikuler records are separate from Kokurikuler records',()=>{
  useMemoryStorage();
  const admin={role:'admin',academicYear:'2026/2027',semester:'Ganjil 2026/2027'};
  createCocurricularActivity(admin,{name:'Projek Lingkungan',description:'Kegiatan projek',classId:'5B',academicYear:admin.academicYear,semester:admin.semester,active:true});
  const intra=createIntracurricularActivity(admin,{name:'Literasi Matematika',description:'Penguatan pembelajaran',classId:'5B',academicYear:admin.academicYear,semester:admin.semester,active:true});
  assert.deepEqual(listIntracurricularActivities(admin).map(item=>item.name),['Literasi Matematika']);
  assert.equal(Object.values(loadDb().intracurricularActivities)[0].id,intra.id);
  assert.equal(Object.keys(loadDb().cocurricularActivities).length,1);
});

test('Teacher cannot manage Intrakurikuler master data',()=>{
  useMemoryStorage();
  assert.throws(()=>createIntracurricularActivity({role:'teacher',classId:'5B'},{
    name:'Tidak Sah',description:'Tidak sah',classId:'5B',academicYear:'2026/2027',semester:'Ganjil 2026/2027'
  }),/Hanya Admin/);
});
```

- [x] **Step 2: Run the test and confirm the missing-module failure**

Run: `node --test tests/intracurricular.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [x] **Step 3: Implement scoped Admin CRUD**

```js
function keyOf(record){
  return `${record.academicYear}|${record.semester}|${record.classId}|${record.id}`;
}

export function createIntracurricularActivity(session,input){
  assertAdmin(session);
  const value=normalize(session,input);
  const now=new Date().toISOString();
  const saved={...value,id:newId(),createdAt:now,updatedAt:now};
  updateDb(db=>{db.intracurricularActivities[keyOf(saved)]=saved;return db;});
  return clone(saved);
}
```

Mirror the proven Kokurikuler validation rules while changing error copy, ID prefix, and collection names. Include uniqueness by name within the same class/year/semester.

- [x] **Step 4: Run focused tests and syntax checks**

Run: `node --test tests/intracurricular.test.js && npm run check`  
Expected: PASS.

- [x] **Step 5: Commit the service**

```bash
git add src/services/intracurricular.js tests/intracurricular.test.js package.json
git commit -m "feat: add separate intracurricular activity service"
```

### Task 2: Admin Intrakurikuler Page and Route

**Files:**
- Create: `src/pages/intracurricular.js`
- Modify: `src/app.js`
- Modify: `src/styles/app.css`
- Create: `tests/intracurricular-ui.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes all four Intrakurikuler service functions.
- Produces `renderIntracurricular(session): HTMLElement` on canonical Admin route `intracurricular`.

- [ ] **Step 1: Add a route/page contract test**

```js
test('Admin Intrakurikuler route uses a dedicated page and store',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  const page=await readFile(new URL('../src/pages/intracurricular.js',import.meta.url),'utf8');
  assert.match(app,/case 'intracurricular': return renderIntracurricular\(session\)/);
  assert.match(page,/listIntracurricularActivities/);
  assert.match(page,/Tambah Kegiatan Intrakurikuler/);
  assert.doesNotMatch(page,/cocurricularActivities/);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/intracurricular-ui.test.js`  
Expected: FAIL because the page does not exist.

- [ ] **Step 3: Build the page using the established Admin activity pattern**

```js
export function renderIntracurricular(session){
  let classId='ALL',academicYear=session.academicYear,semester=session.semester;
  const root=el(`<div>
    <div class="page-head"><div><h1>Data Intrakurikuler</h1>
      <p>Kelola kegiatan penguatan pembelajaran per rombel dan semester.</p></div>
      <button class="btn btn-primary" data-add>Tambah Kegiatan</button>
    </div>
    <section class="card activity-filter" data-filter></section>
    <div data-view></div>
  </div>`);
  // drawFilter(), openForm(), draw(), edit and delete bindings follow the same
  // explicit fields as the service: name, description, classId, academicYear,
  // semester, and active.
  return root;
}
```

Implement every named helper in the file and reuse reference services for class/year/semester options. The empty state text must say `Belum ada kegiatan intrakurikuler`.

- [ ] **Step 4: Run UI, service, router, and syntax tests**

Run: `node --test tests/intracurricular-ui.test.js tests/intracurricular.test.js tests/router.test.js && npm run check`  
Expected: PASS.

- [ ] **Step 5: Commit the Admin page**

```bash
git add src/pages/intracurricular.js src/app.js src/styles/app.css tests/intracurricular-ui.test.js package.json
git commit -m "feat: add Admin Intrakurikuler management"
```

### Task 3: Student Intrakurikuler Score Records

**Files:**
- Modify: `src/services/completeness.js`
- Modify: `tests/completeness.test.js`

**Interfaces:**
- Produces:
  - `getStudentIntracurricular(session, studentId): IntracurricularScore|null`
  - `saveStudentIntracurricular(session, studentId, input): IntracurricularScore`
  - `saveIntracurricularBulk(session, input, options): IntracurricularScore[]`
  - `IntracurricularScore = {studentId,activity,predicate,description,classId,semester,academicYear,createdAt,updatedAt}`
- Consumes: `intracurricularScores`, assigned-class student guard, and predicates `Baik`/`Sangat Baik`.

- [ ] **Step 1: Add persistence and separation tests**

```js
test('Guru saves Intrakurikuler independently from Kokurikuler',()=>{
  useMemoryStorage();
  const student=createStudent(teacher5b,studentInput());
  saveStudentCocurricular(teacher5b,student.id,{
    activity:'Projek Kebersihan',predicate:'Baik',description:'Aktif bekerja sama.'
  });
  saveStudentIntracurricular(teacher5b,student.id,{
    activity:'Literasi Numerasi',predicate:'Sangat Baik',description:'Mampu bernalar dan menjelaskan strategi.'
  });
  assert.equal(getStudentCocurricular(teacher5b,student.id).activity,'Projek Kebersihan');
  assert.equal(getStudentIntracurricular(teacher5b,student.id).activity,'Literasi Numerasi');
  assert.equal(Object.keys(loadDb().cocurricularScores).length,1);
  assert.equal(Object.keys(loadDb().intracurricularScores).length,1);
});
```

- [ ] **Step 2: Run completeness tests and confirm missing exports**

Run: `node --test tests/completeness.test.js`  
Expected: FAIL because the Intrakurikuler functions are not exported.

- [ ] **Step 3: Implement Intrakurikuler score validation and writes**

```js
function intracurricularKey(session,studentId){
  return `${scopeKey(session)}|${studentId}`;
}

function normalizeIntracurricular(input){
  const record={
    activity:clean(input?.activity,180),
    predicate:clean(input?.predicate,50),
    description:clean(input?.description,1200)
  };
  if(!record.activity)throw new Error('Kegiatan intrakurikuler wajib diisi.');
  if(!knownPredicate(record.predicate))throw new Error('Predikat intrakurikuler tidak valid.');
  if(!record.description)throw new Error('Deskripsi intrakurikuler wajib diisi.');
  return record;
}
```

Use `requireStudent()` before every read/write, preserve `createdAt`, update `updatedAt`, and make bulk mode default to `overwrite:false` so existing student records are not silently replaced.

- [ ] **Step 4: Run completeness and migration tests**

Run: `node --test tests/completeness.test.js tests/migrations.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit the score domain**

```bash
git add src/services/completeness.js tests/completeness.test.js
git commit -m "feat: store intracurricular scores separately"
```

### Task 4: Canonical Input Kelengkapan Child Pages

**Files:**
- Modify: `src/pages/completeness.js`
- Modify: `src/app.js`
- Modify: `src/styles/app.css`
- Create: `tests/completeness-routes.test.js`

**Interfaces:**
- Produces:
  - `renderCompleteness(session, initialSection): HTMLElement`
  - supported sections: `extracurricular`, `cocurricular`, `intracurricular`, `note`, `promotion`
- Consumes: `student-update` and `attendance` as separate existing pages.

- [ ] **Step 1: Add child-route wiring tests**

```js
test('approved completeness child routes open their matching sections',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/case 'extra-input': return renderCompleteness\(session,'extracurricular'\)/);
  assert.match(app,/case 'cocurricular-input': return renderCompleteness\(session,'cocurricular'\)/);
  assert.match(app,/case 'intracurricular-input': return renderCompleteness\(session,'intracurricular'\)/);
  assert.match(app,/case 'homeroom-note': return renderCompleteness\(session,'note'\)/);
  assert.match(app,/case 'promotion-input': return renderCompleteness\(session,'promotion'\)/);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/completeness-routes.test.js`  
Expected: FAIL because the canonical cases and `initialSection` parameter are absent.

- [ ] **Step 3: Add section-based rendering and Intrakurikuler form**

```js
export function renderCompleteness(session,initialSection='extracurricular'){
  let tab=initialSection;
  const allowed=new Set(['extracurricular','cocurricular','intracurricular','note','promotion']);
  if(!allowed.has(tab))tab='extracurricular';
  // Existing drawExtracurricular(), drawCocurricular(), drawNote(), and
  // drawPromotion() are retained. Add drawIntracurricular() with the exact
  // student, activity, predicate, description, save, and bulk controls below.
}
```

`drawIntracurricular()` must select one assigned-class student, populate active Intrakurikuler activities for that class/period, save through `saveStudentIntracurricular()`, and offer `Terapkan ke siswa kosong` through `saveIntracurricularBulk(...,{overwrite:false})`. Remove the old internal tab bar when opened through a canonical child route so the sidebar remains the single navigation source.

- [ ] **Step 4: Run completeness route and service tests**

Run: `node --test tests/completeness-routes.test.js tests/completeness.test.js tests/router.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit the Wali completeness flow**

```bash
git add src/pages/completeness.js src/app.js src/styles/app.css tests/completeness-routes.test.js
git commit -m "feat: split Wali completeness inputs into canonical routes"
```

### Task 5: Canonical Assessment, Status, and Progress Routes

**Files:**
- Modify: `src/app.js`
- Modify: `src/pages/reports.js`
- Modify: `src/pages/admin-status.js`
- Modify: `src/pages/class-overview.js`
- Modify: `src/pages/progress.js`
- Create: `tests/assessment-route-contract.test.js`

**Interfaces:**
- Produces explicit page variants selected by route:
  - Teacher: `report-input`, `report-import`, `saved-scores`, `saved-descriptions`, `teacher-status`, `teacher-achievement`, `teacher-score-graph`, `class-status`, `class-statistics`, `student-progress`, `student-progress-graph`
  - Admin: `assessment-status`, `assessment-statistics`, `admin-progress`, `admin-progress-graph`
- Consumes existing report/analytics/admin-status services without duplicating formulas.

- [ ] **Step 1: Add a route-to-renderer contract table test**

```js
const requiredCases=[
  ['report-import',"renderReportInput(session,'import')"],
  ['saved-descriptions',"renderSavedScores(session,'descriptions')"],
  ['teacher-achievement',"renderAssessmentCheck(session,'achievement')"],
  ['class-statistics',"renderClassCheck(session,'statistics')"],
  ['student-progress-graph',"renderProgress(session,'graph')"],
  ['assessment-statistics',"renderAdminStatus(session,'statistics')"]
];

test('canonical assessment routes reuse the established engines',async()=>{
  const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  for(const [route,call] of requiredCases){
    assert.match(source,new RegExp(`case '${route}'.*${call.replace(/[()'.]/g,'\\$&')}`));
  }
});
```

- [ ] **Step 2: Run the contract test and confirm missing cases**

Run: `node --test tests/assessment-route-contract.test.js`  
Expected: FAIL for the new route cases.

- [ ] **Step 3: Parameterize existing page renderers and add explicit app cases**

```js
case 'report-input': return renderReportInput(session,'input');
case 'report-import': return renderReportInput(session,'import');
case 'saved-scores': return renderSavedScores(session,'scores');
case 'saved-descriptions': return renderSavedScores(session,'descriptions');
case 'class-status': return renderClassCheck(session,'status');
case 'class-statistics': return renderClassCheck(session,'statistics');
case 'student-progress': return renderProgress(session,'progress');
case 'student-progress-graph': return renderProgress(session,'graph');
```

Each renderer must validate the supplied mode against a fixed set and render one page mode without an internal duplicate menu. Keep existing calculations and empty/loading/error states.

- [ ] **Step 4: Run assessment, analytics, and route tests**

Run: `node --test tests/assessment-route-contract.test.js tests/assessment.test.js tests/analytics.test.js tests/router.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit canonical assessment routing**

```bash
git add src/app.js src/pages/reports.js src/pages/admin-status.js src/pages/class-overview.js src/pages/progress.js tests/assessment-route-contract.test.js
git commit -m "feat: route assessment views through one canonical menu"
```

### Task 6: Admin Reference Child Routes

**Files:**
- Modify: `src/pages/references.js`
- Modify: `src/pages/users.js`
- Modify: `src/app.js`
- Create: `tests/reference-routes.test.js`

**Interfaces:**
- Produces `renderReferences(session, section)` with sections `school`, `teachers`, `students`, `classes`, `subjects`, `learning`, `mapping`, `branding`, and `report-date`.
- Consumes existing `renderUsers()`, `renderStudents()`, subject mapping, master data, and print settings.

- [ ] **Step 1: Add role and route tests for Admin reference ownership**

```js
test('Admin reference child routes are explicit and Teacher mapping stays blocked',()=>{
  const admin={role:'admin'};
  const teacher={role:'teacher',classId:'5B'};
  for(const route of ['reference-school','reference-teachers','reference-students','reference-classes','reference-subjects','reference-learning','reference-mapping','reference-branding','reference-report-date']){
    assert.equal(canAccessRoute(route,'admin'),true);
  }
  assert.equal(resolveRoute('reference-mapping',teacher),'dashboard');
});
```

- [ ] **Step 2: Run reference and router tests and confirm missing routes**

Run: `node --test tests/reference-routes.test.js tests/router.test.js`  
Expected: FAIL because the new Admin reference routes are absent.

- [ ] **Step 3: Wire existing modules through route-selected reference sections**

```js
case 'reference-school': return renderReferences(session,'school');
case 'reference-teachers': return renderUsers(session,'teachers');
case 'reference-students': return renderStudents(session);
case 'reference-classes': return renderReferences(session,'classes');
case 'reference-subjects': return renderReferences(session,'subjects');
case 'reference-learning': return renderReferences(session,'learning');
case 'reference-mapping': return renderSubjectMapping(session);
case 'reference-branding': return renderReferences(session,'branding');
case 'reference-report-date': return renderReferences(session,'report-date');
```

Split the existing school form into reusable blocks so `branding` renders only logos/signatures and `report-date` renders date/city defaults. The `learning` section displays class–teacher–subject assignments using existing master and mapping data; edits write through existing services rather than a second store.

- [ ] **Step 4: Run reference, mapping, master, and router tests**

Run: `node --test tests/reference-routes.test.js tests/router.test.js tests/mapping.test.js tests/stage10.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit Admin reference routing**

```bash
git add src/pages/references.js src/pages/users.js src/app.js tests/reference-routes.test.js
git commit -m "feat: organize Admin reference data by canonical routes"
```

### Task 7: Transcript Administration and Diploma Numbers

**Files:**
- Create: `src/services/transcript-admin.js`
- Create: `src/pages/transcript-admin.js`
- Modify: `src/pages/transcript.js`
- Modify: `src/app.js`
- Create: `tests/transcript-admin.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `getTranscriptSettings(session): TranscriptSettings`
  - `saveTranscriptSettings(session, input): TranscriptSettings`
  - `getDiplomaNumber(session, studentId): DiplomaNumber|null`
  - `saveDiplomaNumbers(session, records): DiplomaNumber[]`
  - `previewDiplomaNumberImport(session, data): ImportPreview`
- Stores Admin records in `settings.transcript` and `settings.diplomaNumbers`; does not alter `transcriptScores`.
- Consumes existing mapping and transcript score services.

- [ ] **Step 1: Write Admin-only and preservation tests**

```js
test('Admin saves transcript settings and diploma number without changing scores',()=>{
  useMemoryStorage();
  const admin={role:'admin',academicYear:'2026/2027',semester:'Genap 2026/2027'};
  const before={...loadDb().transcriptScores};
  saveTranscriptSettings(admin,{title:'Transkrip Nilai',identityGapMm:7,headerHeightMm:8,rowHeightMm:6,headerPercent:100});
  saveDiplomaNumbers(admin,[{studentId:'student-1',number:'DN-01/2027'}]);
  assert.equal(getTranscriptSettings(admin).identityGapMm,7);
  assert.equal(getDiplomaNumber(admin,'student-1').number,'DN-01/2027');
  assert.deepEqual(loadDb().transcriptScores,before);
});

test('Teacher cannot change transcript administration settings',()=>{
  assert.throws(()=>saveTranscriptSettings({role:'teacher',classId:'6A'},{title:'X'}),/Hanya Admin/);
});
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run: `node --test tests/transcript-admin.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement validated transcript administration records**

```js
export function saveTranscriptSettings(session,input){
  assertAdmin(session);
  const value={
    title:clean(input.title,120)||'Transkrip Nilai',
    identityGapMm:boundedNumber(input.identityGapMm,0,30,7),
    headerHeightMm:boundedNumber(input.headerHeightMm,4,30,8),
    rowHeightMm:boundedNumber(input.rowHeightMm,3,20,6),
    headerPercent:boundedNumber(input.headerPercent,50,100,100),
    updatedAt:new Date().toISOString()
  };
  updateDb(db=>{db.settings.transcript=value;return db;});
  return clone(value);
}
```

Use NISN first and student ID second during import matching, reject duplicate diploma numbers within an academic year, and require preview confirmation before commit.

- [ ] **Step 4: Add Admin route renderers and preserve Teacher input/import/print**

```js
case 'transcript-number-import': return renderTranscriptAdmin(session,'numbers');
case 'transcript-settings': return renderTranscriptAdmin(session,'settings');
case 'transcript-mapping': return renderSubjectMapping(session);
case 'transcript-input': return session.role==='admin'
  ? renderTranscriptAdmin(session,'input')
  : renderTranscript(session,'input');
case 'transcript-import': return renderTranscript(session,'import');
case 'transcript-print': return renderTranscript(session,'preview');
```

The Admin input/import/print renderer selects class first and then uses a teacher-shaped scope object only after Admin authorization has succeeded.

- [ ] **Step 5: Run transcript tests and commit**

Run: `node --test tests/transcript-admin.test.js tests/transcript.test.js tests/router.test.js && npm run check`  
Expected: PASS.

```bash
git add src/services/transcript-admin.js src/pages/transcript-admin.js src/pages/transcript.js src/app.js tests/transcript-admin.test.js package.json
git commit -m "feat: add transcript administration workflows"
```

### Task 8: Print Settings and Report Publication Registry

**Files:**
- Modify: `src/services/print-settings.js`
- Create: `src/services/publications.js`
- Modify: `src/services/documents.js`
- Create: `tests/publications.test.js`
- Modify: `tests/documents.test.js`

**Interfaces:**
- Extends `PrintSettings` with `paperSize`, four margin millimeters, `signatureMode`, `principalPosition`, `showTeacherName`, and `firstPage`.
- Produces:
  - `publicationKey(session, studentId, documentType): string`
  - `publishReport(session, studentId, documentType): Publication`
  - `unpublishReport(session, studentId, documentType): boolean`
  - `isReportPublished(session, studentId, documentType): boolean`
  - `listPublishedReports(session): Publication[]`

- [ ] **Step 1: Write publication scope and settings tests**

```js
test('publication is scoped by class period student and document type',()=>{
  useMemoryStorage();
  const publication=publishReport(teacher5b,'student-1','report');
  assert.equal(publication.studentId,'student-1');
  assert.equal(isReportPublished(teacher5b,'student-1','report'),true);
  assert.equal(isReportPublished({...teacher5b,semester:'Genap 2026/2027'},'student-1','report'),false);
  assert.equal(unpublishReport(teacher5b,'student-1','report'),true);
});

test('print settings validate A4 margins and first page',()=>{
  useMemoryStorage();
  const saved=savePrintSettings(teacher5b,{
    principalName:'Kepala Sekolah',principalNip:'123',teacherName:'Wali Kelas',
    paperSize:'A4',marginLeftMm:20,marginRightMm:20,marginTopMm:20,
    marginBottomMm:10,signatureMode:'without-signature',
    principalPosition:'parallel',showTeacherName:true,firstPage:1
  });
  assert.equal(saved.paperSize,'A4');
  assert.equal(saved.marginBottomMm,10);
  assert.equal(saved.firstPage,1);
});
```

- [ ] **Step 2: Run focused tests and confirm missing publication module**

Run: `node --test tests/publications.test.js tests/documents.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` and missing print fields.

- [ ] **Step 3: Implement scoped publication records and print validation**

```js
export function publicationKey(session,studentId,documentType){
  assertTeacher(session);
  if(!['supplement','report','transcript'].includes(documentType)){
    throw new Error('Jenis dokumen publikasi tidak valid.');
  }
  return `${scopeKey(session)}|${studentId}|${documentType}`;
}

export function publishReport(session,studentId,documentType){
  requireStudent(session,studentId);
  const record={studentId,documentType,classId:session.classId,
    semester:session.semester,academicYear:session.academicYear,
    publishedBy:session.username||session.classId,publishedAt:new Date().toISOString()};
  updateDb(db=>{db.publishedReports[publicationKey(session,studentId,documentType)]=record;return db;});
  return clone(record);
}
```

Bound every margin to 0–50 mm and `firstPage` to integer 1–99. `getReportDocument()` exposes publication state but does not require publication for printing.

- [ ] **Step 4: Run publication, document, migration, and backup tests**

Run: `node --test tests/publications.test.js tests/documents.test.js tests/migrations.test.js tests/backup.test.js`  
Expected: PASS; teacher backups include the active-scope publication records and no unrelated class records.

- [ ] **Step 5: Commit print settings and publication state**

```bash
git add src/services/print-settings.js src/services/publications.js src/services/documents.js tests/publications.test.js tests/documents.test.js
git commit -m "feat: track published report documents"
```

### Task 9: Canonical Ledger, Supplement, and Report Printing

**Files:**
- Modify: `src/pages/print.js`
- Modify: `src/app.js`
- Modify: `src/styles/app.css`
- Modify: `tests/format-rapor-final.test.js`
- Modify: `tests/cetak-lintas-perangkat.test.js`
- Create: `tests/print-routes.test.js`

**Interfaces:**
- Produces route modes `print-ledger`, `print-supplement`, and `print-report`.
- Consumes publication service, expanded print settings, existing `getLeger()`, `getReportDocument()`, `printCurrentDocument()`, and workbook/PDF helpers.

- [ ] **Step 1: Add route and publication-control tests**

```js
test('print routes open one document mode without duplicate internal navigation',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/case 'print-ledger': return renderPrint\(session,'ledger'\)/);
  assert.match(app,/case 'print-supplement': return renderPrint\(session,'supplement'\)/);
  assert.match(app,/case 'print-report': return renderPrint\(session,'report'\)/);
});

test('report screen exposes per-student and whole-class actions',async()=>{
  const page=await readFile(new URL('../src/pages/print.js',import.meta.url),'utf8');
  assert.match(page,/Generate Rapor Kelas Ini/);
  assert.match(page,/Cetak Langsung Rapor/);
  assert.match(page,/Tampilkan pada Siswa/);
  assert.match(page,/Semua Siswa/);
});
```

- [ ] **Step 2: Run print tests and confirm missing route modes/actions**

Run: `node --test tests/print-routes.test.js tests/format-rapor-final.test.js tests/cetak-lintas-perangkat.test.js`  
Expected: FAIL for the new canonical route and publication copy.

- [ ] **Step 3: Parameterize the print page and add controls**

```js
export function renderPrint(session,initialTab='ledger'){
  const allowed=new Set(['ledger','supplement','report']);
  let tab=allowed.has(initialTab)?initialTab:'ledger';
  // Existing ledger, completeness/supplement, and report builders stay intact.
}

function publicationButton(student,documentType){
  const published=isReportPublished(scope,student.id,documentType);
  return `<button class="btn ${published?'btn-success':'btn-light'}"
    data-publish="${escapeHtml(student.id)}" data-document-type="${documentType}">
    ${published?'Ditampilkan kepada Siswa':'Tampilkan pada Siswa'}
  </button>`;
}
```

Render the full print settings grid before class selection. Apply margins through `setPrintPageSize()`. Add `Generate ... Kelas Ini` and `Cetak Langsung ...` actions that call the existing bulk sheet builder after completeness validation. Keep per-student `Buat`/PDF actions and expose publication status for supplement and report rows.

- [ ] **Step 4: Run all report, transcript, and print tests**

Run: `node --test tests/print-routes.test.js tests/format-rapor-final.test.js tests/cetak-lintas-perangkat.test.js tests/documents.test.js tests/transcript.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit canonical printing**

```bash
git add src/pages/print.js src/app.js src/styles/app.css tests/print-routes.test.js tests/format-rapor-final.test.js tests/cetak-lintas-perangkat.test.js
git commit -m "feat: complete canonical report printing flows"
```

### Task 10: Assessment and Printing Regression Gate

**Files:**
- Modify only when a failing regression points to a defect.
- Test: all `tests/*.test.js`.

**Interfaces:**
- Produces a fully testable Admin/Guru feature set independent of live Dapodik.

- [ ] **Step 1: Run all automated tests**

Run: `npm test`  
Expected: all tests PASS.

- [ ] **Step 2: Run syntax, web build, and platform metadata checks**

Run: `npm run check && npm run build && node --test tests/package.test.js tests/desktop-windows.test.js`  
Expected: every command exits 0.

- [ ] **Step 3: Verify store separation directly**

Run: `node --test tests/intracurricular.test.js tests/completeness.test.js --test-name-pattern="separate|independently"`  
Expected: PASS with one Kokurikuler record and one Intrakurikuler record in different collections.

- [ ] **Step 4: Verify canonical navigation has no repeated route**

Run: `node --test tests/navigation.test.js tests/assessment-route-contract.test.js tests/reference-routes.test.js tests/print-routes.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit regression-only corrections**

```bash
git add src tests package.json
git commit -m "test: close assessment and printing regression gaps"
```
