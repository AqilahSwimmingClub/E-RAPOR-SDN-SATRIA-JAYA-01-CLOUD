import test from 'node:test';
import assert from 'node:assert/strict';
import { capaianPembelajaran, cpElements } from '../src/data/curriculum-cp.js';
import { naskahCp, naskahElemen } from '../src/data/curriculum-cp-naskah.js';

test('CP Koding Fase C mengikuti Bab XXVIII KepKaBSKAP 046/H/KR/2025',()=>{
  const cp=capaianPembelajaran('5B','koding');
  assert.equal(cp.available,true);
  assert.equal(cp.phase,'C');
  assert.match(cp.regulation.decision,/046\/H\/KR\/2025/);
  assert.match(cp.regulation.section,/XXVIII/);
  assert.equal(cp.naskah,naskahCp('koding','C'));
  assert.ok(cp.naskah.length>500);
  assert.equal(cp.naskahReason,null);
  const names=cpElements('koding','C').map(item=>item.name);
  assert.deepEqual(names,[
    'Berpikir Komputasional',
    'Literasi Digital',
    'Literasi dan Etika Kecerdasan Artifisial',
    'Pemanfaatan dan Pengembangan Kecerdasan Artifisial',
  ]);
  for(const name of names)assert.ok(naskahElemen('koding','C',name)?.length>20);
});

test('Koding tidak berlaku pada Fase A dan B',()=>{
  for(const classId of ['1A','2D','3A','4D']){
    const cp=capaianPembelajaran(classId,'koding');
    assert.equal(cp.available,false);
    assert.equal(cp.naskah,null);
    assert.deepEqual(cp.elements,[]);
  }
});
