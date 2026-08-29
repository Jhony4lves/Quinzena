const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function unique(values) {
  return [...new Set(values)];
}

test('todo id acessado por $(id) existe no HTML', () => {
  const ids = unique([...app.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(match => match[1]));
  const missing = ids.filter(id => !new RegExp(`id=["']${id}["']`).test(html));
  assert.deepEqual(missing, [], `IDs ausentes no HTML: ${missing.join(', ')}`);
});

test('ids do HTML não são duplicados', () => {
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(unique(duplicates), [], `IDs duplicados: ${unique(duplicates).join(', ')}`);
});

test('scripts essenciais carregam core antes do app', () => {
  const coreIndex = html.indexOf('src="core.js"');
  const appIndex = html.indexOf('src="app.js"');
  assert.ok(coreIndex >= 0 && appIndex > coreIndex);
});