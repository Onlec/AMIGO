import React, { useLayoutEffect, useRef, useState } from 'react';

export default function CollapsibleSegment({ title, open, disabled = false, scrollable = false, children }) {
  const content = useRef(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const node = content.current;
    const measure = () => setHeight(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <fieldset className={'collapsible-segment' + (scrollable ? ' collapsible-segment--scrollable' : '')} data-open={Boolean(open)} disabled={disabled || !open}
      style={{ '--segment-height': `${height}px` }}>
      <legend>{title}</legend>
      <div className="collapsible-segment__body" aria-hidden={!open} inert={open ? undefined : ''}
        role={scrollable ? 'region' : undefined} aria-label={scrollable ? title : undefined}
        tabIndex={scrollable && open ? 0 : undefined}>
        <div className="collapsible-segment__clip">
          <div ref={content} className="collapsible-segment__content">{children}</div>
        </div>
      </div>
    </fieldset>
  );
}
