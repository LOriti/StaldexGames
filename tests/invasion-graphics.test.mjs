import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('site/invasion-assets/command-v1/graphics.js', root), 'utf8');
function load({ loaded = true, reduced = false } = {}) {
  const calls = [];
  const document = {
    currentScript: { src: 'https://example.test/invasion-assets/command-v1/graphics.js?v=1' },
    documentElement: { classList: { add() {} } }, body: { dataset: {}, classList: { add() {} } },
    querySelector: () => null, querySelectorAll: () => []
  };
  const math = Object.create(Math);
  math.random = () => { throw new Error('Graphics must not consume game randomness'); };
  const ctx = vm.createContext({ window: {}, URL, document, Math: math,
    matchMedia: () => ({ matches: reduced }),
    Image: class { complete = loaded; naturalWidth = loaded ? 768 : 0; }
  });
  vm.runInContext(source, ctx);
  const gradient = { addColorStop: (...a) => calls.push(['color', ...a]) };
  const canvas = new Proxy({}, {
    get: (_, k) => k === 'createRadialGradient' || k === 'createLinearGradient' ? () => gradient : (...a) => calls.push([k, ...a]),
    set: () => true
  });
  return { gfx: ctx.window.InvasionGraphics, canvas, calls, document };
}

test('every project, navigation tab and battle lane has an accessible decorative symbol', () => {
  const { gfx } = load();
  for (const id of ['D1','D2','D3','D4','E1','E2','E3','E4','S1','S2','S3','S4','H1','H2','H3','soc','eco','prj','war','log','orbit','sky','ground','inside']) {
    assert.match(gfx.icon(id), /aria-hidden="true"/);
    assert.match(gfx.icon(id), /viewBox="0 0 32 32"/);
    assert.ok(existsSync(new URL(`site/invasion-assets/command-v1/icons/${id}.svg`, root)));
  }
  assert.equal(gfx.icon('unknown-project'), '');
  assert.equal(Object.keys(gfx.paths).length, 24);
});

test('canvas layers draw without touching game randomness or leaking context saves', () => {
  const { gfx, canvas: c, calls } = load();
  gfx.backdrop(c, 390, 420, 1000);
  gfx.rings(c, { cx:195, cy:210, R:100 }, 1000, 75);
  assert.equal(gfx.planet(c,195,210,100),true);
  gfx.ship(c,150,60,.4,false);
  gfx.ship(c,250,60,1.4,true,.7);
  gfx.shield(c,195,210,132,.8,1000);
  gfx.impact(c,180,190,.4);
  assert.equal(calls.filter(x => x[0] === 'save').length, calls.filter(x => x[0] === 'restore').length);
  for (const [, ...args] of calls) for (const v of args) if (typeof v === 'number') assert.ok(Number.isFinite(v));
});

test('unloaded or failed Earth texture falls back to the original planet renderer', () => {
  const { gfx, canvas, calls } = load({ loaded: false });
  assert.equal(gfx.planet(canvas,100,100,50), false);
  assert.equal(calls.filter(x => x[0] === 'drawImage').length, 0);
});

test('decoration reads state and marks the real arrival threshold without changing it', () => {
  const { gfx, document } = load({ reduced: true });
  const game = Object.freeze({ year: 89, tab: 'soc' });
  gfx.decorate('game',game);
  assert.equal(document.body.dataset.igAlert,'normal');
  gfx.decorate('game',Object.freeze({ year:90, tab:'prj' }));
  assert.equal(document.body.dataset.igAlert,'arrival');
  assert.equal(document.body.dataset.igTab,'prj');
  assert.equal(gfx.reducedMotion,true);
});

test('both game integrations and gallery compile, with optional renderer hooks', () => {
  for (const name of ['invasion','invasion2']) {
    const html = readFileSync(new URL(`site/${name}.html`,root),'utf8');
    const js = html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
    assert.doesNotThrow(() => new vm.Script(js), name);
    assert.match(js, /if\(!GFX\|\|!GFX.planet/);
    assert.match(js, /if\(GFX\)GFX.ship/);
    assert.match(html, /invasion-assets\/command-v1\/graphics.js\?v=1/);
  }
  const gallery=readFileSync(new URL('site/invasion-graphics.html',root),'utf8');
  const galleryScript=gallery.slice(gallery.indexOf('<script>')+8,gallery.lastIndexOf('</script>'));
  assert.doesNotThrow(()=>new vm.Script(galleryScript));
});
