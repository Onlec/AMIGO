import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { t, message, translateMessage } from '../i18n/index.js';
import { errorMessage } from '../i18n/errors.js';
import { usePlannerAction } from '../data/actions.js';
import { submitVote, votingStatus, watchVoting } from '../data/onlineVoting.js';
import { voterSession } from '../data/voterSession.js';
import { hashPassword } from '../utils/password.js';
import { parseVotes } from '../utils/votes.js';
import VoteCalendar from './VoteCalendar.jsx';
import CollapsibleSegment from './CollapsibleSegment.jsx';
import ActionFeedback from './ActionFeedback.jsx';

const normalize=name=>name.trim().toLowerCase();
export default function VoterForm({ pollId, dates, participants, session, onSelect, active=true, votingOpen=true, readOnly=false }) {
  const [name,setName]=useState(session?.name||'');
  const [password,setPassword]=useState('');
  const [help,setHelp]=useState(false);
  const [preparing,setPreparing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState(null);
  const [complete,setComplete]=useState(false);
  const segment=useRef(null),availability=useRef(null),votePending=useRef(false),timer=useRef(null),completionTimer=useRef(null);
  const action=usePlannerAction('login:'+pollId, result=>{
    segment.current.transitionContent(()=>{onSelect(result.session);setName(result.session.name);setPassword('');setHelp(false);},
      ()=>availability.current?.querySelector('.voter-ballot'));
  });
  const connection=useSyncExternalStore(useCallback(listener=>watchVoting(pollId,listener),[pollId]),useCallback(()=>votingStatus(pollId),[pollId]));
  const [id]=Object.entries(participants).find(([,person])=>normalize(person.name)===normalize(name))||[];
  const person=participants[session?.voter];
  const votingSignedIn=Boolean(session&&person);
  const signedIn=votingSignedIn||Boolean(session?.organizer);
  const availabilityOpen=active&&votingOpen&&votingSignedIn&&!readOnly;
  const locked=preparing||action.locked;
  const myVotes=parseVotes(person?.votesJson);
  const remaining=Object.keys(dates).filter(day=>!myVotes[day]||myVotes[day]==='none').length;
  useEffect(()=>()=>{clearTimeout(timer.current);clearTimeout(completionTimer.current);},[]);
  useEffect(()=>{if(connection==='ready')setError(current=>current?.key?.startsWith('vote.')?'':current);},[connection]);
  useEffect(()=>{if(remaining>0)setComplete(false);},[remaining]);
  function reset(){
    onSelect(null);
    segment.current.transitionContent(()=>{setName('');setPassword('');setError('');setFeedback(null);},'.voter-credentials input');
  }
  async function signIn(event){
    event.preventDefault();if(locked)return;setError('');
    if(!name.trim()){setError(message('validation.nameRequired'));document.getElementById('voter-name')?.focus();return;}
    if(!password){setError(message('validation.passwordRequired'));document.getElementById('voter-password')?.focus();return;}
    setPreparing(true);
    try{
      const credentials=await voterSession(pollId,id||crypto.randomUUID(),password);
      const organizerProof=await hashPassword(pollId,password);
      await action.run(pollId,'signIn',{...credentials,name:name.trim(),organizerProof},result=>{
        const verified={...result.session,...(result.session?.voter&&{proof:result.session.proof||credentials.proof})};
        segment.current.transitionContent(()=>{onSelect(verified);setName(verified.name);setPassword('');setHelp(false);},
          ()=>verified.voter&&votingOpen?availability.current?.querySelector('.voter-ballot'):document.querySelector('.voter-credentials button'));
      });
    }finally{setPreparing(false);}
  }
  async function castVote(day,value){
    if(!votingSignedIn||!votingOpen||readOnly||votePending.current)return;
    if(connection!=='ready')return setError(message('vote.connectionRequired'));
    setError('');setFeedback(null);setSaving(true);votePending.current=true;clearTimeout(timer.current);
    timer.current=setTimeout(()=>setFeedback({day,phase:'saving'}),300);
    try{
      const result=await submitVote(pollId,{voter:session.voter,proof:session.proof,changes:{[day]:value},expectedTimes:{[day]:dates[day].time||''}});
      clearTimeout(timer.current);setFeedback({day,phase:'saved'});
      timer.current=setTimeout(()=>setFeedback(null),2500);
      const answers=result?parseVotes(result.votes[session.voter]?.votesJson):{...myVotes,[day]:value};
      if(Object.keys(result?.dates||dates).every(date=>answers[date]&&answers[date]!=='none')){
        setComplete(true);clearTimeout(completionTimer.current);completionTimer.current=setTimeout(()=>setComplete(false),2500);
      }
    }catch(err){clearTimeout(timer.current);setFeedback(null);setError(errorMessage(err));}
    finally{votePending.current=false;setSaving(false);}
  }
  return <div className="form">
    <CollapsibleSegment ref={segment} title={t('login.section')} open={active}>
      <form onSubmit={signIn} noValidate aria-busy={locked||undefined}>
        <fieldset className="voter-credentials" disabled={locked}>
          <div className={'access-row'+(!signedIn?' access-row--login':'')}><div className="access-fields">
            {signedIn?<p>{t('login.signedIn')} <strong>{person?.name||session.name}</strong>{session.organizer?t('login.organizerSuffix'):''}.</p>:<>
              <label><span className="access-field-caption">{t('common.name')}</span><input id="voter-name" autoComplete="username" value={name} onChange={e=>{setName(e.target.value);setPassword('');setError('');action.clearError();}} /></label>
              <label><span className="access-field-caption">{t('common.password')}</span><input id="voter-password" type="password" autoComplete="current-password" value={password}
                aria-describedby={help?'voter-password-help':undefined} onFocus={()=>setHelp(true)} onBlur={()=>setHelp(false)} onChange={e=>{setPassword(e.target.value);setError('');action.clearError();}} /></label>
            </>}
          </div><div className="edit-actions access-actions">
            {signedIn?<button type="button" className="btn-secondary" disabled={saving||locked} onClick={reset}>{t('login.signOut')}</button>
              :<button type="submit" disabled={locked}>{locked?t('login.signingIn'):t('login.signIn')}</button>}
          </div></div>
          {!signedIn&&help&&<p id="voter-password-help" className="field-help">{t('login.passwordHelp')}</p>}
        </fieldset>
      </form>
      {!signedIn&&<ActionFeedback action={action} login />}
      {!signedIn&&error&&<p role="alert" className="error">{translateMessage(error)}</p>}
    </CollapsibleSegment>
    <div ref={availability} className="voter-availability" data-open={availabilityOpen}>
      <CollapsibleSegment title={t('vote.section')} open={availabilityOpen}>
        <div className="voter-ballot" role="region" aria-label={t('vote.availability')} tabIndex={-1} aria-busy={saving||connection==='checking'||undefined}>
          <VoteCalendar key={session?.voter||'guest'} dates={dates} myVotes={myVotes} onVote={castVote} feedback={feedback} remaining={remaining} complete={complete}
            disabled={readOnly||connection!=='ready'||saving} />
        </div>
        {feedback&&<span className="sr-only" role="status">{t(feedback.phase==='saving'?'action.saving':'vote.saved')}</span>}
        {signedIn&&(error?<p role="alert" className="error">{translateMessage(error)}</p>
          :!readOnly&&connection!=='ready'&&connection!=='saving'&&<p role="status" className="description">{t(connection==='checking'?'vote.checking':'vote.connectionRequired')}</p>)}
      </CollapsibleSegment>
    </div>
  </div>;
}
