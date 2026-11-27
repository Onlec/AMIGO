import React, { useState } from 'react';
import { t } from '../i18n/index.js';
import { formatDay } from '../utils/dates.js';
import { normalizedDates, hasMissingTimes, affectedAnswers } from '../utils/planner.js';
import MonthCalendar from './MonthCalendar.jsx';
import DateTimeFields from './DateTimeFields.jsx';
import PlannerField from './PlannerField.jsx';
import ActionFeedback from './ActionFeedback.jsx';

export default function EditPollPanel({ poll, initiallyParticipating=false, onSave, onCancel, action }) {
  const [original]=useState(poll);
  const [title,setTitle]=useState(original.title);
  const [description,setDescription]=useState(original.description);
  const [dates,setDates]=useState(original.dates);
  const [enabled,setEnabled]=useState(original.timesEnabled ?? Object.values(original.dates).some(info=>info.time));
  const [defaultTime,setDefaultTime]=useState(original.defaultTime || '');
  const [participating,setParticipating]=useState(initiallyParticipating);
  const [confirm,setConfirm]=useState(false);
  const [error,setError]=useState('');
  const locked=action.locked;
  const datesLocked=poll.status==='closed';
  const nextDates=normalizedDates(dates,enabled);
  const removed=Object.keys(original.dates).filter(day=>!dates[day]);
  const added=Object.keys(dates).filter(day=>!original.dates[day]);
  const changed=Object.keys(dates).filter(day=>original.dates[day] && (original.dates[day].time || '')!==nextDates[day].time);
  const dateDirty=removed.length || added.length || changed.length || enabled!==(original.timesEnabled ?? Object.values(original.dates).some(info=>info.time)) || defaultTime!==(original.defaultTime || '');
  const changes={added,removed};
  if (title.trim()!==original.title) changes.title=title.trim();
  if (description.trim()!==original.description) changes.description=description.trim();
  if (participating!==initiallyParticipating) changes.participating=participating;
  if (dateDirty) Object.assign(changes,{timesEnabled:enabled,defaultTime:enabled?defaultTime:'',times:Object.fromEntries(Object.entries(nextDates).map(([day,info])=>[day,info.time]))});
  const answers=affectedAnswers(poll,removed,changed,initiallyParticipating&&!participating);
  function updateDates(next) {
    setDates(next);setConfirm(false);
    setError(current=>current==='validation.oneDate'&&!Object.keys(next).length?current:current==='times.required'&&hasMissingTimes(next,enabled)?current:'');
  }
  function toggle(day) {
    if (datesLocked || locked) return;
    const next={...dates};
    if(next[day])delete next[day];else next[day]={date:day,time:enabled?defaultTime:''};
    updateDates(next);
  }
  async function submit(event) {
    event.preventDefault();
    if(locked)return;
    if(!title.trim()){setError('validation.titleRequired');document.getElementById('edit-title')?.focus();return;}
    if(!Object.keys(dates).length)return setError('validation.oneDate');
    if(dateDirty && hasMissingTimes(dates,enabled))return setError('times.required');
    if(dateDirty && datesLocked)return setError('organizer.reopenForDates');
    if((answers>0 || (initiallyParticipating&&!participating)) && !confirm){setConfirm(true);return;}
    await onSave(changes);
  }
  return <section className="organizer-panel"><h2>{t('organizer.edit')}</h2>
    <form className="form" onSubmit={submit} noValidate aria-busy={locked || undefined}>
      <PlannerField id="edit-title" label={t('common.title')} value={title} disabled={locked} onChange={e=>{setTitle(e.target.value);if(e.target.value.trim())setError(current=>current==='validation.titleRequired'?'':current);}} />
      <PlannerField id="edit-description" label={t('common.description')} multiline rows={3} value={description} disabled={locked} onChange={e=>setDescription(e.target.value)} />
      <label className="participation-choice"><input type="checkbox" checked={participating} disabled={locked} onChange={e=>{setParticipating(e.target.checked);setConfirm(false);}} />{t('create.participate')}</label>
      {datesLocked && <p className="description">{t('organizer.datesLocked')}</p>}
      <div role="group" aria-label={t('organizer.possibleDates')}>
        <MonthCalendar disabled={locked||datesLocked} initialMonthFrom={Object.keys(original.dates).sort()[0]} renderDay={(day,number)=><button type="button" disabled={locked||datesLocked}
          aria-label={formatDay(day)} aria-pressed={Boolean(dates[day])} className={'calendar-day-button '+(dates[day]?'is-selected':'')} onClick={()=>toggle(day)}>{number}</button>} />
      </div>
      <DateTimeFields dates={dates} onChange={updateDates} enabled={enabled} onEnabled={value=>{setEnabled(value);setConfirm(false);if(!value)setError(current=>current==='times.required'?'':current);}} defaultTime={defaultTime}
        onDefaultTime={setDefaultTime} disabled={locked||datesLocked} />
      {(removed.length>0 || answers>0 || (initiallyParticipating&&!participating)) && <p className="description">{t('edit.impact',{dates:removed.length,answers})}{initiallyParticipating&&!participating?' '+t('organizer.removeOwnVotes'):''}</p>}
      {error && <p className="error" role="alert">{t(error)}</p>}
      <ActionFeedback action={action} />
      {confirm && <p className="description" role="status">{t('edit.confirmDestructive')}</p>}
      <div className="edit-actions"><button type="submit" disabled={locked}>{locked?t('action.saving'):confirm?t('common.confirm'):t('common.save')}</button>
        <button type="button" className="btn-secondary" disabled={locked} onClick={confirm?()=>setConfirm(false):onCancel}>{confirm?t('common.back'):t('common.cancel')}</button></div>
    </form>
  </section>;
}
