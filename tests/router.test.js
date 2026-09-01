import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessRoute, initRouter, navigate, onRouteChange, resolveRoute } from '../src/core/router.js';

const admin={role:'admin'};
const teacher={role:'teacher'};

test('Teacher cannot open Admin routes through the hash',()=>{
  assert.equal(canAccessRoute('users','teacher'),false);
  assert.equal(canAccessRoute('settings','teacher'),false);
  assert.equal(resolveRoute('users',teacher),'dashboard');
  assert.equal(resolveRoute('#assessment-status',teacher),'dashboard');
});

test('legacy teacher routes preserve data-entry destinations while grouped aliases stay canonical',()=>{
  const teacher5b={role:'teacher',classId:'5B'};
  assert.equal(resolveRoute('students',teacher5b),'student-update');
  assert.equal(resolveRoute('completeness-input',teacher5b),'student-update');
  assert.equal(resolveRoute('assessment',teacher5b),'assessment');
  assert.equal(resolveRoute('attendance',teacher5b),'attendance');
  assert.equal(resolveRoute('attitudes',teacher5b),'attitudes');
  assert.equal(resolveRoute('weights',teacher5b),'weights');
  assert.equal(resolveRoute('print',teacher5b),'print-report');
  assert.equal(resolveRoute('subject-mapping',teacher5b),'dashboard');
});

test('teacher cannot open Dapodik or Admin activity routes',()=>{
  assert.equal(canAccessRoute('dapodik-service','teacher'),false);
  assert.equal(canAccessRoute('intracurricular','teacher'),false);
  assert.equal(resolveRoute('dapodik-pull',{role:'teacher'}),'dashboard');
});

test('Admin cannot open Teacher-only routes through the hash',()=>{
  assert.equal(canAccessRoute('students','admin'),true);
  assert.equal(canAccessRoute('attendance','admin'),false);
  assert.equal(canAccessRoute('subject-mapping','admin'),false);
  assert.equal(resolveRoute('students',admin),'reference-students');
  assert.equal(resolveRoute('attendance',admin),'dashboard');
  assert.equal(resolveRoute('#backup',admin),'backup');
});

test('Shared routes stay available and login is resolved safely',()=>{
  assert.equal(resolveRoute('profile',admin),'profile');
  assert.equal(resolveRoute('profile',teacher),'profile');
  assert.equal(resolveRoute('login',admin),'dashboard');
  assert.equal(resolveRoute('dashboard',null),'login');
  assert.equal(resolveRoute('dashboard',{role:'invalid'}),'login');
});

test('Navigation renders once through hashchange instead of rendering eagerly',()=>{
  let hashChange;
  let renders=0;
  globalThis.window={
    location:{hash:'#dashboard'},
    addEventListener:(event,handler)=>{if(event==='hashchange')hashChange=handler;},
    history:{replaceState:()=>{}},
  };
  onRouteChange(()=>{renders+=1;});
  initRouter('dashboard');
  assert.equal(renders,1);
  navigate('profile');
  assert.equal(window.location.hash,'profile');
  assert.equal(renders,1);
  hashChange();
  assert.equal(renders,2);
});
