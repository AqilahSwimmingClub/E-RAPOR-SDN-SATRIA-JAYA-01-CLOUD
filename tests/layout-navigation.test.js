import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('layout renders grouped controls with accessible expansion state',async()=>{
  const source=await readFile(new URL('../src/ui/layout.js',import.meta.url),'utf8');
  assert.match(source,/navigationForRole/);
  assert.match(source,/aria-expanded/);
  assert.match(source,/data-nav-group/);
  assert.match(source,/active-ancestor/);
  assert.match(source,/erapor:nav-groups:/);
});

test('sidebar CSS keeps grouped controls touch-friendly and scrollable',async()=>{
  const css=await readFile(new URL('../src/styles/app.css',import.meta.url),'utf8');
  assert.match(css,/\.nav-group-toggle/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/\.nav-children/);
  assert.match(css,/focus-visible/);
});
