'use client';

import { LAYERS, type LayerId } from '@/lib/layers';

type Props = {
  activeLayer: LayerId;
};

export default function Legend({ activeLayer }: Props) {
  const def = LAYERS[activeLayer];
  return (
    <div className="absolute bottom-6 left-4 bg-white/95 backdrop-blur rounded-md shadow-md p-3 text-xs font-sans max-w-xs">
      <div className="font-semibold text-zinc-800 mb-1">{def.label}</div>
      <div className="flex items-center gap-0">
        {def.ramp.map(([value, color]) => (
          <div key={value} className="w-8 h-3" style={{ background: color }} />
        ))}
      </div>
      <div
        className="flex justify-between mt-1 text-zinc-600"
        style={{ width: `${def.ramp.length * 2}rem` }}
      >
        {def.ramp.map(([value]) => (
          <span key={value} style={{ width: '2rem', textAlign: 'left' }}>
            {def.format(value)}
          </span>
        ))}
      </div>
      <div className="text-zinc-500 mt-2 leading-snug">
        Source: US Census ACS 2023 5-yr, block-group level.
      </div>
    </div>
  );
}
