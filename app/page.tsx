'use client';

import { useCallback, useState } from 'react';
import Map, { type TractProperties } from '@/components/Map';
import TractPanel from '@/components/TractPanel';
import Legend from '@/components/Legend';

export default function Home() {
  const [selected, setSelected] = useState<TractProperties | null>(null);
  const onSelect = useCallback((p: TractProperties | null) => setSelected(p), []);

  return (
    <div className="relative flex-1 min-h-screen w-full">
      <header className="absolute top-0 left-0 right-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-200 px-4 py-2 flex items-baseline gap-3">
        <h1 className="font-semibold text-zinc-900">Pre-Car Homes</h1>
        <p className="text-xs text-zinc-600 hidden sm:block">
          US neighborhoods by share of housing built 1939 or earlier — a proxy for
          pre-automobile design. Click a tract for detail.
        </p>
      </header>
      <div className="absolute inset-0 pt-10">
        <Map onSelect={onSelect} />
      </div>
      <Legend />
      <TractPanel tract={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
