'use client';

import { useEffect, useState } from 'react';
import type { BgProperties } from './Map';
import { LAYERS, type LayerId } from '@/lib/layers';

export type Listing = {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  yearBuilt?: number;
  price?: number;
  url?: string;
  source: 'redfin' | 'realtor';
};

type Props = {
  bg: BgProperties | null;
  activeLayer: LayerId;
  onClose: () => void;
};

const BREAKDOWN_LAYERS: LayerId[] = [
  'pre_1939_share',
  'small_res_share',
  'owner_occ_share',
  'vacancy_rate',
];

export default function TractPanel({ bg, activeLayer, onClose }: Props) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [listingsErr, setListingsErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!bg) {
      setListings(null);
      setListingsErr(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setListings(null);
    setListingsErr(null);
    fetch(`/api/listings?geoid=${bg.geoid}`)
      .then((r) => (r.ok ? r.json() : r.text().then((t) => Promise.reject(t))))
      .then((data: { listings: Listing[] }) => {
        if (cancelled) return;
        setListings(data.listings);
      })
      .catch((e) => {
        if (cancelled) return;
        setListingsErr(typeof e === 'string' ? e : String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [bg]);

  if (!bg) return null;

  const activeDef = LAYERS[activeLayer];
  const propVal = bg[activeDef.property as keyof BgProperties] as number;

  return (
    <div
      className="absolute right-4 w-80 max-h-[calc(100vh-5rem)] overflow-y-auto bg-white/95 backdrop-blur rounded-md shadow-lg p-4 text-sm"
      style={{ marginTop: '60px', top: 0 }}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="font-semibold text-zinc-900">{bg.name}</div>
          <div className="text-xs text-zinc-500">GEOID {bg.geoid}</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-zinc-400 hover:text-zinc-700 px-1 text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="my-3">
        <div className="text-3xl font-semibold text-zinc-900 leading-none">
          {activeDef.format(propVal ?? 0)}
        </div>
        <div className="text-xs text-zinc-600 mt-1">{activeDef.shortLabel}</div>
        <div className="text-xs text-zinc-500 mt-1">
          {bg.pre1939.toLocaleString()} of {bg.total.toLocaleString()} housing units built 1939 or earlier
        </div>
      </div>

      <div className="border-t border-zinc-200 pt-3 mb-3">
        <div className="font-semibold text-zinc-800 mb-2 text-xs uppercase tracking-wide">
          Composite breakdown
        </div>
        <div className="space-y-1.5">
          {BREAKDOWN_LAYERS.map((id) => {
            const d = LAYERS[id];
            const v = (bg[d.property as keyof BgProperties] as number) ?? 0;
            // For vacancy, "good" is low; show a different visual cue.
            const inverted = id === 'vacancy_rate';
            const fillFrac = inverted ? 1 - Math.min(v, 0.5) / 0.5 : Math.min(v, 1);
            return (
              <div key={id} className="text-xs">
                <div className="flex justify-between text-zinc-600">
                  <span>{d.shortLabel}</span>
                  <span className="font-mono text-zinc-900">{d.format(v)}</span>
                </div>
                <div className="h-1.5 mt-0.5 bg-zinc-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-zinc-700"
                    style={{ width: `${fillFrac * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-[11px] text-zinc-500 mt-2 leading-snug">
          Composite score: {bg.composite_score.toFixed(3)}
        </div>
      </div>

      <div className="border-t border-zinc-200 pt-3">
        <div className="font-semibold text-zinc-800 mb-2 text-xs uppercase tracking-wide">
          Sample listings (pre-1939)
        </div>
        {loading ? (
          <div className="text-zinc-500 text-xs">Loading…</div>
        ) : listingsErr ? (
          <div className="text-zinc-500 text-xs">
            Couldn&rsquo;t fetch listings ({listingsErr.slice(0, 80)}).
          </div>
        ) : listings && listings.length === 0 ? (
          <div className="text-zinc-500 text-xs">No qualifying listings on market right now.</div>
        ) : (
          <ul className="space-y-2">
            {(listings ?? []).map((l, i) => (
              <li key={i} className="text-xs">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-zinc-900 hover:underline"
                >
                  {l.address}
                </a>
                <div className="text-zinc-500">
                  {l.yearBuilt ? `Built ${l.yearBuilt}` : 'Year n/a'}
                  {l.price ? ` · $${l.price.toLocaleString()}` : ''}
                  {l.zip ? ` · ${l.zip}` : ''}
                  {' · '}
                  <span className="uppercase text-[10px] text-zinc-400">{l.source}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
