# Core Navigation, Schema, and Manual Students Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the application foundation to v1.2.0 with schema 5, canonical grouped menus, role-safe routes, and traceable manual student creation by Admin or assigned homeroom teacher.

**Architecture:** Keep the current localStorage database and hash router, add a pure navigation model that both the sidebar and router consume, and migrate schema 4 records in place. Student services remain the single write boundary and add origin/audit metadata without changing existing record keys.

**Tech Stack:** Vanilla ES modules, Node.js `node:test`, localStorage JSON database, Capacitor, Electron launcher, CSS.

**Spec:** `docs/superpowers/specs/2026-08-31-admin-guru-dapodik-redesign.md`

## Global Constraints

- Application version is `1.2.0`, Android `versionCode` is `12`, schema version is `5`, and build tag is `1.2.0-ADMIN-GURU-DAPODIK`.
- Existing collections, scores, users, mappings, school identity, and historical academic years must survive migration unchanged.
- The application remains offline-first with no Firebase, Supabase, or cloud synchronization.
- One feature has one canonical sidebar entry; legacy hashes redirect without duplicating the menu.
- Teachers can create or edit students only in their assigned class.
- NISN and NIS duplication checks cover all classes in the active academic year and semester while allowing historical records in another period.
- Identity remains e-Rapor SDN Satria Jaya 01.

## File Map

- `src/data/version.js`: release and schema constants.
- `src/services/storage.js`: schema 5 empty collections and database defaults.
- `src/services/migrations.js`: reversible migration 4 → 5.
- `src/data/navigation.js`: canonical grouped menu model and route aliases.
- `src/core/router.js`: role guard and alias resolution.
- `src/ui/layout.js`: grouped/collapsible sidebar renderer.
- `src/services/students.js`: student scope, uniqueness, origin, and audit fields.
- `src/pages/students.js`: manual student UI and origin badges.
- `src/styles/app.css`: group navigation, responsive drawer, and origin badge styling.
- `tests/migrations.test.js`, `tests/navigation.test.js`, `tests/router.test.js`, `tests/students.test.js`: regression and new behavior.
- `package.json`, `android/app/build.gradle`: release metadata and syntax-check coverage.

---

### Task 1: Release Metadata and Schema 5 Migration

**Files:**
- Modify: `src/data/version.js`
- Modify: `src/services/storage.js`
- Modify: `src/services/migrations.js`
- Modify: `package.json`
- Modify: `android/app/build.gradle`
- Test: `tests/migrations.test.js`
- Test: `tests/package.test.js`

**Interfaces:**
- Consumes: existing `runAppMigrations()`, `loadDb()`, and `storageKey()`.
- Produces: `APP_SCHEMA_VERSION === 5`, `APP_MIGRATIONS[4]`, and six schema 5 object collections.

- [x] **Step 1: Update migration tests to require schema 5 and data preservation**

```js
test('release v1.2.0 uses versionCode 12 and schema 5',()=>{
  assert.equal(APP_VERSION,'1.2.0');
  assert.equal(VERSION_CODE,12);
  assert.equal(APP_SCHEMA_VERSION,5);
  assert.equal(BUILD_TAG,'1.2.0-ADMIN-GURU-DAPODIK');
});

test('migration 4 to 5 adds new collections without changing old records',()=>{
  useMemoryStorage();
  const before=loadDb();
  before.appSchemaVersion=4;
  before.students['2026/2027|Ganjil 2026/2027|5B|student-old']={
    id:'student-old',classId:'5B',nis:'5001',nisn:'0012345678',name:'Siswa Lama'
  };
  before.reportScores['old-score']={studentId:'student-old',finalScore:88};
  localStorage.setItem(storageKey(),JSON.stringify(before));

  runAppMigrations();
  const after=JSON.parse(localStorage.getItem(storageKey()));
  assert.equal(after.appSchemaVersion,5);
  assert.equal(after.students['2026/2027|Ganjil 2026/2027|5B|student-old'].name,'Siswa Lama');
  assert.deepEqual(after.reportScores,before.reportScores);
  for(const key of ['intracurricularActivities','intracurricularScores','dapodikSyncState','dapodikSyncLogs','dapodikMappings','publishedReports']){
    assert.deepEqual(after[key],{});
  }
});
```

- [x] **Step 2: Run the migration tests and confirm the expected failure**

Run: `node --test tests/migrations.test.js`  
Expected: FAIL because the current release reports `1.1.7` and schema `4`.

- [x] **Step 3: Add the schema 5 migration and release constants**

```js
// src/data/version.js
export const APP_VERSION='1.2.0';
export const VERSION_CODE=12;
export const APP_SCHEMA_VERSION=5;
export const BUILD_TAG='1.2.0-ADMIN-GURU-DAPODIK';
export const PREVIOUS_RELEASE=Object.freeze({version:'1.1.7',versionCode:11});

// src/services/migrations.js
function migrate4To5(db){
  const next=clone(db);
  for(const collection of [
    'intracurricularActivities','intracurricularScores','dapodikSyncState',
    'dapodikSyncLogs','dapodikMappings','publishedReports'
  ]){
    if(!isObject(next[collection]))next[collection]={};
  }
  next.appSchemaVersion=5;
  return next;
}
export const APP_MIGRATIONS=Object.freeze({
  1:migrate1To2,2:migrate2To3,3:migrate3To4,4:migrate4To5
});
```

Also add the six collections to `baseDb()`, `REQUIRED_OBJECT_COLLECTIONS`, and `PRESERVED_COLLECTIONS`; update `package.json`, Android version defaults, and existing release assertions to `1.2.0/12/5`.

- [x] **Step 4: Run migration and package tests**

Run: `node --test tests/migrations.test.js tests/package.test.js`  
Expected: PASS, including rollback and preservation tests.

- [x] **Step 5: Commit the release foundation**

```bash
git add src/data/version.js src/services/storage.js src/services/migrations.js package.json android/app/build.gradle tests/migrations.test.js tests/package.test.js
git commit -m "feat: migrate local data safely to schema 5"
```

### Task 2: Canonical Grouped Navigation Model

**Files:**
- Create: `src/data/navigation.js`
- Modify: `src/data/constants.js`
- Create: `tests/navigation.test.js`

**Interfaces:**
- Produces:
  - `navigationForRole(role): NavigationGroup[]`
  - `flattenNavigation(role): NavigationItem[]`
  - `NavigationGroup = {id,label,icon,children:NavigationItem[]}`
  - `NavigationItem = {id,label,icon,route}`
- Consumes: no DOM and no session data.

- [x] **Step 1: Write tests for unique routes, required ordering, and removed teacher duplicates**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenNavigation, navigationForRole } from '../src/data/navigation.js';

test('teacher Input Kelengkapan children use the approved order',()=>{
  const group=navigationForRole('teacher').find(item=>item.id==='completeness');
  assert.deepEqual(group.children.map(item=>item.label),[
    'Update Data Siswa','Input Kehadiran','Input Nilai Ekskul',
    'Input Nilai Kokurikuler','Input Nilai Intrakurikuler',
    'Input Catatan Wali Kelas','Input Kenaikan Kelas'
  ]);
});

test('each role has one canonical menu entry per route',()=>{
  for(const role of ['admin','teacher']){
    const routes=flattenNavigation(role).map(item=>item.route);
    assert.equal(new Set(routes).size,routes.length);
  }
});

test('teacher menu has no separate Mapping or Dimensi entry',()=>{
  const labels=flattenNavigation('teacher').map(item=>item.label);
  assert.equal(labels.includes('Mapping Mata Pelajaran'),false);
  assert.equal(labels.includes('Dimensi Penilaian'),false);
});
```

- [x] **Step 2: Run the navigation test and confirm the missing-module failure**

Run: `node --test tests/navigation.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/data/navigation.js`.

- [x] **Step 3: Implement the pure navigation model**

```js
export const NAVIGATION=Object.freeze({
  admin:[
    group('main','UTAMA','grid',[
      item('dashboard','Dashboard','grid','dashboard'),
      item('profile','Profil','user','profile')
    ]),
    group('dapodik','Dapodik','database',[
      item('dapodik-service','Web Service Dapodik','settings','dapodik-service'),
      item('dapodik-pull','Ambil Data Dapodik','download','dapodik-pull'),
      item('dapodik-push','Kirim Nilai ke Dapodik','upload','dapodik-push')
    ]),
    group('users','DATA PENGGUNA','users',[
      item('users','Data Pengguna','users','users')
    ]),
    group('reference','Data Referensi','database',[
      item('reference-school','Data Sekolah','school','reference-school'),
      item('reference-teachers','Data Guru','users','reference-teachers'),
      item('reference-students','Data Siswa','users','reference-students'),
      item('reference-classes','Data Kelas/Rombel','grid','reference-classes'),
      item('reference-subjects','Mata Pelajaran','book','reference-subjects'),
      item('reference-learning','Pembelajaran','target','reference-learning'),
      item('reference-mapping','Mapping Mata Pelajaran','shuffle','reference-mapping'),
      item('reference-branding','Logo dan Tanda Tangan','image','reference-branding'),
      item('reference-report-date','Tanggal Rapor','calendar','reference-report-date')
    ]),
    group('activities','KEGIATAN','activity',[
      item('cocurricular','Data Kokurikuler','activity','cocurricular'),
      item('intracurricular','Data Intrakurikuler','activity','intracurricular')
    ]),
    group('admin-assessment','Status Penilaian','check',[
      item('assessment-status','Status Penilaian','check','assessment-status'),
      item('assessment-statistics','Statistik Nilai','chart','assessment-statistics')
    ]),
    group('admin-progress','Perkembangan Nilai','chart',[
      item('admin-progress','Perkembangan Nilai','chart','admin-progress'),
      item('admin-progress-graph','Grafik Nilai','chart','admin-progress-graph')
    ]),
    group('admin-transcript','Transkrip Ijazah','file',[
      item('transcript-number-import','Import Nomor Ijazah','upload','transcript-number-import'),
      item('transcript-settings','Setting Transkrip','settings','transcript-settings'),
      item('transcript-mapping','Mapping Mapel','shuffle','transcript-mapping'),
      item('transcript-input','Input Nilai Transkrip','edit','transcript-input'),
      item('transcript-import','Import Nilai Transkrip','upload','transcript-import'),
      item('transcript-print','Cetak Transkrip Nilai','printer','transcript-print')
    ]),
    group('admin-print','Cetak Nilai','printer',[
      item('print-ledger','Leger Rapor','file','print-ledger'),
      item('print-supplement','Pelengkap Rapor','file','print-supplement'),
      item('print-report','Nilai Rapor','printer','print-report')
    ]),
    group('admin-backup','BACKUP','database',[
      item('backup','Backup & Restore','database','backup')
    ]),
    group('admin-account','AKUN','settings',[
      item('account-settings','Pengaturan Akun','settings','account-settings')
    ])
  ],
  teacher:[
    group('main','UTAMA','grid',[
      item('dashboard','Dashboard','grid','dashboard'),
      item('profile','Profil','user','profile'),
      item('objectives','Tujuan Pembelajaran','target','objectives')
    ]),
    group('report-input','Input Nilai Rapor','clipboard',[
      item('report-input-form','Input Nilai Rapor','edit','report-input'),
      item('report-import','Import Nilai Rapor','upload','report-import')
    ]),
    group('saved','Nilai Tersimpan','save',[
      item('saved-scores','Cek Nilai Rapor','check','saved-scores'),
      item('saved-descriptions','Cek Deskripsi Rapor','check','saved-descriptions')
    ]),
    group('teacher-assessment','Cek Penilaian','check',[
      item('teacher-status','Status Penilaian','check','teacher-status'),
      item('teacher-achievement','Capaian Nilai Rapor','chart','teacher-achievement'),
      item('teacher-score-graph','Grafik Nilai Rapor','chart','teacher-score-graph')
    ]),
    group('completeness','Input Kelengkapan','list',[
      item('student-update','Update Data Siswa','users','student-update'),
      item('attendance','Input Kehadiran','calendar','attendance'),
      item('extra-input','Input Nilai Ekskul','activity','extra-input'),
      item('cocurricular-input','Input Nilai Kokurikuler','activity','cocurricular-input'),
      item('intracurricular-input','Input Nilai Intrakurikuler','activity','intracurricular-input'),
      item('homeroom-note','Input Catatan Wali Kelas','edit','homeroom-note'),
      item('promotion-input','Input Kenaikan Kelas','check','promotion-input')
    ]),
    group('class-check','Cek Penilaian Kelas','check-circle',[
      item('class-status','Status Penilaian','check','class-status'),
      item('class-statistics','Statistik Nilai Rapor','chart','class-statistics')
    ]),
    group('teacher-progress','Perkembangan Nilai','chart',[
      item('student-progress','Perkembangan Nilai','chart','student-progress'),
      item('student-progress-graph','Grafik Nilai Rapor','chart','student-progress-graph')
    ]),
    group('teacher-transcript','Transkrip Ijazah','file',[
      item('transcript-input','Input Nilai Transkrip','edit','transcript-input'),
      item('transcript-import','Import Nilai Transkrip','upload','transcript-import'),
      item('transcript-print','Cetak Transkrip Nilai','printer','transcript-print')
    ]),
    group('teacher-print','Cetak Nilai','printer',[
      item('print-ledger','Leger Rapor','file','print-ledger'),
      item('print-supplement','Pelengkap Rapor','file','print-supplement'),
      item('print-report','Nilai Rapor','printer','print-report')
    ]),
    group('teacher-backup','BACKUP','database',[
      item('backup','Backup','database','backup')
    ]),
    group('teacher-account','AKUN','settings',[
      item('account-settings','Pengaturan Akun','settings','account-settings')
    ])
  ]
});

function item(id,label,icon,route){return Object.freeze({id,label,icon,route});}
function group(id,label,icon,children){return Object.freeze({id,label,icon,children:Object.freeze(children)});}
export function navigationForRole(role){return (NAVIGATION[role]||[]).map(group=>({...group,children:group.children.map(item=>({...item}))}));}
export function flattenNavigation(role){return navigationForRole(role).flatMap(group=>group.children);}
```

Move menu ownership out of `constants.js`. Export compatibility constants from `constants.js` by mapping the complete model above so existing imports remain valid during the transition.

- [x] **Step 4: Run navigation tests**

Run: `node --test tests/navigation.test.js`  
Expected: PASS with unique Admin and Teacher routes and exact completeness order.

- [x] **Step 5: Commit the navigation model**

```bash
git add src/data/navigation.js src/data/constants.js tests/navigation.test.js
git commit -m "feat: define canonical grouped menus"
```

### Task 3: Role-Safe Routes and Legacy Redirects

**Files:**
- Modify: `src/core/router.js`
- Modify: `src/app.js`
- Modify: `tests/router.test.js`

**Interfaces:**
- Consumes: `flattenNavigation(role)` and `canonicalRoute(route, role)`.
- Produces:
  - `resolveRoute(route, session): string`
  - `canAccessRoute(route, role): boolean`
  - legacy route aliases that never bypass role checks.

- [x] **Step 1: Add route alias and role-guard tests**

```js
test('legacy teacher routes resolve to the canonical grouped destinations',()=>{
  assert.equal(resolveRoute('students',{role:'teacher',classId:'5B'}),'student-update');
  assert.equal(resolveRoute('completeness-input',{role:'teacher',classId:'5B'}),'student-update');
  assert.equal(resolveRoute('subject-mapping',{role:'teacher',classId:'5B'}),'dashboard');
  assert.equal(resolveRoute('attitudes',{role:'teacher',classId:'5B'}),'dashboard');
});

test('teacher cannot open Dapodik or Admin activity routes',()=>{
  assert.equal(canAccessRoute('dapodik-service','teacher'),false);
  assert.equal(canAccessRoute('intracurricular','teacher'),false);
  assert.equal(resolveRoute('dapodik-pull',{role:'teacher'}),'dashboard');
});
```

- [x] **Step 2: Run router tests and confirm aliases fail**

Run: `node --test tests/router.test.js`  
Expected: FAIL because `students` and `completeness-input` do not yet resolve to `student-update`.

- [x] **Step 3: Derive allowed routes from navigation and apply aliases before authorization**

```js
const LEGACY_ALIASES=Object.freeze({
  teacher:Object.freeze({
    students:'student-update',
    'completeness-input':'student-update',
    assessment:'report-input',
    print:'print-report'
  }),
  admin:Object.freeze({
    reference:'reference-school',
    settings:'backup'
  })
});

function canonicalForRole(route,role){
  return LEGACY_ALIASES[role]?.[cleanRoute(route)]||cleanRoute(route);
}

export function canAccessRoute(route,role){
  const requested=canonicalForRole(route,role);
  return new Set(flattenNavigation(role).map(item=>item.route)).has(requested);
}
```

Update `resolveRoute()` to return the canonical route and update `pageFor()` with explicit cases for the routes delivered in later plans. Until those pages land, render the existing equivalent page; do not use a role-unsafe generic fallback.

- [x] **Step 4: Run router and navigation tests**

Run: `node --test tests/router.test.js tests/navigation.test.js`  
Expected: PASS.

- [x] **Step 5: Commit route canonicalization**

```bash
git add src/core/router.js src/app.js tests/router.test.js
git commit -m "feat: guard canonical routes by role"
```

### Task 4: Collapsible Sidebar Rendering

**Files:**
- Modify: `src/ui/layout.js`
- Modify: `src/styles/app.css`
- Create: `tests/layout-navigation.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `navigationForRole(session.role)`.
- Produces: semantic group buttons with `aria-expanded`, child navigation buttons, active ancestor expansion, and per-user local state key `erapor:nav-groups:<role>:<username-or-class>`.

- [x] **Step 1: Add source-level regression tests for semantic group controls**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('layout renders grouped controls with accessible expansion state',async()=>{
  const source=await readFile(new URL('../src/ui/layout.js',import.meta.url),'utf8');
  assert.match(source,/navigationForRole/);
  assert.match(source,/aria-expanded/);
  assert.match(source,/data-nav-group/);
  assert.match(source,/active-ancestor/);
});
```

- [x] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/layout-navigation.test.js`  
Expected: FAIL because the current layout renders a flat tuple array.

- [x] **Step 3: Render groups and persist their open state**

```js
function groupStateKey(session){
  return `erapor:nav-groups:${session.role}:${session.username||session.classId||'admin'}`;
}

function groupMarkup(group,route,open){
  const active=group.children.some(item=>item.route===route);
  return `<section class="nav-group ${active?'active-ancestor':''}" data-nav-group="${escapeHtml(group.id)}">
    <button class="nav-group-toggle" aria-expanded="${open||active}" data-group-toggle>
      ${group.icon?icon(group.icon,18):''}<span>${escapeHtml(group.label)}</span>
      ${group.children.length>1?icon('chevron-down',15):''}
    </button>
    <div class="nav-children" ${open||active?'':'hidden'} data-group-children></div>
  </section>`;
}
```

For one-child groups, clicking the group navigates directly. For multi-child groups, clicking toggles only that group. On mobile, selecting a child closes the drawer. Add CSS for indentation, active child, focus-visible, `hidden`, 44 px touch targets, and drawer scrolling.

- [x] **Step 4: Run focused tests and syntax checks**

Run: `node --test tests/layout-navigation.test.js tests/navigation.test.js tests/router.test.js && npm run check`  
Expected: PASS.

- [x] **Step 5: Commit the grouped sidebar**

```bash
git add src/ui/layout.js src/styles/app.css tests/layout-navigation.test.js package.json
git commit -m "feat: render accessible grouped sidebar"
```

### Task 5: Student Origin, Audit Metadata, and Period-Wide Deduplication

**Files:**
- Modify: `src/services/students.js`
- Modify: `tests/students.test.js`

**Interfaces:**
- Keeps: `createStudent(session, input)` and `updateStudent(session, id, input)`.
- Produces student fields `origin`, `createdBy`, `createdAt`, `updatedAt`, `syncState`, `isActive`, and optional `dapodikId`.
- Produces: `studentOriginLabel(student): string`.

- [x] **Step 1: Add tests for origin, class ownership, and cross-class active-period duplicates**

```js
test('teacher-created student is audited and remains in assigned class',()=>{
  useMemoryStorage();
  const created=createStudent({...teacher5b,username:'guru5b'},studentInput({classId:'5C'}));
  assert.equal(created.classId,'5B');
  assert.equal(created.origin,'manual-teacher');
  assert.equal(created.createdBy,'guru5b');
  assert.equal(created.syncState,'local');
  assert.equal(created.isActive,true);
  assert.match(created.createdAt,/^\d{4}-\d{2}-\d{2}T/);
});

test('admin-created student uses manual-admin origin',()=>{
  useMemoryStorage();
  const created=createStudent({...admin,username:'admin'},studentInput());
  assert.equal(created.origin,'manual-admin');
});

test('NISN cannot be duplicated across classes in the active period',()=>{
  useMemoryStorage();
  createStudent(teacher5b,studentInput());
  assert.throws(
    ()=>createStudent(teacher5c,studentInput({classId:'5C',nis:'5999'})),
    /NISN .* sudah digunakan/
  );
});
```

- [x] **Step 2: Run student tests and confirm metadata assertions fail**

Run: `node --test tests/students.test.js`  
Expected: FAIL because new records do not have origin/audit fields and duplicate validation is class-scoped.

- [x] **Step 3: Add period-wide lookup and origin normalization**

```js
function actorId(session){
  return String(session.username||session.userId||session.classId||session.role);
}

function originForSession(session){
  return session.role==='admin'?'manual-admin':'manual-teacher';
}

function auditNewStudent(session,student,now=new Date()){
  const timestamp=now.toISOString();
  return {...student,origin:originForSession(session),createdBy:actorId(session),
    createdAt:timestamp,updatedAt:timestamp,syncState:'local',isActive:true};
}

function activePeriodRecords(db,session){
  return Object.values(db.students||{}).filter(student=>
    student.academicYear===session.academicYear &&
    student.semester===session.semester &&
    student.isActive!==false
  );
}
```

Ensure old students loaded without metadata are treated as active and labeled `Data Lama`; do not rewrite them until edited or migrated by Dapodik. Preserve `origin:'dapodik'` and `dapodikId` during edits.

- [x] **Step 4: Run student and migration tests**

Run: `node --test tests/students.test.js tests/migrations.test.js`  
Expected: PASS with historical data preserved.

- [x] **Step 5: Commit student audit behavior**

```bash
git add src/services/students.js tests/students.test.js
git commit -m "feat: audit manual student creation"
```

### Task 6: Update Data Siswa UI for Admin and Homeroom Teachers

**Files:**
- Modify: `src/pages/students.js`
- Modify: `src/app.js`
- Modify: `src/styles/app.css`
- Create: `tests/student-update-ui.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `studentOriginLabel(student)`, existing student CRUD, and canonical route `student-update`.
- Produces: `renderStudentUpdate(session)` as an alias/wrapper around the existing student management renderer with role-specific heading and fixed teacher class.

- [x] **Step 1: Add UI contract tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('student page exposes manual origin and teacher class restrictions',async()=>{
  const source=await readFile(new URL('../src/pages/students.js',import.meta.url),'utf8');
  assert.match(source,/Input Manual Guru/);
  assert.match(source,/Input Manual Admin/);
  assert.match(source,/session\.classId/);
  assert.match(source,/student-origin/);
});

test('student-update route renders the student management page',async()=>{
  const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(source,/case 'student-update'/);
  assert.match(source,/renderStudents\(session\)/);
});
```

- [x] **Step 2: Run the UI contract test and confirm it fails**

Run: `node --test tests/student-update-ui.test.js`  
Expected: FAIL because origin labels and the canonical route are not wired.

- [x] **Step 3: Add origin badges and role-specific copy**

```js
function originBadge(student){
  const labels={
    'manual-teacher':'Input Manual Guru',
    'manual-admin':'Input Manual Admin',
    dapodik:'Dapodik'
  };
  return `<span class="badge student-origin origin-${escapeHtml(student.origin||'legacy')}">
    ${escapeHtml(labels[student.origin]||'Data Lama')}
  </span>`;
}
```

Add an `Asal Data` column on desktop and badge on mobile cards. For teachers, hide class controls and always submit `session.classId`. For Admin, keep the class selector. Replace destructive copy `Hapus` with `Nonaktifkan` for Dapodik-origin students while preserving hard delete for records that have no dependent data.

- [x] **Step 4: Run student UI, service, router, and syntax checks**

Run: `node --test tests/student-update-ui.test.js tests/students.test.js tests/router.test.js && npm run check`  
Expected: PASS.

- [x] **Step 5: Commit the student update experience**

```bash
git add src/pages/students.js src/app.js src/styles/app.css tests/student-update-ui.test.js package.json
git commit -m "feat: let homeroom teachers add traced students"
```

### Task 7: Foundation Regression Gate

**Files:**
- Modify only if a failing regression identifies a foundation defect.
- Test: all `tests/*.test.js`.

**Interfaces:**
- Consumes all deliverables from Tasks 1–6.
- Produces a stable schema/navigation/student foundation for the next two implementation plans.

- [x] **Step 1: Run the entire automated test suite**

Run: `npm test`  
Expected: all tests PASS; no existing report, backup, print, or Windows tests regress.

- [x] **Step 2: Run syntax and web build checks**

Run: `npm run check && npm run build`  
Expected: both commands exit 0 and `dist/` is generated.

- [x] **Step 3: Verify the migration rollback fixture manually**

Run: `node --test tests/migrations.test.js --test-name-pattern="failure"`  
Expected: PASS and the raw pre-migration database remains byte-for-byte identical after the simulated failure.

- [x] **Step 4: Review the branch diff for data deletion and duplicate menu entries**

Run: `git diff main...HEAD -- src/services/storage.js src/services/migrations.js src/data/navigation.js src/ui/layout.js src/services/students.js`  
Expected: no removal of legacy collections and no repeated canonical route within either role menu.

- [x] **Step 5: Commit any regression-only corrections**

```bash
git add src tests package.json android/app/build.gradle
git commit -m "test: close foundation regression gaps"
```

---

## Catatan Verifikasi Task 7 (Foundation Regression Gate)

Dijalankan pada commit lanjutan dari checkpoint `d68fa51`.

- `npm test`: 441 tes, 441 lulus, 0 gagal.
- `npm run check`: keluar 0.
- `npm run build`: keluar 0, `dist/` terbentuk.
- `node --test tests/migrations.test.js --test-name-pattern="failure"`: 13 tes lulus, termasuk
  "migration failure mengembalikan snapshot database lama persis tanpa reset data".
- Review diff `main...HEAD`: perubahan `storage.js` dan `migrations.js` hanya menambah enam koleksi
  schema 5 (`intracurricularActivities`, `intracurricularScores`, `dapodikSyncState`,
  `dapodikSyncLogs`, `dapodikMappings`, `publishedReports`); tidak ada koleksi lama yang dihapus.
- Route kanonik unik: 32 entri menu Admin dan 29 entri menu Guru tanpa route ganda, dan seluruh
  route menu memiliki penanganan halaman di `src/app.js`.

Lima kegagalan yang terlihat pada pemeriksaan awal berasal dari artefak build yang memang tidak
disimpan di repository (`dist/`, `android/app/src/main/assets/public/`, `ios/App/App/public/`).
Setelah `npm run build` dan `npx cap copy android|ios` dijalankan, seluruh tes lulus. Tidak ada
koreksi kode yang diperlukan pada Task 7.
