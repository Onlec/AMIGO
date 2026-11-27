import React, { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/index.js';
import { usePlannerAction } from '../data/actions.js';
import { readDraft, saveDraft, clearDraft } from '../data/draft.js';
import { hashPassword } from '../utils/password.js';
import { rememberVoterSession, voterSession } from '../data/voterSession.js';
import { normalizedDates, hasMissingTimes } from '../utils/planner.js';
import MonthCalendar from './MonthCalendar.jsx';
import PlannerField from './PlannerField.jsx';
import DateTimeFields from './DateTimeFields.jsx';
import ActionFeedback from './ActionFeedback.jsx';

const empty = () => ({ title:'', description:'', organizerName:'', participating:true, selectedDates:{}, timesEnabled:false, defaultTime:'' });
export default function CreatePollPage({ onCreated }) {
  const [form, setForm] = useState(() => ({ ...empty(), ...readDraft() }));
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [preparing, setPreparing] = useState(false);
  const [restored, setRestored] = useState(() => Boolean(readDraft()?.title || readDraft()?.organizerName || Object.keys(readDraft()?.selectedDates || {}).length));
  const saved = useRef(false);
  const action = usePlannerAction('create', (result,command) => {
    saved.current=true;clearDraft();rememberVoterSession(command.id,result.session);
    onCreated(command.id,new URL('?poll='+command.id,location.href).href);
  });
  const locked = preparing || action.locked;
  const change = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => {
      const next={...current};
      if((key==='title'||key==='organizerName') && value.trim())next[key]='';
      if(key==='selectedDates' && next.selectedDates){
        next.selectedDates=!Object.keys(value).length?'validation.oneDate':hasMissingTimes(value,form.timesEnabled)?'times.required':'';
      }
      if(key==='timesEnabled' && !value && Object.keys(form.selectedDates).length)next.selectedDates='';
      return next;
    }); action.clearError();
  };
  useEffect(() => {
    if (saved.current) return;
    const timer = setTimeout(() => saveDraft(form), 250);
    const persist = () => { if (!saved.current) saveDraft(form); };
    window.addEventListener('pagehide', persist);
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', persist); };
  }, [form]);
  useEffect(() => { if (restored) { const timer=setTimeout(() => setRestored(false),2500); return () => clearTimeout(timer); } },[restored]);
  function toggleDate(day) {
    const dates = { ...form.selectedDates };
    if (dates[day]) delete dates[day]; else dates[day] = { time: form.timesEnabled ? form.defaultTime : '' };
    change('selectedDates', dates);
  }
  async function submit(event) {
    event.preventDefault();
    if (locked) return;
    const invalid = {};
    if (!form.title.trim()) invalid.title='validation.titleRequired';
    if (!form.organizerName.trim()) invalid.organizerName='validation.organizerRequired';
    if (!password) invalid.password='validation.organizerPassword';
    if (!Object.keys(form.selectedDates).length) invalid.selectedDates='validation.oneDate';
    else if (hasMissingTimes(form.selectedDates, form.timesEnabled)) invalid.selectedDates='times.required';
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      document.getElementById({title:'create-title',organizerName:'create-name',password:'create-password',selectedDates:'create-dates'}[Object.keys(invalid)[0]])?.focus();
      return;
    }
    setPreparing(true);
    try {
      const id=crypto.randomUUID();
      const proof=await hashPassword(id,password);
      const credentials=form.participating ? await voterSession(id,crypto.randomUUID(),password) : null;
      await action.run(id,'createPoll',{
        title:form.title.trim(),description:form.description.trim(),organizerName:form.organizerName.trim(),proof,
        dates:normalizedDates(form.selectedDates,form.timesEnabled),timesEnabled:form.timesEnabled,
        defaultTime:form.timesEnabled ? form.defaultTime : '',
        ...(credentials && {voter:credentials.voter,voterProof:credentials.proof}),
      }, () => {
        saved.current=true; clearDraft();
        rememberVoterSession(id,{...(credentials || {voter:null}),name:form.organizerName.trim(),organizer:true});
        onCreated(id,new URL('?poll='+id,location.href).href);
      });
    } finally { setPreparing(false); }
  }
  function resetDraft() { clearDraft(); setForm(empty());setPassword('');setErrors({});setRestored(false); }
  return <div className="page planner-page">
    <div className="lab eyebrow">{t('create.eyebrow')}</div><h1>{t('create.heading')}</h1>
    {restored && <p role="status" className="draft-notice">{t('draft.restored')} <button type="button" className="text-button" onClick={resetDraft}>{t('draft.clear')}</button></p>}
    <form onSubmit={submit} className="form" noValidate aria-busy={locked || undefined}>
      <fieldset disabled={locked}><legend>{t('create.settings')}</legend><div className="planner-fields">
        <PlannerField id="create-title" label={t('common.title')} value={form.title} onChange={e=>change('title',e.target.value)} error={errors.title}
          onBlur={()=>{if(!form.title.trim())setErrors(current=>({...current,title:'validation.titleRequired'}));}} placeholder={t('create.exampleTitle')} />
        <PlannerField id="create-description" label={t('create.descriptionOptional')} multiline rows={3} value={form.description} onChange={e=>change('description',e.target.value)} />
      </div></fieldset>
      <fieldset disabled={locked}><legend>{t('create.organizer')}</legend><div className="planner-fields">
        <PlannerField id="create-name" label={t('create.organizerName')} autoComplete="username" value={form.organizerName} onChange={e=>change('organizerName',e.target.value)} error={errors.organizerName}
          onBlur={()=>{if(!form.organizerName.trim())setErrors(current=>({...current,organizerName:'validation.organizerRequired'}));}} />
        <PlannerField id="create-password" label={t('login.plannerPassword')} type="password" autoComplete="new-password" value={password} help="login.organizerHelp" error={errors.password}
          onChange={e=>{setPassword(e.target.value);if(e.target.value)setErrors(current=>({...current,password:''}));}}
          onBlur={()=>{if(!password)setErrors(current=>({...current,password:'validation.organizerPassword'}));}} />
        <label className="participation-choice"><input type="checkbox" checked={form.participating} onChange={e=>change('participating',e.target.checked)} />{t('create.participate')}</label>
      </div></fieldset>
      <fieldset disabled={locked} id="create-dates" tabIndex={-1}><legend>{t('create.dates')}</legend>
        <MonthCalendar renderDay={(day,number)=><button type="button" className={'calendar-day-button '+(form.selectedDates[day]?'is-selected':'')} aria-pressed={Boolean(form.selectedDates[day])} onClick={()=>toggleDate(day)}>{number}</button>} />
        <p className="selected-dates-label">{Object.keys(form.selectedDates).length ? t('create.selectedCount',{count:Object.keys(form.selectedDates).length}) : t('validation.oneDate')}</p>
        <DateTimeFields dates={form.selectedDates} onChange={dates=>change('selectedDates',dates)} enabled={form.timesEnabled} onEnabled={value=>change('timesEnabled',value)}
          defaultTime={form.defaultTime} onDefaultTime={value=>change('defaultTime',value)} disabled={locked} />
        {errors.selectedDates && <p className="error" role="alert">{t(errors.selectedDates)}</p>}
      </fieldset>
      <ActionFeedback action={action} />
      <div className="edit-actions planner-page-actions"><button type="submit" disabled={locked}>{locked?t('common.creating'):t('common.create')}</button></div>
    </form>
  </div>;
}
