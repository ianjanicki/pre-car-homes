'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export type TractProperties = {
  geoid: string;
  name: string;
  total: number;
  pre1939: number;
  built1940to1949: number;
  pre_1939_share: number;
};

type Props = {
  onSelect: (props: TractProperties | null) => void;
};

// Choropleth: white → orange → deep red, anchored at share = 0.5+
const FILL_COLOR: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['get', 'pre_1939_share'],
  0.0,
  '#f7f7f7',
  0.1,
  '#fee5d9',
  0.25,
  '#fcae91',
  0.4,
  '#fb6a4a',
  0.55,
  '#de2d26',
  0.7,
  '#a50f15',
];

export default function Map({ onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        const res = await fetch('/data/tracts.geojson');
        if (!res.ok) throw new Error(`tracts.geojson HTTP ${res.status}`);
        const data = (await res.json()) as GeoJSON.FeatureCollection;

        map.addSource('tracts', { type: 'geojson', data, promoteId: 'geoid' });

        map.addLayer({
          id: 'tracts-fill',
          type: 'fill',
          source: 'tracts',
          paint: {
            'fill-color': FILL_COLOR,
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.9,
              0.7,
            ],
          },
        });

        map.addLayer({
          id: 'tracts-line',
          type: 'line',
          source: 'tracts',
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
        map.on('mousemove', 'tracts-fill', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const f = e.features?.[0];
          if (!f) return;
          if (hoveredId !== null) {
            map.setFeatureState({ source: 'tracts', id: hoveredId }, { hover: false });
          }
          hoveredId = f.id ?? null;
          if (hoveredId !== null) {
            map.setFeatureState({ source: 'tracts', id: hoveredId }, { hover: true });
          }
        });
        map.on('mouseleave', 'tracts-fill', () => {
          map.getCanvas().style.cursor = '';
          if (hoveredId !== null) {
            map.setFeatureState({ source: 'tracts', id: hoveredId }, { hover: false });
            hoveredId = null;
          }
        });

        map.on('click', 'tracts-fill', (e) => {
          const f = e.features?.[0] as MapGeoJSONFeature | undefined;
          if (!f) return;
          onSelect(f.properties as TractProperties);
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
          Couldn&rsquo;t load tract data: {loadError}
          <div className="text-zinc-600 mt-1">
            Run <code className="bg-zinc-100 px-1 rounded">pnpm build-data</code> to generate <code>public/data/tracts.geojson</code>.
          </div>
        </div>
      ) : null}
    </div>
  );
}
