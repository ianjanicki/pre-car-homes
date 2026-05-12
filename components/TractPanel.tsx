'use client';

import { useEffect, useState } from 'react';
import type { TractProperties } from './Map';

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
  tract: TractProperties | null;
  onClose: () => void;
};

export default function TractPanel({ tract, onClose }: Props) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [listingsErr, setListingsErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tract) {
      setListings(null);
      setListingsErr(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setListings(null);
    setListingsErr(null);
    fetch(`/api/listings?geoid=${tract.geoid}`)
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
  }, [tract]);

  if (!tract) return null;

  const share = (tract.pre_1939_share * 100).toFixed(1);
  const band =
    tract.pre_1939_share >= 0.6
      ? 'Strongly pre-car'
      : tract.pre_1939_share >= 0.4
        ? 'Likely pre-car character'
        : tract.pre_1939_share >= 0.25
          ? 'Old-stock present'
          : tract.pre_1939_share >= 0.1
            ? 'Mixed era'
            : 'Post-war';

  return (
    <div
      className="absolute right-4 w-80 max-h-[calc(100vh-5rem)] overflow-y-auto bg-white/95 backdrop-blur rounded-md shadow-lg p-4 text-sm"
      style={{ marginTop: '60px', top: 0 }}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="font-semibold text-zinc-900">{tract.name}</div>
          <div className="text-xs text-zinc-500">GEOID {tract.geoid}</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-zinc-400 hover:text-zinc-700 px-1"
        >
          ×
        </button>
      </div>

      <div className="my-3">
        <div className="text-3xl font-semibold text-zinc-900 leading-none">{share}%</div>
        <div className="text-xs text-zinc-600 mt-1">{band}</div>
        <div className="text-xs text-zinc-500 mt-1">
          {tract.pre1939.toLocaleString()} of {tract.total.toLocaleString()} housing units built 1939 or earlier
        </div>
      </div>

      <div className="border-t border-zinc-200 pt-3">
        <div className="font-semibold text-zinc-800 mb-2">Sample listings (pre-1939)</div>
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
