// Thin wrapper around the public Overpass API.
// We cache responses per-county-per-tag to avoid re-hitting the rate-limited
// public endpoint on every rebuild.

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Bbox = [south: number, west: number, north: number, east: number];

export async function overpass(query: string): Promise<unknown> {
  let lastErr: Error | null = null;
  const encoded = encodeURIComponent(query);
  // Try every mirror up to 3 rounds with backoff.
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of OVERPASS_MIRRORS) {
      try {
        const res = await fetch(`${url}?data=${encoded}`, {
          headers: {
            'user-agent': 'pre-car-homes/0.1 (https://github.com/ianjanicki/pre-car-homes)',
            accept: 'application/json',
          },
        });
        if (res.status === 429 || res.status === 504 || res.status === 503) {
          lastErr = new Error(`Overpass ${res.status} from ${url}`);
          continue;
        }
        if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
        return await res.json();
      } catch (e) {
        lastErr = e as Error;
      }
    }
    if (attempt < 2) await sleep(8000 * (attempt + 1));
  }
  throw lastErr ?? new Error('Overpass: all mirrors failed');
}

// Query helpers — Overpass returns OSM JSON; we convert to GeoJSON downstream
// using osmtogeojson or a simple inline converter for our needs.

export function industrialQuery(bbox: Bbox): string {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:60];
(
  way["landuse"="industrial"](${s},${w},${n},${e});
  relation["landuse"="industrial"](${s},${w},${n},${e});
);
out geom;
`;
}

export function amenityQuery(bbox: Bbox): string {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:60];
(
  node["amenity"~"^(cafe|restaurant|bar|pub|fast_food|ice_cream|food_court|bakery)$"](${s},${w},${n},${e});
  node["shop"](${s},${w},${n},${e});
);
out body;
`;
}

export function brickStreetQuery(bbox: Bbox): string {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:60];
(
  way["highway"]["surface"~"^(sett|cobblestone|paving_stones|brick)$"](${s},${w},${n},${e});
);
out geom;
`;
}

// Convert a single OSM way (with embedded geometry from `out geom`) to a
// GeoJSON Polygon. Handles only "closed way" cases — relations are skipped
// for simplicity; OSM industrial polygons are overwhelmingly closed ways.
type OsmWay = {
  type: 'way';
  id: number;
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
};
type OsmNode = {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

export function osmToPolygonFc(data: unknown): GeoJSON.FeatureCollection {
  const elements = (data as { elements?: Array<OsmWay | OsmNode> }).elements ?? [];
  const features: GeoJSON.Feature[] = [];
  for (const el of elements) {
    if (el.type === 'way' && el.geometry && el.geometry.length >= 4) {
      const coords = el.geometry.map((g) => [g.lon, g.lat] as [number, number]);
      if (
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1]
      ) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [coords] },
          properties: { osm_id: el.id, ...(el.tags ?? {}) },
        });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

export function osmToPointFc(data: unknown): GeoJSON.FeatureCollection {
  const elements = (data as { elements?: Array<OsmWay | OsmNode> }).elements ?? [];
  const features: GeoJSON.Feature[] = [];
  for (const el of elements) {
    if (el.type === 'node') {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
        properties: { osm_id: el.id, ...(el.tags ?? {}) },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

export function osmToLineFc(data: unknown): GeoJSON.FeatureCollection {
  const elements = (data as { elements?: Array<OsmWay | OsmNode> }).elements ?? [];
  const features: GeoJSON.Feature[] = [];
  for (const el of elements) {
    if (el.type === 'way' && el.geometry && el.geometry.length >= 2) {
      const coords = el.geometry.map((g) => [g.lon, g.lat] as [number, number]);
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { osm_id: el.id, ...(el.tags ?? {}) },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
