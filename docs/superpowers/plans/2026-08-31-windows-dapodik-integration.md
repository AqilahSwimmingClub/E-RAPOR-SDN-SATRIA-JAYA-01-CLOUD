# Windows Dapodik Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a functional, preview-first Dapodik integration on the Windows launcher while keeping Web/PWA and Android safe and informative.

**Architecture:** The Windows application continues to open the UI in the default browser through Electron's loopback server. A protected same-origin HTTP bridge in the Electron main process stores the bearer token with `safeStorage`, talks to the local/private Dapodik host, and returns normalized payloads; pure browser-side services preview and apply changes to the local database.

**Tech Stack:** Electron 43 CommonJS main process, Node.js HTTP/DNS/crypto, Vanilla ES modules, localStorage JSON database, Node.js `node:test`, mock HTTP servers.

**Spec:** `docs/superpowers/specs/2026-08-31-admin-guru-dapodik-redesign.md`

## Global Constraints

- This plan starts only after the core and assessment plans pass their regression gates.
- Dapodik configuration and execution are Admin-only.
- The Dapodik bearer token must never enter localStorage, backups, application logs, error text, or returned configuration responses.
- The bridge accepts requests only on the e-Rapor loopback origin and requires an unpredictable per-launch header token.
- Dapodik target URLs are limited to loopback or resolved private-network addresses over HTTP/HTTPS.
- Pull operations always return a preview; browser data changes only after explicit Admin confirmation.
- Manual students are never deleted because they are absent from Dapodik.
- Unsupported payload shapes, different NPSN, or different semester stop before local mutation.
- Web/PWA and Android show the Dapodik menu with instructions to use Windows and never attempt Dapodik network requests.
- Live production verification is a separate controlled school-computer checklist after all mock tests pass.

## File Map

- `electron/dapodik-config.cjs`: encrypted token and non-secret config persistence.
- `electron/dapodik-client.cjs`: private-host validation, HTTP calls, endpoint profile, timeout, and redacted errors.
- `electron/dapodik-bridge.cjs`: same-origin bridge request authentication and handlers.
- `electron/main.cjs`: bridge routing and per-launch token injection into `index.html`.
- `src/services/dapodik-adapter.js`: response normalization and payload validation.
- `src/services/dapodik-sync.js`: preview, conflict policy, apply transaction, logs, and send queue state.
- `src/services/dapodik-bridge.js`: browser bridge discovery and fetch wrapper.
- `src/pages/dapodik.js`: Admin connection, pull preview, push status, and non-Windows notice.
- `src/app.js`, `src/data/navigation.js`, `src/styles/app.css`, `package.json`: route wiring, menu, responsive UI, and checks.
- `docs/operator/dapodik-windows.md`: operator and live verification instructions.
- `tests/dapodik-*.test.js`, `tests/desktop-windows.test.js`: pure, bridge, UI, and platform regression tests.

---

### Task 1: Dapodik Response Adapter

**Files:**
- Create: `src/services/dapodik-adapter.js`
- Create: `tests/dapodik-adapter.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `normalizeDapodikEnvelope(payload): unknown[]`
  - `normalizeSchool(payload): DapodikSchool`
  - `normalizeDapodikDataset(payload): DapodikDataset`
  - `validateSchoolContext(school, expected): true`
  - `DapodikDataset = {school,teachers,students,classes,subjects,lessons}`
- Does not read or write localStorage.

- [ ] **Step 1: Write adapter tests for supported and rejected payload shapes**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDapodikEnvelope,normalizeDapodikDataset,validateSchoolContext
} from '../src/services/dapodik-adapter.js';

test('adapter unwraps common Dapodik envelopes without losing rows',()=>{
  assert.deepEqual(normalizeDapodikEnvelope([{id:1}]),[{id:1}]);
  assert.deepEqual(normalizeDapodikEnvelope({rows:[{id:2}]}),[{id:2}]);
  assert.deepEqual(normalizeDapodikEnvelope({data:[{id:3}]}),[{id:3}]);
  assert.deepEqual(normalizeDapodikEnvelope({result:{rows:[{id:4}]}}),[{id:4}]);
});

test('adapter normalizes school and student identifiers',()=>{
  const data=normalizeDapodikDataset({
    school:{data:[{npsn:'20218098',nama:'SDN SATRIA JAYA 01',semester_id:'20262'}]},
    students:{rows:[{peserta_didik_id:'pd-1',nisn:'0012345678',nis:'5001',nama:'Alya',jenis_kelamin:'P',rombongan_belajar_id:'rombel-5b'}]},
    teachers:[],classes:[],subjects:[],lessons:[]
  });
  assert.equal(data.school.npsn,'20218098');
  assert.equal(data.students[0].dapodikId,'pd-1');
  assert.equal(data.students[0].name,'Alya');
});

test('unknown envelope and mismatched context stop synchronization',()=>{
  assert.throws(()=>normalizeDapodikEnvelope({unexpected:true}),/Format respons Dapodik tidak didukung/);
  assert.throws(()=>validateSchoolContext(
    {npsn:'99999999',semesterId:'20262'},
    {npsn:'20218098',semesterId:'20262'}
  ),/NPSN Dapodik berbeda/);
});
```

- [ ] **Step 2: Run the adapter test and confirm the missing-module failure**

Run: `node --test tests/dapodik-adapter.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement strict normalization**

```js
export function normalizeDapodikEnvelope(payload){
  if(Array.isArray(payload))return payload;
  for(const key of ['rows','data','results']){
    if(Array.isArray(payload?.[key]))return payload[key];
  }
  if(payload?.result)return normalizeDapodikEnvelope(payload.result);
  throw new Error('Format respons Dapodik tidak didukung.');
}

function normalizeStudent(row){
  return {
    dapodikId:clean(row.peserta_didik_id||row.id),
    nisn:digits(row.nisn),
    nis:clean(row.nis),
    name:clean(row.nama||row.name),
    gender:clean(row.jenis_kelamin||row.gender).toUpperCase(),
    classDapodikId:clean(row.rombongan_belajar_id||row.rombel_id),
    isActive:row.soft_delete!==1&&row.soft_delete!=='1'
  };
}
```

Define explicit field maps for school, teachers, classes, subjects, and lessons. Validate required IDs, reject duplicate Dapodik IDs, and retain only normalized values needed by this application.

- [ ] **Step 4: Run adapter and syntax tests**

Run: `node --test tests/dapodik-adapter.test.js && npm run check`  
Expected: PASS.

- [ ] **Step 5: Commit the adapter**

```bash
git add src/services/dapodik-adapter.js tests/dapodik-adapter.test.js package.json
git commit -m "feat: normalize supported Dapodik payloads"
```

### Task 2: Pull Preview and Conflict Policy

**Files:**
- Create: `src/services/dapodik-sync.js`
- Create: `tests/dapodik-sync.test.js`

**Interfaces:**
- Produces:
  - `buildDapodikPreview(session, dataset): DapodikPreview`
  - `applyDapodikPreview(session, preview, selection): ApplyResult`
  - `DapodikPreview = {previewId,context,students,teachers,classes,subjects,lessons,counts,createdAt}`
  - each preview student action is `create`, `update`, `unchanged`, `archive`, or `conflict`
- Consumes normalized data from Task 1 and schema 5 sync collections.

- [ ] **Step 1: Write preview tests for ID/NISN matching and manual preservation**

```js
test('preview matches Dapodik ID first and NISN second',()=>{
  useMemoryStorage();
  seedStudent({id:'local-1',dapodikId:'pd-1',nisn:'0012345678',name:'Nama Lama',origin:'dapodik',classId:'5B'});
  const preview=buildDapodikPreview(admin,dataset({
    students:[{dapodikId:'pd-1',nisn:'0099999999',name:'Nama Baru',classDapodikId:'rombel-5b'}]
  }));
  assert.equal(preview.students[0].action,'update');
  assert.equal(preview.students[0].localId,'local-1');
});

test('manual student absent from Dapodik is never archived',()=>{
  useMemoryStorage();
  seedStudent({id:'manual-1',nisn:'0012345678',name:'Siswa Manual',origin:'manual-teacher',classId:'5B'});
  const preview=buildDapodikPreview(admin,dataset({students:[]}));
  assert.equal(preview.students.some(item=>item.localId==='manual-1'&&item.action==='archive'),false);
});

test('duplicate NISN with incompatible Dapodik identity becomes a conflict',()=>{
  useMemoryStorage();
  seedStudent({id:'manual-1',nisn:'0012345678',name:'Siswa Manual',origin:'manual-teacher',classId:'5B'});
  const preview=buildDapodikPreview(admin,dataset({
    students:[{dapodikId:'pd-2',nisn:'0012345678',name:'Nama Berbeda',classDapodikId:'rombel-5c'}]
  }));
  assert.equal(preview.students[0].action,'conflict');
});
```

- [ ] **Step 2: Run the sync test and confirm the missing-module failure**

Run: `node --test tests/dapodik-sync.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement deterministic preview matching**

```js
function matchStudent(remote,localStudents){
  const byId=remote.dapodikId&&localStudents.find(item=>item.dapodikId===remote.dapodikId);
  if(byId)return {kind:'dapodik-id',student:byId};
  const byNisn=remote.nisn&&localStudents.filter(item=>normalizeNisn(item.nisn)===remote.nisn);
  if(byNisn.length===1)return {kind:'nisn',student:byNisn[0]};
  if(byNisn.length>1)return {kind:'conflict',candidates:byNisn};
  return {kind:'none'};
}
```

Resolve remote class IDs through the preview class mapping. Mark imported local records absent remotely as `archive`; never mark `manual-admin`, `manual-teacher`, or legacy records as `archive`. Generate `previewId` and immutable action records so the apply step cannot silently recalculate a different preview.

- [ ] **Step 4: Run sync and student tests**

Run: `node --test tests/dapodik-sync.test.js tests/students.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit preview logic**

```bash
git add src/services/dapodik-sync.js tests/dapodik-sync.test.js
git commit -m "feat: preview Dapodik merges without data loss"
```

### Task 3: Transactional Preview Application and Safe Logs

**Files:**
- Modify: `src/services/dapodik-sync.js`
- Modify: `tests/dapodik-sync.test.js`
- Modify: `src/services/backup.js`
- Modify: `tests/backup.test.js`

**Interfaces:**
- Produces:
  - `applyDapodikPreview(session, preview, {acceptedActionIds}): ApplyResult`
  - `listDapodikSyncLogs(session): DapodikSyncLog[]`
  - `DapodikSyncLog = {id,operation,status,counts,startedAt,finishedAt,actor}`
- Logs contain counts and safe messages only; no token, NISN, names, addresses, or raw payloads.

- [ ] **Step 1: Add atomic-apply and redaction tests**

```js
test('apply creates a safety snapshot and writes only accepted non-conflict actions',()=>{
  useMemoryStorage();
  const preview=buildDapodikPreview(admin,dataset({
    students:[{dapodikId:'pd-1',nisn:'0012345678',name:'Alya',classDapodikId:'rombel-5b'}]
  }));
  const result=applyDapodikPreview(admin,preview,{
    acceptedActionIds:preview.students.filter(item=>item.action==='create').map(item=>item.id)
  });
  assert.equal(result.created.students,1);
  const saved=Object.values(loadDb().students).find(item=>item.dapodikId==='pd-1');
  assert.equal(saved.origin,'dapodik');
  assert.equal(saved.syncState,'synced');
});

test('sync logs contain counts but no personal identifiers',()=>{
  const text=JSON.stringify(listDapodikSyncLogs(admin));
  assert.doesNotMatch(text,/0012345678|Alya|Bearer|token/i);
  assert.match(text,/"students":1/);
});
```

- [ ] **Step 2: Run the focused test and confirm apply/log failures**

Run: `node --test tests/dapodik-sync.test.js`  
Expected: FAIL because transactional apply and logs are incomplete.

- [ ] **Step 3: Implement clone-validate-save application**

```js
export function applyDapodikPreview(session,preview,{acceptedActionIds}){
  assertAdmin(session);
  validatePreviewContext(session,preview);
  const accepted=new Set(acceptedActionIds);
  if(preview.students.some(item=>accepted.has(item.id)&&item.action==='conflict')){
    throw new Error('Konflik Dapodik harus diselesaikan sebelum penerapan.');
  }
  const before=exportDb();
  try{
    const result=applyAcceptedActions(clone(before),preview,accepted);
    validateMigratedDatabase(result.database,{expectedSchemaVersion:5,before});
    replaceDb(result.database);
    appendSafeLog('pull','SUCCESS',result.counts,session);
    return result.summary;
  }catch(error){
    replaceDb(before);
    appendSafeLog('pull','ROLLED_BACK',emptyCounts(),session);
    throw new Error('Sinkronisasi dibatalkan dan data lama dipulihkan.');
  }
}
```

Exclude `dapodikSyncState`, `dapodikSyncLogs`, and `dapodikMappings` from Teacher backups unless they belong to the active class and contain no raw remote payload. Never include desktop token/config secrets because they are outside the database.

- [ ] **Step 4: Run sync, migration, and backup tests**

Run: `node --test tests/dapodik-sync.test.js tests/migrations.test.js tests/backup.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit transactional apply**

```bash
git add src/services/dapodik-sync.js src/services/backup.js tests/dapodik-sync.test.js tests/backup.test.js
git commit -m "feat: apply Dapodik previews transactionally"
```

### Task 4: Encrypted Windows Configuration Store

**Files:**
- Create: `electron/dapodik-config.cjs`
- Create: `tests/dapodik-config.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces factory:
  - `createDapodikConfigStore({safeStorage,fs,path,userDataPath}): ConfigStore`
  - `ConfigStore.save({baseUrl,npsn,semesterId,token}): PublicConfig`
  - `ConfigStore.loadPublic(): PublicConfig`
  - `ConfigStore.loadWithToken(): PrivateConfig`
  - `ConfigStore.clear(): void`
- Public config never contains `token`.

- [ ] **Step 1: Write dependency-injected encryption tests**

```js
test('config encrypts token and never returns it publicly',()=>{
  const memory=createMemoryFs();
  const safeStorage={
    isEncryptionAvailable:()=>true,
    encryptString:value=>Buffer.from(`encrypted:${value}`),
    decryptString:value=>value.toString().replace(/^encrypted:/,'')
  };
  const store=createDapodikConfigStore({
    safeStorage,fs:memory.fs,path:memory.path,userDataPath:'/user-data'
  });
  const publicConfig=store.save({
    baseUrl:'http://localhost:5774',npsn:'20218098',semesterId:'20262',token:'SECRET'
  });
  assert.equal('token' in publicConfig,false);
  assert.equal(store.loadWithToken().token,'SECRET');
  assert.doesNotMatch(memory.read('/user-data/dapodik-config.json'),/SECRET/);
  assert.doesNotMatch(memory.read('/user-data/dapodik-token.bin'),/SECRET/);
});
```

- [ ] **Step 2: Run the config test and confirm the missing-module failure**

Run: `node --test tests/dapodik-config.test.js`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement fail-closed encrypted persistence**

```js
function save(input){
  if(!safeStorage.isEncryptionAvailable()){
    throw new Error('Penyimpanan aman Windows tidak tersedia.');
  }
  const publicConfig=normalizePublicConfig(input);
  const encrypted=safeStorage.encryptString(String(input.token||'').trim());
  fs.mkdirSync(userDataPath,{recursive:true});
  fs.writeFileSync(configPath,JSON.stringify(publicConfig),{mode:0o600});
  fs.writeFileSync(tokenPath,encrypted,{mode:0o600});
  return {...publicConfig,tokenConfigured:encrypted.length>0};
}
```

Write configuration files under Electron `userData`, never `dist` or the repository. Redact filesystem and crypto exception messages before returning them to the browser.

- [ ] **Step 4: Run config and repository-secret tests**

Run: `node --test tests/dapodik-config.test.js tests/kunci-tidak-ikut-git.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit the encrypted store**

```bash
git add electron/dapodik-config.cjs tests/dapodik-config.test.js package.json
git commit -m "feat: encrypt Dapodik credentials on Windows"
```

### Task 5: Private-Network Dapodik HTTP Client

**Files:**
- Create: `electron/dapodik-client.cjs`
- Create: `tests/dapodik-client.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `isPrivateAddress(address): boolean`
  - `validateDapodikUrl(value, lookup): Promise<URL>`
  - `createDapodikClient({fetchImpl,lookup,timeoutMs}): DapodikClient`
  - `DapodikClient.test(config)`
  - `DapodikClient.pull(config)`
  - `DapodikClient.push(config, payload)`
- Endpoint profile:
  - school: `GET /WebService/getSekolah`
  - teachers: `GET /WebService/getGtk`
  - students: `GET /WebService/getPesertaDidik`
  - classes: `GET /WebService/getRombonganBelajar`
  - subjects: `GET /WebService/getMataPelajaran`
  - lessons: `GET /WebService/getPembelajaran`
  - subject/evaluation registration: `POST /WebService/postMatevRapor`
  - report scores: `POST /WebService/postNilai` with `table=rapor`

- [ ] **Step 1: Write private-host, timeout, auth, and redaction tests**

```js
test('private address policy accepts loopback and RFC1918 only',()=>{
  assert.equal(isPrivateAddress('127.0.0.1'),true);
  assert.equal(isPrivateAddress('10.2.3.4'),true);
  assert.equal(isPrivateAddress('172.16.1.2'),true);
  assert.equal(isPrivateAddress('172.31.255.254'),true);
  assert.equal(isPrivateAddress('192.168.1.10'),true);
  assert.equal(isPrivateAddress('8.8.8.8'),false);
});

test('client sends bearer token but redacts it from errors',async()=>{
  const requests=[];
  const client=createDapodikClient({
    lookup:async()=>({address:'127.0.0.1'}),
    fetchImpl:async(url,options)=>{
      requests.push({url:String(url),options});
      return new Response('server failed',{status:500});
    },
    timeoutMs:1000
  });
  await assert.rejects(
    ()=>client.test({baseUrl:'http://localhost:5774',npsn:'20218098',semesterId:'20262',token:'SECRET'}),
    error=>!error.message.includes('SECRET')
  );
  assert.equal(requests[0].options.headers.Authorization,'Bearer SECRET');
});
```

- [ ] **Step 2: Run the client test and confirm the missing-module failure**

Run: `node --test tests/dapodik-client.test.js`  
Expected: FAIL because the client does not exist.

- [ ] **Step 3: Implement DNS-aware URL validation and request wrapper**

```js
async function validateDapodikUrl(value,lookup){
  const url=new URL(String(value));
  if(!['http:','https:'].includes(url.protocol))throw new Error('URL Dapodik harus HTTP atau HTTPS.');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=net.isIP(host)?[{address:host}]:await lookup(host,{all:true});
  if(!addresses.length||addresses.some(item=>!isPrivateAddress(item.address))){
    throw new Error('URL Dapodik harus mengarah ke komputer lokal atau jaringan privat.');
  }
  url.pathname=url.pathname.replace(/\/$/,'');
  return url;
}
```

Use `AbortSignal.timeout(timeoutMs)`, set `Accept: application/json`, apply `Authorization: Bearer ...`, cap response bodies at 10 MB, parse JSON strictly, and convert all network/HTTP errors to safe Indonesian messages.

- [ ] **Step 4: Run client and syntax tests**

Run: `node --test tests/dapodik-client.test.js && npm run check`  
Expected: PASS.

- [ ] **Step 5: Commit the client**

```bash
git add electron/dapodik-client.cjs tests/dapodik-client.test.js package.json
git commit -m "feat: connect only to private Dapodik hosts"
```

### Task 6: Protected Same-Origin Electron Bridge

**Files:**
- Create: `electron/dapodik-bridge.cjs`
- Modify: `electron/main.cjs`
- Modify: `tests/desktop-windows.test.js`
- Create: `tests/dapodik-bridge.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - per-launch random token in `<meta name="erapor-desktop-bridge-token">`
  - bridge endpoints `GET /__erapor/dapodik/config`, `PUT /__erapor/dapodik/config`, `DELETE /__erapor/dapodik/config`, `POST /__erapor/dapodik/test`, `POST /__erapor/dapodik/pull`, `POST /__erapor/dapodik/push`
  - `createDapodikBridge({configStore,client,bridgeToken}): handleBridgeRequest`
- Requires `X-ERapor-Bridge-Token` and loopback host; sends no CORS allow headers.

- [ ] **Step 1: Add authentication and token-injection tests**

```js
test('bridge rejects missing or wrong launch token before reading configuration',async()=>{
  const bridge=createDapodikBridge({
    bridgeToken:'launch-secret',
    configStore:neverCalledStore(),
    client:neverCalledClient()
  });
  assert.equal((await bridge(fakeRequest({method:'POST',url:'/__erapor/dapodik/test'}))).status,403);
  assert.equal((await bridge(fakeRequest({
    method:'POST',url:'/__erapor/dapodik/test',
    headers:{'x-erapor-bridge-token':'wrong'}
  }))).status,403);
});

test('desktop injects only launch token metadata and never Dapodik bearer token',async()=>{
  const source=await readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
  assert.match(source,/erapor-desktop-bridge-token/);
  assert.match(source,/randomBytes\(32\)/);
  assert.doesNotMatch(source,/Access-Control-Allow-Origin/);
});
```

- [ ] **Step 2: Run bridge tests and confirm missing-module failures**

Run: `node --test tests/dapodik-bridge.test.js tests/desktop-windows.test.js`  
Expected: FAIL before bridge wiring.

- [ ] **Step 3: Implement strict bridge dispatch**

```js
async function handleBridgeRequest(request){
  if(request.headers['x-erapor-bridge-token']!==bridgeToken){
    return json(403,{error:'Bridge Windows tidak diizinkan.'});
  }
  const {pathname}=new URL(request.url,'http://127.0.0.1');
  if(request.method==='GET'&&pathname==='/__erapor/dapodik/config'){
    return json(200,configStore.loadPublic());
  }
  if(request.method==='POST'&&pathname==='/__erapor/dapodik/test'){
    return json(200,await client.test(configStore.loadWithToken()));
  }
  if(request.method==='POST'&&pathname==='/__erapor/dapodik/pull'){
    return json(200,await client.pull(configStore.loadWithToken()));
  }
  return json(404,{error:'Endpoint bridge tidak ditemukan.'});
}
```

Add bounded JSON body reading (256 KB for config/test, 5 MB for push), exact method checks, content-type checks, and safe error responses. In `main.cjs`, route bridge paths before static files and inject the launch meta tag beside the existing legacy bootstrap script.

- [ ] **Step 4: Run bridge, client, config, and desktop tests**

Run: `node --test tests/dapodik-bridge.test.js tests/dapodik-client.test.js tests/dapodik-config.test.js tests/desktop-windows.test.js && npm run check`  
Expected: PASS.

- [ ] **Step 5: Commit the Windows bridge**

```bash
git add electron/dapodik-bridge.cjs electron/main.cjs tests/dapodik-bridge.test.js tests/desktop-windows.test.js package.json
git commit -m "feat: expose a protected local Dapodik bridge"
```

### Task 7: Browser Bridge Discovery and Platform Fallback

**Files:**
- Create: `src/services/dapodik-bridge.js`
- Create: `tests/dapodik-browser-bridge.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `dapodikPlatform(): {available:boolean,platform:'windows'|'web',reason:string}`
  - `getDapodikPublicConfig(): Promise<PublicConfig>`
  - `saveDapodikConfig(input): Promise<PublicConfig>`
  - `testDapodikConnection(): Promise<TestResult>`
  - `pullDapodikData(): Promise<RawDataset>`
  - `pushDapodikValues(payload): Promise<PushResult>`
- Reads the launch token only from the meta tag and keeps it in module memory.

- [ ] **Step 1: Add Windows and Web/PWA behavior tests**

```js
test('browser without desktop meta reports Windows requirement and does not fetch',async()=>{
  let calls=0;
  const bridge=createBrowserDapodikBridge({
    readToken:()=>'',fetchImpl:async()=>{calls+=1;}
  });
  assert.deepEqual(bridge.platform(),{
    available:false,platform:'web',
    reason:'Sinkronisasi Dapodik harus dijalankan melalui aplikasi Windows.'
  });
  await assert.rejects(()=>bridge.test(),/aplikasi Windows/);
  assert.equal(calls,0);
});

test('Windows bridge sends the launch token header',async()=>{
  const requests=[];
  const bridge=createBrowserDapodikBridge({
    readToken:()=> 'launch-secret',
    fetchImpl:async(url,options)=>{
      requests.push({url,options});
      return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
    }
  });
  await bridge.test();
  assert.equal(requests[0].options.headers['X-ERapor-Bridge-Token'],'launch-secret');
});
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run: `node --test tests/dapodik-browser-bridge.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the same-origin fetch wrapper**

```js
function request(path,{method='GET',body}={}){
  const token=readToken();
  if(!token)throw new Error(WINDOWS_REQUIRED);
  return fetchImpl(path,{
    method,
    credentials:'same-origin',
    headers:{
      'Content-Type':'application/json',
      'X-ERapor-Bridge-Token':token
    },
    body:body===undefined?undefined:JSON.stringify(body)
  }).then(readSafeJson);
}
```

Never accept an absolute bridge URL; all requests use fixed same-origin paths. Do not persist the launch token.

- [ ] **Step 4: Run bridge and platform tests**

Run: `node --test tests/dapodik-browser-bridge.test.js tests/desktop-windows.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit browser discovery**

```bash
git add src/services/dapodik-bridge.js tests/dapodik-browser-bridge.test.js package.json
git commit -m "feat: detect Windows Dapodik availability safely"
```

### Task 8: Admin Dapodik Connection and Pull UI

**Files:**
- Create: `src/pages/dapodik.js`
- Modify: `src/app.js`
- Modify: `src/styles/app.css`
- Create: `tests/dapodik-ui.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces `renderDapodik(session, mode): HTMLElement` for modes `service`, `pull`, and `push`.
- Consumes browser bridge, adapter, preview, apply, and sync log services.

- [ ] **Step 1: Add route, Admin-only, and fallback UI tests**

```js
test('Dapodik canonical routes select one page mode',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/case 'dapodik-service': return renderDapodik\(session,'service'\)/);
  assert.match(app,/case 'dapodik-pull': return renderDapodik\(session,'pull'\)/);
  assert.match(app,/case 'dapodik-push': return renderDapodik\(session,'push'\)/);
});

test('Dapodik page includes connection, preview, and Windows fallback copy',async()=>{
  const page=await readFile(new URL('../src/pages/dapodik.js',import.meta.url),'utf8');
  assert.match(page,/Tes Koneksi/);
  assert.match(page,/Pratinjau Perubahan/);
  assert.match(page,/Terapkan Data/);
  assert.match(page,/aplikasi Windows/);
});
```

- [ ] **Step 2: Run the UI test and confirm missing page/routes**

Run: `node --test tests/dapodik-ui.test.js tests/router.test.js`  
Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement the three page modes**

```js
export function renderDapodik(session,mode='service'){
  if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat membuka Dapodik.');
  const platform=dapodikPlatform();
  if(!platform.available)return renderWindowsRequired(platform.reason);
  if(mode==='service')return renderServiceForm(session);
  if(mode==='pull')return renderPullPreview(session);
  if(mode==='push')return renderPushStatus(session);
  throw new Error('Mode Dapodik tidak valid.');
}
```

The service form contains URL, masked token input, NPSN, semester, `Tes Koneksi`, and `Reset Form Data`. Pull renders counts and row groups for create/update/archive/conflict, defaults conflicts to unchecked, and requires a confirmation dialog before `applyDapodikPreview()`. Disable pull/push until the latest connection test matches NPSN and semester.

- [ ] **Step 4: Run Dapodik UI, sync, adapter, and router tests**

Run: `node --test tests/dapodik-ui.test.js tests/dapodik-sync.test.js tests/dapodik-adapter.test.js tests/router.test.js && npm run check`  
Expected: PASS.

- [ ] **Step 5: Commit the Admin UI**

```bash
git add src/pages/dapodik.js src/app.js src/styles/app.css tests/dapodik-ui.test.js package.json
git commit -m "feat: add Admin Dapodik connection and pull preview"
```

### Task 9: Score Send Queue, Partial Failure, and Retry

**Files:**
- Modify: `src/services/dapodik-sync.js`
- Modify: `electron/dapodik-client.cjs`
- Modify: `electron/dapodik-bridge.cjs`
- Modify: `src/pages/dapodik.js`
- Create: `tests/dapodik-push.test.js`

**Interfaces:**
- Produces:
  - `buildDapodikScoreQueue(session): ScoreQueue`
  - `recordDapodikPushResult(session, result): QueueSummary`
  - `retryableDapodikScores(session): ScorePayload[]`
  - push payload records keyed by local report score key plus Dapodik student/subject IDs.
- Successful records are not resent by retry; failed records retain a safe status and reason code.

- [ ] **Step 1: Write queue and partial-retry tests**

```js
test('retry sends only failed score records',()=>{
  useMemoryStorage();
  seedMappedReportScores();
  const queue=buildDapodikScoreQueue(admin);
  recordDapodikPushResult(admin,{
    items:[
      {queueId:queue.items[0].queueId,status:'success'},
      {queueId:queue.items[1].queueId,status:'failed',reasonCode:'HTTP_500'}
    ]
  });
  const retry=retryableDapodikScores(admin);
  assert.deepEqual(retry.map(item=>item.queueId),[queue.items[1].queueId]);
});

test('queue blocks local students without Dapodik student mapping',()=>{
  useMemoryStorage();
  seedManualStudentWithScore();
  const queue=buildDapodikScoreQueue(admin);
  assert.equal(queue.blocked[0].reasonCode,'STUDENT_NOT_MAPPED');
  assert.equal(queue.items.length,0);
});
```

- [ ] **Step 2: Run push tests and confirm missing queue functions**

Run: `node --test tests/dapodik-push.test.js`  
Expected: FAIL because score queue APIs are absent.

- [ ] **Step 3: Implement stable queue IDs and safe state**

```js
function scoreQueueId(score){
  return `${score.localKey}|${score.updatedAt||score.finalScore}`;
}

export function retryableDapodikScores(session){
  assertAdmin(session);
  const state=loadDb().dapodikSyncState?.scorePush||{};
  return Object.values(state.items||{})
    .filter(item=>item.status==='failed')
    .map(item=>clone(item.payload));
}
```

Map local subject IDs through `dapodikMappings`; block unmapped students/subjects with reason codes and counts, never raw NISN in logs. The Electron client registers evaluation subjects then posts report values. Bridge returns per-item statuses even when one item fails.

- [ ] **Step 4: Add UI status cards and retry action**

```js
function pushSummaryCards(summary){
  return `<div class="status-grid">
    <article><strong>${summary.ready}</strong><span>Siap Kirim</span></article>
    <article><strong>${summary.success}</strong><span>Berhasil</span></article>
    <article><strong>${summary.failed}</strong><span>Gagal</span></article>
    <article><strong>${summary.blocked}</strong><span>Belum Terpetakan</span></article>
  </div>`;
}
```

Require a confirmation showing counts before the first push. Show `Coba Ulang Data Gagal` only when failed items exist.

- [ ] **Step 5: Run push, bridge, and report tests, then commit**

Run: `node --test tests/dapodik-push.test.js tests/dapodik-bridge.test.js tests/report.test.js`  
Expected: PASS.

```bash
git add src/services/dapodik-sync.js electron/dapodik-client.cjs electron/dapodik-bridge.cjs src/pages/dapodik.js tests/dapodik-push.test.js
git commit -m "feat: send and retry Dapodik report scores safely"
```

### Task 10: Operator Documentation and Final Verification

**Files:**
- Create: `docs/operator/dapodik-windows.md`
- Modify: `README.md`
- Modify only if verification finds a defect: source/tests from Tasks 1–9.

**Interfaces:**
- Produces a reproducible mock verification and a controlled live-school checklist.

- [ ] **Step 1: Write the operator guide with exact safety sequence**

```markdown
# Dapodik Windows

1. Buat Backup & Restore → Backup Data sebelum sinkronisasi pertama.
2. Buka aplikasi Windows pada komputer yang menjalankan atau dapat menjangkau Dapodik.
3. Isi URL lokal, NPSN, semester, dan token pada Dapodik → Web Service.
4. Pilih Tes Koneksi. Lanjutkan hanya bila nama sekolah, NPSN, dan semester sesuai.
5. Pilih Ambil Data Dapodik, periksa semua konflik, lalu pilih Terapkan Data.
6. Periksa satu kelas dan satu siswa sebelum mengirim nilai.
7. Kirim satu batch terkontrol. Pastikan jumlah berhasil/gagal sesuai.
8. Gunakan Coba Ulang Data Gagal; jangan mengirim ulang record yang sudah berhasil.
9. Jika bentuk respons tidak didukung, hentikan proses dan simpan pesan aman untuk pemeriksaan teknis.
```

Also document that Android/PWA cannot perform Dapodik sync and that bearer tokens must not be pasted into screenshots, issues, chat, or logs.

- [ ] **Step 2: Run the entire automated suite**

Run: `npm test`  
Expected: all tests PASS, including every `dapodik-*.test.js`.

- [ ] **Step 3: Run syntax, web build, and Windows packaging checks**

Run: `npm run check && npm run build && npm run desktop:package`  
Expected: all commands exit 0 and the packaged Windows launcher contains the Dapodik bridge files.

- [ ] **Step 4: Run the mock end-to-end sequence**

Run: `node --test tests/dapodik-adapter.test.js tests/dapodik-sync.test.js tests/dapodik-config.test.js tests/dapodik-client.test.js tests/dapodik-bridge.test.js tests/dapodik-browser-bridge.test.js tests/dapodik-ui.test.js tests/dapodik-push.test.js`  
Expected: PASS for connection, pull, preview, apply, partial push, retry, redaction, and platform fallback.

- [ ] **Step 5: Confirm no secrets or personal identifiers were committed**

Run: `rg -n "Bearer [A-Za-z0-9_-]+|20218098.*token|SECRET" src electron docs tests --glob '!tests/dapodik-*.test.js'`  
Expected: no matches containing a real token; school NPSN may appear only as non-secret configuration documentation.

- [ ] **Step 6: Commit documentation and verification corrections**

```bash
git add docs/operator/dapodik-windows.md README.md src electron tests package.json
git commit -m "docs: add safe Dapodik Windows operations"
```

- [ ] **Step 7: Perform the controlled live-school acceptance after deployment**

On the authorized school Windows computer, follow the nine guide steps with the school operator. Record only timestamp, operation, and success/failure counts; do not copy token, student names, NISN, raw responses, or screenshots containing credentials into the repository. Production synchronization is accepted only after school identity validation, one pull preview, one applied class check, and one controlled score batch succeed.
