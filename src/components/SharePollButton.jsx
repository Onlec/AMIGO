import React, { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/index.js';
import { buildShareText } from '../utils/votes.js';
import { copyToClipboard } from '../utils/clipboard.js';

export default function SharePollButton({ poll, dates, votes }) {
  const root=useRef(null),trigger=useRef(null),timer=useRef(null),fallbackField=useRef(null);
  const [open,setOpen]=useState(false),[copied,setCopied]=useState(false),[fallback,setFallback]=useState('');
  const link=new URL('?poll='+new URLSearchParams(location.search).get('poll'),location.href).href;
  useEffect(()=>{
    if(!open)return;
    root.current.querySelector('.share-panel button')?.focus();
    const outside=event=>{if(!root.current.contains(event.target)){setOpen(false);setFallback('');}};
    const escape=event=>{if(event.key==='Escape'){setOpen(false);setFallback('');trigger.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  useEffect(()=>{if(fallback){fallbackField.current?.focus();fallbackField.current?.select();}},[fallback]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  async function copy(text){
    if(await copyToClipboard(text)){
      setOpen(false);setFallback('');setCopied(true);trigger.current?.focus();clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(false),2500);
    }else setFallback(text);
  }
  return <div className="share-poll" ref={root}>
    <button ref={trigger} type="button" className="copy-button copy-button--icon" aria-label={t(copied?'common.copied':'share.menuLabel')}
      title={t(copied?'common.copied':'share.menuLabel')} aria-expanded={open} aria-controls="poll-share-panel" onClick={()=>{setOpen(value=>!value);setFallback('');}}>
      <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {copied?<path d="m5 12 4 4L19 6"/>:<><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4"/></>}
      </svg></span><span aria-live="polite">{copied?t('common.copied'):t('share.menuLabel')}</span>
    </button>
    {open&&<div id="poll-share-panel" className="share-panel" role="dialog" aria-label={t('share.menuLabel')}>
      <button type="button" onClick={()=>copy(link)}>{t('share.copyInvite')}</button>
      <button type="button" className="btn-secondary" onClick={()=>copy(buildShareText(poll,dates,votes,link))}>{t('share.copyStanding')}</button>
      <p className="description">{t('share.includesNames')}</p>
      {fallback&&<label>{t('share.manualCopy')}<textarea ref={fallbackField} readOnly rows={4} value={fallback} onFocus={e=>e.target.select()}/></label>}
    </div>}
  </div>;
}
