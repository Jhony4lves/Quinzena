const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('manifest está preparado para instalação standalone', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.lang, 'pt-BR');
  assert.ok(manifest.name);
  assert.ok(manifest.short_name);
});

test('manifest oferece PNGs 192 e 512 maskable e os arquivos existem', () => {
  const sizes = new Map(manifest.icons.map(icon => [icon.sizes, icon]));
  for (const size of ['192x192', '512x512']) {
    const icon = sizes.get(size);
    assert.ok(icon, `ícone ${size} ausente`);
    assert.equal(icon.type, 'image/png');
    assert.match(icon.purpose || '', /maskable/);
    assert.ok(fs.existsSync(path.join(root, icon.src)), `${icon.src} não existe`);
  }
});

test('service worker precacheia shell e ícones da instalação', () => {
  for (const asset of ['./index.html', './styles.css', './core.js', './app.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png']) {
    assert.ok(sw.includes(`'${asset}'`), `${asset} não está no precache`);
  }
  assert.match(sw, /quinzena-v\d+\.\d+\.\d+/);
});

test('HTML referencia manifest e app registra service worker', () => {
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(app, /serviceWorker\.register\('\.\/sw\.js'\)/);
});
