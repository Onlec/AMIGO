import { useEffect, useState } from 'react';

// Abonneert op één Gun-node (bv. gun.get('polls').get(pollId)) en houdt
// de laatste waarde als React state bij. `node` moet stabiel zijn tussen
// renders (bv. via useMemo), anders wordt er steeds opnieuw ge(de)abonneerd.
export function useGunNode(node) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!node) return undefined;

    const handler = (value) => {
      if (!value) {
        setData(null);
        return;
      }
      // Gun voegt een intern "_" metadata-veld toe (soul/graph-info);
      // dat willen we niet in onze React state of UI terugzien.
      const { _, ...clean } = value;
      setData(clean);
    };

    node.on(handler);

    return () => {
      node.off();
    };
  }, [node]);

  return data;
}
