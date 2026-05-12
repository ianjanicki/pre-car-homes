'use client';

import { LAYERS, type LayerId } from '@/lib/layers';

type Props = {
  activeLayer: LayerId;
};

export default function Legend({ activeLayer }: Props) {
  const def = LAYERS[activeLayer];
  const stops = def.ramp;
  const minVal = stops[0][0];
  const maxVal = stops[stops.length - 1][0];
  // Build a CSS linear gradient that mirrors the MapLibre interpolation.
  // Normalize each stop's position to [0,100] across the value range.
  const gradient = stops
    .map(([v, c]) => {
      const pct = maxVal === minVal ? 0 : ((v - minVal) / (maxVal - minVal)) * 100;
      return `${c} ${pct}%`;
    })
    .join(', ');

  return (
    <div
      className="absolute bottom-6 left-4 bg-white/95 backdrop-blur rounded-md shadow-md p-3 text-xs font-sans"
      style={{ width: '224px' }}
    >
      <div className="font-semibold text-zinc-800 mb-2 leading-tight">{def.label}</div>
      <div
        className="h-3 rounded-sm border border-zinc-200"
        style={{ background: `linear-gradient(to right, ${gradient})` }}
      />
      <div className="flex justify-between mt-1 text-zinc-600 font-mono">
        <span>{def.format(minVal)}</span>
        <span>{def.format(maxVal)}</span>
      </div>
    </div>
  );
}
