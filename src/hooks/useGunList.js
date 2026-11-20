import { useEffect, useState } from 'react';

// Abonneert op alle directe children van `node` (bv. gun.get('polls').get(id).get('dates'))
// en houdt ze bij als { [childId]: data }. Nieuwe children verschijnen live,
// zonder dat de component opnieuw hoeft te mounten.
export function useGunList(node) {
  const [items, setItems] = useState({});

  useEffect(() => {
    if (!node) return undefined;

    // Bij het wisselen van node (bv. andere pollId) beginnen we weer leeg,
    // anders blijven oude entries van een vorige poll zichtbaar.
    setItems({});

    const handler = (value, key) => {
      setItems((prev) => {
        if (value === null || value === undefined) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        const { _, ...clean } = value;
        return { ...prev, [key]: clean };
      });
    };

    node.map().on(handler);

    return () => {
      node.off();
    };
  }, [node]);

  return items;
}
