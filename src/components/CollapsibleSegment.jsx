import React, { createContext, forwardRef, useCallback, useContext, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

const SegmentTransition = createContext(null);
export const useSegmentTransition = () => useContext(SegmentTransition);

const CollapsibleSegment = forwardRef(function CollapsibleSegment({ title, open, disabled = false, children }, ref) {
  const root = useRef(null);
  const legend = useRef(null);
  const content = useRef(null);
  const body = useRef(null);
  const task = useRef(null);
  const focusAfter = useRef(null);
  const [height, setHeight] = useState(0);
  const [frameVisible, setFrameVisible] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [focusRevision, setFocusRevision] = useState(0);
  const expanded = Boolean(open && (phase === 'idle' || phase === 'opening'));

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
      const target = (typeof request.focusSelector === 'function'
        ? request.focusSelector() : root.current.querySelector(request.focusSelector)) || legend.current;
      target?.focus({ preventScroll: true });
    }
  }, [phase, focusRevision]);

  useLayoutEffect(() => () => {
    task.current = null;
    focusAfter.current = null;
  }, []);

  useLayoutEffect(() => {
    if (phase === 'closed') {
      // A visible rest at zero height separates the two S-curve movements.
      const timer = setTimeout(() => setPhase('swapping'), 80);
      return () => clearTimeout(timer);
    }
    if (phase === 'swapping') {
      task.current?.commit();
      let openingFrame;
      const frame = requestAnimationFrame(() => {
        setHeight(content.current.getBoundingClientRect().height);
        // Paint the new content at zero height with transitions disabled first.
        // Opening then starts a fresh curve rather than reversing a transition.
        openingFrame = requestAnimationFrame(() => setPhase('opening'));
      });
      return () => { cancelAnimationFrame(frame); cancelAnimationFrame(openingFrame); };
    }
    // transitionend is primary; the fallback also handles a motion preference
    // changing mid-transition, or a segment that was already at zero height.
    if (phase === 'closing' || phase === 'opening') {
      const timer = setTimeout(() => {
        if (phase === 'closing') setPhase('closed');
        else { restoreFocus(); setPhase('idle'); }
      }, phase === 'closing' ? 300 : 400);
      return () => clearTimeout(timer);
    }
  }, [phase, restoreFocus]);

  useLayoutEffect(() => {
    const node = content.current;
    const measure = () => setHeight(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === node) measure();
        else setFrameVisible(entry.contentRect.height > 0);
      }
    });
    observer.observe(node);
    observer.observe(body.current);
    return () => observer.disconnect();
  }, []);

  return (
    <fieldset ref={root} className="collapsible-segment"
      data-open={expanded} data-frame={expanded || frameVisible} data-phase={phase} disabled={disabled || !expanded || phase !== 'idle'} aria-busy={phase !== 'idle' || undefined}
      style={{ '--segment-height': `${height}px` }}>
      <legend ref={legend} tabIndex={-1}>{title}</legend>
      <div ref={body} className="collapsible-segment__body" aria-hidden={!expanded || phase !== 'idle'} inert={expanded && phase === 'idle' ? undefined : ''}
        onTransitionEnd={event => {
          if (event.target !== event.currentTarget || event.propertyName !== 'height') return;
          if (phase === 'closing') setPhase('closed');
          else if (phase === 'opening') { restoreFocus(); setPhase('idle'); }
        }}
      >
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
