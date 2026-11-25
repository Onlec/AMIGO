import React, { useLayoutEffect, useRef } from 'react';
import CollapsibleSegment from './CollapsibleSegment.jsx';

export default function OrganizerUnlock({ onEdit, onChooseFinal, authorized = false, signedIn = false, active = true, editing = false, children }) {
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
      <CollapsibleSegment title="04 — Prikker beheren" open={active}>
        {editing ? children : (
          <div className="access-row">
            <div className="access-fields">
              <p>{authorized ? 'Je bent aangemeld als organisator.'
                : signedIn ? 'Alleen de organisator kan deze prikker beheren.'
                : 'Meld je aan bij Jouw gegevens om deze prikker te beheren.'}</p>
            </div>
            <div className="edit-actions access-actions organizer-actions">
              <button ref={editButton} type="button" value="edit" disabled={!authorized} onClick={() => {
                lastAction.current = 'edit';
                onEdit();
              }}>Bewerken</button>
              {onChooseFinal && <button ref={finalButton} type="button" value="final" className="btn-secondary" disabled={!authorized} onClick={() => {
                lastAction.current = 'final';
                onChooseFinal();
              }}>Einddatum kiezen</button>}
            </div>
          </div>
        )}
      </CollapsibleSegment>
    </div>
  );
}
