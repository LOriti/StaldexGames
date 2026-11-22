// Invasion model checks: loads the pure model out of site/invasion.html and runs it in a sandbox.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../site/invasion.html', import.meta.url), 'utf8');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const consts = js.slice(0, js.indexOf('/* ================= CANVAS'));
const model = js.slice(js.indexOf('/* ================= MODEL (pure)'), js.indexOf('/* ================= GAME'));

function sandbox() {
  const ctx = { Math, Set, Object, Array, JSON, console, document: { querySelector: () => null }, log: () => {}, float: () => {} };
  vm.createContext(ctx);
  vm.runInContext(consts.replace(/^let G=null.*$/m, 'var G=null, screen="title", skip=false, INV=null;') + model +
    ';globalThis.api={NODES,DIRS,PEV,LANES,TRAITS,econ,counters,battleInit,battleWave,battleRun,traitorDrift,cloneS,applyFx};', ctx);
  return ctx.api;
}
function state(over = {}) {
  return Object.assign({
    year: 100, E: 0, RP: 0, P: 12, S: 60, I: 60, K: 40, R: 55, T: 10, fund: 1, trn: 2,
    moth: new Set(), half: new Set(), lb: {}, owned: new Set(), size: {}, tech: {}, builtAt: {}, bonus: {}, uses: {}, reports: [],
    dr: { Seq: 50, I: .1, K: .15, R: -.35, pop: .004, effM: 1, resM: 1, enl: 0, sec: 0, trn: .001, loy: 0 }
  }, over);
}
function build(s, ids, S, T, yb) { ids.forEach(id => { s.owned.add(id); s.size[id] = S; s.tech[id] = T; s.builtAt[id] = yb }); return s }
const enemy = { orb: 115, swarm: 110, ground: 120 };

test('a maxed build wins; an empty one does not', () => {
  const A = sandbox();
  const all = ['D1', 'D2', 'D3', 'D4', 'E1', 'E2', 'E3', 'E4', 'S1', 'S2', 'S3', 'S4'];
  const strong = A.battleRun(build(state(), all, 4, 3, 10), enemy, true);
  assert.ok(strong.won, 'maxed build wins');
  const weak = A.battleRun(state(), enemy, true);
  assert.equal(weak.won, null);
  assert.ok(weak.days > 0);
});

test('conscripts fight at half strength', () => {
  const A = sandbox();
  const s = build(state({ trn: 0.01 }), ['D2'], 2, 0, 50);
  const ec = A.econ(s);
  assert.ok(ec.con > 0, 'some crew are conscripts');
  assert.ok(ec.crewEff < 1 && ec.crewEff >= 0.5);
});

test('reservists in the line take heavier losses than veterans', () => {
  const A = sandbox();
  const mk = () => build(state(), ['D1', 'D2', 'D3'], 2, 1, 20);
  const B1 = A.battleInit(mk(), enemy, true), B2 = A.battleInit(mk(), enemy, true);
  const g2 = B2.L.find(l => l.k === 'ground'); g2.mix.res = g2.mix.reg * 0.5; g2.mix.reg *= 0.5;
  const r1 = A.battleWave(B1, 0).rows.find(x => x.l.k === 'ground');
  const r2 = A.battleWave(B2, 0).rows.find(x => x.l.k === 'ground');
  assert.ok(r2.r < r1.r, 'green line is weaker');
  assert.ok(r2.f > r1.f, 'green line loses more');
  assert.ok(r2.exp1 < r1.exp1, 'experience shows the drop');
});

test('Unity and Resolve above 50 wear Traitors down', () => {
  const A = sandbox();
  const base = A.traitorDrift(state({ R: 50 })).tot;
  const unity = A.traitorDrift(state({ R: 70, dr: { ...state().dr, loy: .12 } })).tot;
  assert.ok(unity < base - 0.5);
});

test('project events are about two per project and only use known effects', () => {
  const A = sandbox();
  assert.ok(A.PEV.length >= 26);
  const ok = new Set(['E', 'RP', 'P', 'S', 'I', 'K', 'R', 'T', 'TRN', 'INTEL', 'SUP', ...Object.keys(A.TRAITS)]);
  for (const e of A.PEV) for (const o of e.o) for (const k of Object.keys(o[2])) assert.ok(ok.has(k), `${e.id}: ${k}`);
});
