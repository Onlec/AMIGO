import React, { useLayoutEffect, useRef, useState } from 'react';
import { hashPassword } from '../utils/password.js';
import CollapsibleSegment from './CollapsibleSegment.jsx';

export default function OrganizerUnlock({ pollId, onUnlock, onEdit, onChooseFinal, authorized = false, active = true, editing = false, children }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [pendingAction, setPendingAction] = useState('edit');
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

  async function handleSubmit(event) {
    event.preventDefault();
    const action = event.nativeEvent.submitter?.value === 'final' ? 'final' : 'edit';
    const proceed = action === 'final' ? onChooseFinal : onEdit;
    lastAction.current = action;
    if (authorized) {
      proceed();
      return;
    }
    setChecking(true);
    setPendingAction(action);
    setError('');
    try {
      await onUnlock(await hashPassword(pollId, password));
      setPassword('');
      proceed();
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="form unlock-form">
      <CollapsibleSegment title="03 — Prikker beheren" open={active} disabled={checking}>
        {editing ? children : (
          <form onSubmit={handleSubmit}>
            <div className="access-row">
              <div className="access-fields">
                {authorized ? <p>Je bent aangemeld als organisator.</p> : (
                  <label>
                    Pollwachtwoord
                    <input
                      type="password" autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                )}
              </div>
              <div className="edit-actions access-actions organizer-actions">
                <button ref={editButton} type={authorized ? 'button' : 'submit'} value="edit" onClick={() => {
                  lastAction.current = 'edit';
                  if (authorized) onEdit();
                }}
                  disabled={checking || (!authorized && !password)}>
                  {checking && pendingAction === 'edit' ? 'Controleren...' : 'Bewerken'}
                </button>
                {onChooseFinal && <button ref={finalButton} type={authorized ? 'button' : 'submit'} value="final" className="btn-secondary" onClick={() => {
                  lastAction.current = 'final';
                  if (authorized) onChooseFinal();
                }} disabled={checking || (!authorized && !password)}>
                  {checking && pendingAction === 'final' ? 'Controleren...' : 'Einddatum kiezen'}
                </button>}
              </div>
            </div>
            {!authorized && error && <p className="error" role="alert">{error}</p>}
          </form>
        )}
      </CollapsibleSegment>
    </div>
  );
}
