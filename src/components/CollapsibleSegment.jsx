import React, { createContext, forwardRef, useCallback, useContext, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

const SegmentTransition = createContext(null);
export const useSegmentTransition = () => useContext(SegmentTransition);

const CollapsibleSegment = forwardRef(function CollapsibleSegment({ title, open, disabled = false, scrollable = false, children }, ref) {
  const root = useRef(null);
  const legend = useRef(null);
  const content = useRef(null);
  const task = useRef(null);
  const focusAfter = useRef(null);
  const [height, setHeight] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [focusRevision, setFocusRevision] = useState(0);
  const expanded = Boolean(open && phase !== 'closing' && phase !== 'swapping');

  const restoreFocus = useCallback(() => {
    const current = task.current;
    task.current = null;
    // Do not take focus back if the user has moved to another segment.
    if (current?.restore && document.activeElement === legend.current) {
      focusAfter.current = current;
    }
  }, []);

  const transitionContent = useCallback((commit, focusSelector = 'button:not(:disabled), input:not(:disabled)') => {
    if (task.current) return false;
    const shouldRestore = root.current?.contains(document.activeElement) || document.activeElement === document.body;
    if (!open || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const origin = document.activeElement;
      commit();
      if (open && shouldRestore) {
        focusAfter.current = { focusSelector, origin, direct: true };
        setFocusRevision(value => value + 1);
      }
      return true;
    }
    task.current = { commit, focusSelector, restore: shouldRestore };
    if (shouldRestore) legend.current?.focus({ preventScroll: true });
    setPhase('closing');
    return true;
  }, [open]);

  useImperativeHandle(ref, () => ({ transitionContent }), [transitionContent]);

  useLayoutEffect(() => {
    if (phase !== 'idle' || !focusAfter.current) return;
    const request = focusAfter.current;
    focusAfter.current = null;
    const active = document.activeElement;
    const canRestore = active === legend.current || (request.direct && (active === request.origin || active === document.body));
    if (canRestore && root.current?.dataset.open === 'true') {
      const target = root.current.querySelector(request.focusSelector) || legend.current;
      target?.focus({ preventScroll: true });
    }
  }, [phase, focusRevision]);

  useLayoutEffect(() => () => {
    task.current = null;
    focusAfter.current = null;
  }, []);

  useLayoutEffect(() => {
    if (phase === 'swapping') {
      task.current?.commit();
      const frame = requestAnimationFrame(() => {
        setHeight(content.current.getBoundingClientRect().height);
        setPhase('opening');
      });
      return () => cancelAnimationFrame(frame);
    }
    // transitionend is primary; the fallback also handles a motion preference
    // changing mid-transition, or a segment that was already at zero height.
    if (phase === 'closing' || phase === 'opening') {
      const timer = setTimeout(() => {
        if (phase === 'closing') setPhase('swapping');
        else { restoreFocus(); setPhase('idle'); }
      }, phase === 'closing' ? 300 : 400);
      return () => clearTimeout(timer);
    }
  }, [phase, restoreFocus]);

  useLayoutEffect(() => {
    const node = content.current;
    const measure = () => setHeight(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <fieldset ref={root} className={'collapsible-segment' + (scrollable ? ' collapsible-segment--scrollable' : '')}
      data-open={expanded} data-phase={phase} disabled={disabled || !expanded || phase !== 'idle'} aria-busy={phase !== 'idle' || undefined}
      style={{ '--segment-height': `${height}px` }}>
      <legend ref={legend} tabIndex={-1}>{title}</legend>
      <div className="collapsible-segment__body" aria-hidden={!expanded || phase !== 'idle'} inert={expanded && phase === 'idle' ? undefined : ''}
        onTransitionEnd={event => {
          if (event.target !== event.currentTarget || event.propertyName !== 'height') return;
          if (phase === 'closing') setPhase('swapping');
          else if (phase === 'opening') { restoreFocus(); setPhase('idle'); }
        }}
        role={scrollable ? 'region' : undefined} aria-label={scrollable ? title : undefined}
        tabIndex={scrollable && open ? 0 : undefined}>
        <div className="collapsible-segment__clip">
          <div ref={content} className="collapsible-segment__content">
            <SegmentTransition.Provider value={transitionContent}>{children}</SegmentTransition.Provider>
          </div>
        </div>
      </div>
    </fieldset>
  );
});

export default CollapsibleSegment;
