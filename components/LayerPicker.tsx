'use client';

import { LAYERS, LAYER_ORDER, type LayerId } from '@/lib/layers';

type Props = {
  active: LayerId;
  onChange: (id: LayerId) => void;
};

export default function LayerPicker({ active, onChange }: Props) {
  return (
    <div
      className="absolute left-4 w-56 bg-white/95 backdrop-blur rounded-md shadow-lg p-3 text-sm"
      style={{ marginTop: '60px', top: 0 }}
    >
      <div className="font-semibold text-zinc-900 mb-2 text-xs uppercase tracking-wide">
        Layer
      </div>
      <div className="space-y-1">
        {LAYER_ORDER.map((id) => {
          const def = LAYERS[id];
          const isActive = id === active;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                isActive
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              {def.shortLabel}
            </button>
          );
        })}
      </div>
      <div className="text-[11px] text-zinc-500 mt-2 leading-snug">
        {LAYERS[active].description}
      </div>
    </div>
  );
}
