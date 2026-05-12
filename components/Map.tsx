'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { LAYERS, type LayerId } from '@/lib/layers';

export type BgProperties = {
  geoid: string; // 12-digit block group
  name: string;
  total: number;
  pre1939: number;
  built1940to1949: number;
  pre_1939_share: number;
  small_res_share: number;
  sfh_detached_share: number;
  sfh_attached_share: number;
  multifamily_large_share: number;
  owner_occ_share: number;
  vacancy_rate: number;
  walkability: number;
  intersection_density: number;
  nrhp_district: 0 | 1;
  composite_score: number;
};

type Props = {
  onSelect: (props: BgProperties | null) => void;
  activeLayer: LayerId;
};

function buildFillColor(layerId: LayerId): maplibregl.ExpressionSpecification {
  const def = LAYERS[layerId];
  const stops = def.ramp.flat();
  return ['interpolate', ['linear'], ['get', def.property], ...stops] as maplibregl.ExpressionSpecification;
}

export default function Map({ onSelect, activeLayer }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Update fill color when activeLayer changes (without recreating the map).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded() || !map.getLayer('bg-fill')) return;
    map.setPaintProperty('bg-fill', 'fill-color', buildFillColor(activeLayer));
  }, [activeLayer]);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [-77, 39.5],
      zoom: 4,
    });
    mapRef.current = map;
    if (typeof window !== 'undefined') {
      (window as unknown as { __map?: maplibregl.Map }).__map = map;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', async () => {
      try {
        const res = await fetch('/data/bg.geojson');
        if (!res.ok) throw new Error(`bg.geojson HTTP ${res.status}`);
        const data = (await res.json()) as GeoJSON.FeatureCollection;

        map.addSource('bg', { type: 'geojson', data, promoteId: 'geoid' });

        map.addLayer({
          id: 'bg-fill',
          type: 'fill',
          source: 'bg',
          paint: {
            'fill-color': buildFillColor(activeLayer),
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.9,
              0.7,
            ],
          },
        });

        map.addLayer({
          id: 'bg-line',
          type: 'line',
          source: 'bg',
          paint: {
            'line-color': '#444',
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.1, 14, 0.6],
            'line-opacity': 0.4,
          },
        });

        // Fit map to data bounds on first load.
        const bounds = new maplibregl.LngLatBounds();
        let n = 0;
        for (const f of data.features) {
          if (!f.geometry) continue;
          const coords = f.geometry.type === 'MultiPolygon'
            ? f.geometry.coordinates.flat(2)
            : f.geometry.type === 'Polygon'
              ? f.geometry.coordinates.flat(1)
              : [];
          for (const c of coords) {
            bounds.extend(c as [number, number]);
            n++;
          }
        }
        if (n > 0) map.fitBounds(bounds, { padding: 40, duration: 0 });

        let hoveredId: string | number | null = null;
        map.on('mousemove', 'bg-fill', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const f = e.features?.[0];
          if (!f) return;
          if (hoveredId !== null) {
            map.setFeatureState({ source: 'bg', id: hoveredId }, { hover: false });
          }
          hoveredId = f.id ?? null;
          if (hoveredId !== null) {
            map.setFeatureState({ source: 'bg', id: hoveredId }, { hover: true });
          }
        });
        map.on('mouseleave', 'bg-fill', () => {
          map.getCanvas().style.cursor = '';
          if (hoveredId !== null) {
            map.setFeatureState({ source: 'bg', id: hoveredId }, { hover: false });
            hoveredId = null;
          }
        });

        map.on('click', 'bg-fill', (e) => {
          const f = e.features?.[0] as MapGeoJSONFeature | undefined;
          if (!f) return;
          onSelect(f.properties as BgProperties);
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLoadError(msg);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onSelect]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {loadError ? (
        <div className="absolute top-4 left-4 max-w-md bg-white/90 backdrop-blur p-3 rounded text-sm text-red-700">
          Couldn&rsquo;t load block-group data: {loadError}
          <div className="text-zinc-600 mt-1">
            Run <code className="bg-zinc-100 px-1 rounded">pnpm build-data</code> to generate <code>public/data/bg.geojson</code>.
          </div>
        </div>
      ) : null}
    </div>
  );
}
