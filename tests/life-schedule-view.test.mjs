// Run: node --test tests/life-schedule-view.test.mjs
// Import the static ES modules by data URL because the parent repository has no
// package.json declaring "type": "module" and all production paths use .js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const coreCode = await readFile(new URL('../site/life/core.js', import.meta.url),'utf8');
const coreUrl = 'data:text/javascript;base64,'+Buffer.from(coreCode).toString('base64');
const core = await import(coreUrl);
const viewCode = await readFile(new URL('../site/life/schedule-view.js', import.meta.url),'utf8');
const viewUrl = 'data:text/javascript;base64,'+Buffer.from(
  viewCode.replace("from './core.js';", "from '"+coreUrl+"';")
).toString('base64');
const view = await import(viewUrl);

function sample() {
  const s=core.initialState();
  s.events=[
    {
      id:'carer',title:'Carer shift',area:'family',type:'care',owner:'Me',people:'Alex',
      date:'2026-10-12',endDate:'2026-10-12',timing:'timed',start:'13:00',end:'17:00',
      location:'Home',transport:'',care:'Alex covers childcare',
      notes:'Confirm at 12',logistics:'needs',repeat:'weekly',until:'',
      skip:[],confirmation:'tentative'
    },
    {
      id:'trip',title:'Weekend away',type:'travel',owner:'Partner',
      date:'2026-10-12',endDate:'2026-10-15',timing:'all-day',
      confirmation:'confirmed',logistics:'clear',repeat:'none',skip:[],
      location:'Regional WA'
    }
  ];
  s.tasks=[{
    id:'task',title:'Buy groceries',status:'todo',priority:'high',
    due:'2026-10-12',owner:'Me',area:'home'
  }];
  return core.normaliseState(s);
}

test('rolling dayboard displays logistics with separate actions',()=>{
  const markup=view.renderNextDays(sample(),{offset:0,span:14});
  assert.match(markup,/Next few days/);
  assert.match(markup,/Plan activity/);
  assert.match(markup,/Care \/ handover/);
  assert.match(markup,/Organise logistics/);
  assert.match(markup,/Actions due/);
  assert.match(markup,/Copy/);
  assert.match(markup,/Print/);
  assert.match(markup,/id="schedule-span"/);
});
test('agenda export contains activity, care, transport and due actions',()=>{
  const text=view.schedulePlainText(sample(),'2026-10-12',7);
  assert.match(text,/Carer shift/);
  assert.match(text,/Care: Alex covers childcare/);
  assert.match(text,/To coordinate: Confirm activity, Organise logistics/);
  assert.match(text,/Action due: Buy groceries/);
  assert.match(text,/Weekend away/);
});
test('both HTML surfaces escape untrusted event text',()=>{
  const s=sample();
  s.events[0].title='<script>alert("oops")</script>';
  const page=view.renderNextDays(s,{span:7,offset:0});
  assert.doesNotMatch(page,/<script>alert/);
  assert.match(page,/&lt;script&gt;alert/);
});
