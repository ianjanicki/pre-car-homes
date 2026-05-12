'use client';

import { useCallback, useState } from 'react';
import Map, { type BgProperties } from '@/components/Map';
import TractPanel from '@/components/TractPanel';
import Legend from '@/components/Legend';
import LayerPicker from '@/components/LayerPicker';
import { defaultLayer, type LayerId } from '@/lib/layers';

export default function Home() {
  const [selected, setSelected] = useState<BgProperties | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerId>(defaultLayer());
  const onSelect = useCallback((p: BgProperties | null) => setSelected(p), []);

  return (
    <div className="relative flex-1 min-h-screen w-full">
      <header className="absolute top-0 left-0 right-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-200 px-4 py-2 flex items-baseline gap-3">
        <h1 className="font-semibold text-zinc-900">Pre-Car Homes</h1>
        <p className="text-xs text-zinc-600 hidden sm:block">
          US block groups colored by a charm-weighted pre-car index. Toggle the
          source layer to see what&rsquo;s driving it. Click any area for detail.
        </p>
      </header>
      <div className="absolute inset-0 pt-10">
        <Map onSelect={onSelect} activeLayer={activeLayer} />
      </div>
      <LayerPicker active={activeLayer} onChange={setActiveLayer} />
      <Legend activeLayer={activeLayer} />
      <TractPanel bg={selected} activeLayer={activeLayer} onClose={() => setSelected(null)} />
    </div>
  );
}
