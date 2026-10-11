// Run from the repo root: node --test tests/life-schedule.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../site/life/core.js', import.meta.url), 'utf8');
const core = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const event = (overrides = {}) => ({
  id: 'event-1', title: 'Care shift', date: '2026-10-12', endDate: '2026-10-12',
  type:'care', repeat: 'none', timing: 'timed', start:'09:00', end:'17:00',
  confirmation: 'confirmed', logistics: 'clear', skip:[], owner:'Me', people:'',
  ...overrides
});
function withEvents(events) {
  const state = core.initialState();
  state.events = events;
  return core.normaliseState(state);
}

test('existing v1 exports import without activity data loss', () => {
  const old = core.initialState();
  delete old.events;
  old.tasks = [{ id:'t1', title:'Check gutters', area:'home', due:'2026-10-12', status:'todo' }];
  const loaded = core.normaliseState(old);
  assert.deepEqual(loaded.events, []);
  assert.equal(loaded.tasks[0].title,'Check gutters');
  assert.equal(loaded.version,1);
});

test('event import validates times, dates, statuses and unknown fields', () => {
  const loaded = withEvents([
    event({ start:'09:45', end:'17:30', surprise:'unsafe', until:'2026-11-10',repeat:'weekly' }),
    event({ id:'event-2', start:'29:30', end:'72:00', type:'unknown', timing:'tbc',
      title:'<img src=x>', transport:'<script>alert(1)</script>' }),
    event({ id:'event-3', date:'2026-02-30' })
  ]);
  assert.equal(loaded.events.length,2);
  assert.equal(loaded.events[0].start,'09:45');
  assert.equal(loaded.events[0].end,'17:30');
  assert.equal(loaded.events[1].start,'');
  assert.equal(loaded.events[1].type,'family');
  assert.equal('surprise' in loaded.events[0],false);
  assert.equal(core.esc(loaded.events[1].title),'&lt;img src=x&gt;');
});

test('repeat activities can skip a single day without deleting the series', () => {
  const e = event({ repeat:'weekly', skip:['2026-10-19'] });
  const occurrences=core.eventsInRange([e],'2026-10-12','2026-11-04');
  assert.deepEqual(occurrences.map(x=>x.occurrenceDate),['2026-10-12','2026-10-26','2026-11-02']);
});

test('multi-day activities appear on each day, including across a window boundary', () => {
  const e=event({ title:'Weekend away', date:'2026-10-09',endDate:'2026-10-12', timing:'all-day' });
  const dates=core.eventsInRange([e],'2026-10-11','2026-10-13');
  assert.deepEqual(dates.map(x=>x.occurrenceDate),['2026-10-11','2026-10-12']);
  assert.ok(dates.every(x=>x.continuation));
  assert.equal(dates[0].seriesDate,'2026-10-09');
});

test('fortnightly multi-day routines and their skipped instances', () => {
  const e=event({date:'2026-10-12',endDate:'2026-10-14',repeat:'fortnightly',
    skip:['2026-10-26'],timing:'all-day'});
  const dates=core.eventsInRange([e],'2026-10-25','2026-11-13');
  assert.deepEqual(dates.map(x=>x.occurrenceDate),['2026-11-09','2026-11-10','2026-11-11']);
});

test('repeat-until stops series starting after end date', () => {
  const e=event({repeat:'weekly',until:'2026-10-26'});
  const dates=core.eventsInRange([e],'2026-10-12','2026-11-09');
  assert.deepEqual(dates.map(x=>x.occurrenceDate),['2026-10-12','2026-10-19','2026-10-26']);
});

test('schedule day cards merge commitments, tasks and reference dates', () => {
  const state=withEvents([event()]);
  state.tasks=[{id:'t1',status:'todo',title:'Book transport',due:'2026-10-12'}];
  state.records=[{id:'r1',title:'Renewal',date:'2026-10-12'}];
  const days=core.scheduleDays(state,'2026-10-12',7);
  assert.equal(days.length,7);
  assert.equal(days[0].events[0].title,'Care shift');
  assert.equal(days[0].tasks[0].title,'Book transport');
  assert.equal(days[0].records[0].title,'Renewal');
  assert.equal(days[1].events.length,0);
});

test('tentative, timing TBC and unsorted logistics produce clear reminders', () => {
  const reasons=core.coordinationReasons(event({
    confirmation:'tentative', timing:'tbc', logistics:'needs'
  }));
  assert.deepEqual(reasons,['Confirm activity','Confirm time','Organise logistics']);
  assert.deepEqual(core.coordinationReasons(event({confirmation:'cancelled'})),[]);
});

test('overlap detection is person-specific and ignores separate households', () => {
  const day={events:[
    event({id:'1',owner:'Me',start:'09:00',end:'12:00'}),
    event({id:'2',owner:'Me',start:'11:00',end:'13:00'}),
    event({id:'3',owner:'Partner',start:'11:00',end:'13:00'}),
    event({id:'4',owner:'Shared',start:'09:00',end:'12:00'})
  ]};
  const clashes=core.possibleClashes(day);
  assert.equal(clashes.length,1);
  assert.equal(clashes[0].first.id,'1');
  assert.equal(clashes[0].second.id,'2');
});

test('duplicate events and excessive number of records are safely handled', () => {
  const raw=core.initialState();
  raw.events=[event(),event({ title:'Second activity' })];
  const state=core.normaliseState(raw);
  assert.notEqual(state.events[0].id,state.events[1].id);
  raw.events=Array.from({length:5001},(_,i)=>event({id:String(i)}));
  assert.throws(()=>core.normaliseState(raw),/record limits/);
});
