import { buildBackup, restoreBackup, summarizeBackup, validateBackupForSession } from './backup.js';

const SNAPSHOT_KEY='erapor_satria_recovery_snapshots_v1';
const MAX_SNAPSHOTS=5;
function clone(value){return JSON.parse(JSON.stringify(value));}
function all(){try{const parsed=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'[]');return Array.isArray(parsed)?parsed:[];}catch{return [];}}
function save(items){localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(items.slice(0,MAX_SNAPSHOTS)));}
function scopeMatches(record,session){return record.scope.role===session.role&&(session.role==='admin'||(record.scope.classId===session.classId&&record.scope.semester===session.semester&&record.scope.academicYear===session.academicYear));}
function id(){return globalThis.crypto?.randomUUID?.()||`snapshot-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;}

export function listRecoverySnapshots(session){if(!session?.role)throw new Error('Session snapshot tidak valid.');return all().filter(record=>scopeMatches(record,session)).map(clone);}
export function getRecoverySnapshot(session,snapshotId){const record=listRecoverySnapshots(session).find(item=>item.id===snapshotId);return record||null;}
export function createRecoverySnapshot(session,reason='Snapshot manual'){
  const payload=buildBackup(session);const record={id:id(),createdAt:new Date().toISOString(),reason:String(reason||'Snapshot manual').trim().slice(0,150),scope:clone(payload.scope),payload};const items=[record,...all().filter(item=>item.id!==record.id)];save(items);return clone(record);
}
export function previewRecoverySnapshot(session,snapshotId){const record=getRecoverySnapshot(session,snapshotId);if(!record)throw new Error('Snapshot pemulihan tidak ditemukan.');validateBackupForSession(record.payload,session);return {...summarizeBackup(record.payload),id:record.id,reason:record.reason,createdAt:record.createdAt};}
export function restoreRecoverySnapshot(session,snapshotId){const record=getRecoverySnapshot(session,snapshotId);if(!record)throw new Error('Snapshot pemulihan tidak ditemukan.');validateBackupForSession(record.payload,session);createRecoverySnapshot(session,'Otomatis sebelum pulihkan snapshot');restoreBackup(record.payload,session);return true;}
export function snapshotStorageKey(){return SNAPSHOT_KEY;}
