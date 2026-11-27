import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizedDates, hasMissingTimes, affectedAnswers } from '../src/utils/planner.js';
import { saveDraft, readDraft, clearDraft } from '../src/data/draft.js';
import { buildShareText } from '../src/utils/votes.js';
import { setLocale } from '../src/i18n/index.js';

test('time mode normalizes data without mutating the editor and validates every selected date',()=>{
  const dates={'2027-01-01':{time:'18:00'},'2027-01-02':{time:'00:00'}};
  assert.deepEqual(Object.values(normalizedDates(dates,false)).map(info=>info.time),['','']);
  assert.equal(dates['2027-01-01'].time,'18:00');
  assert.equal(hasMissingTimes(dates,true),false);
  for(const value of ['','24:00','12:60','noon'])assert.equal(hasMissingTimes({'2027-01-01':{time:value}},true),true);
  assert.equal(hasMissingTimes({'2027-01-01':{time:''}},false),false);
});
test('destructive change summaries count affected answers only once',()=>{
  const poll={organizerVoter:'a',votes:{a:{votesJson:'{"2027-01-01":"yes","2027-01-02":"maybe"}'},b:{votesJson:'{"2027-01-01":"no","2027-01-02":"none"}'}}};
  assert.equal(affectedAnswers(poll,['2027-01-01'],['2027-01-01']),2);
  assert.equal(affectedAnswers(poll,['2027-01-01'],[],true),3);
  assert.equal(affectedAnswers(poll,[],[]),0);
});
test('drafts whitelist non-secret fields and preserve the common time and exceptions',()=>{
  const rows=new Map();globalThis.localStorage={getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
  saveDraft({title:'Dinner',organizerName:'Maker',password:'never store',proof:'never store',session:{proof:'never store'},timesEnabled:true,defaultTime:'18:00',selectedDates:{'2027-01-01':{time:'19:00'}}});
  const draft=readDraft();assert.equal(draft.title,'Dinner');assert.equal(draft.defaultTime,'18:00');assert.equal(draft.selectedDates['2027-01-01'].time,'19:00');
  assert.equal(JSON.stringify(draft).includes('never store'),false);clearDraft();assert.equal(readDraft(),null);
});
test('responded includes partial answers but excludes answers for obsolete dates',()=>{
  setLocale('en-GB');
  const dates={'2027-01-01':{time:''},'2027-01-02':{time:''}};
  const text=buildShareText({title:'Dinner',status:'open'},dates,{a:{name:'Partial',votesJson:'{"2027-01-01":"yes"}'},b:{name:'Obsolete',votesJson:'{"2026-01-01":"yes"}'}},'https://example.test/?poll=id');
  assert.ok(text.includes('(1/2 responded)'));
  assert.ok(!text.includes('18:00'));
});
