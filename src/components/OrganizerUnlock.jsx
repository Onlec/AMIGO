import { t } from '../i18n/index.js';
import React, { useLayoutEffect, useRef } from 'react';
import CollapsibleSegment from './CollapsibleSegment.jsx';

export default function OrganizerUnlock({ onEdit, onChooseFinal, onReopen, finalDateChosen = false, authorized = false, active = true, editing = false, children }) {
  const editButton = useRef(null);
  const finalButton = useRef(null);
  const lastAction = useRef('edit');
  const wasEditing = useRef(false);

  useLayoutEffect(() => {
    if (wasEditing.current && !editing) {
      const target = lastAction.current === 'final' ? finalButton.current || editButton.current : editButton.current;
      target?.focus({ preventScroll: true });
    }
    wasEditing.current = editing;
  }, [editing]);

  return (
    <div className="form unlock-form">
      <CollapsibleSegment title={t('organizer.section')} open={active && authorized}>
        {editing ? children : <>
          <div className="edit-actions access-actions organizer-actions">
            <button ref={editButton} type="button" value="edit" disabled={!authorized} onClick={() => {
              lastAction.current = 'edit';
              onEdit();
            }}>{t('common.edit')}</button>
            {onChooseFinal && <button ref={finalButton} type="button" value="final" className="btn-secondary" disabled={!authorized} onClick={() => {
              lastAction.current = 'final';
              onChooseFinal();
            }}>{finalDateChosen ? t('organizer.changeDate') : t('organizer.chooseDate')}</button>}
          </div>
          {finalDateChosen && onReopen && <div className="organizer-reopen">
            <p className="description">{t('organizer.reopenExplanation')}</p>
            <button type="button" value="reopen" className="btn-secondary" disabled={!authorized} onClick={onReopen}>{t('organizer.reopen')}</button>
          </div>}
        </>}
      </CollapsibleSegment>
    </div>
  );
}
