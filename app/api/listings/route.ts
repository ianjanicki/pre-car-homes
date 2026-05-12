import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { unstable_cache } from 'next/cache';
import { fetchListingsForZips } from '@/lib/rapidapi';

// Map a block-group GEOID (12 digits) to the ZIPs covering it.
// Built once by scripts/build-data.ts; falls back to empty if missing.
const ZIP_MAP_PATH = path.resolve('public/data/bg-zips.json');

async function loadZipMap(): Promise<Record<string, string[]>> {
  try {
    const raw = await fs.readFile(ZIP_MAP_PATH, 'utf8');
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return {};
  }
}

const getListings = unstable_cache(
  async (geoid: string) => {
    const zipMap = await loadZipMap();
    const zips = zipMap[geoid] ?? [];
    if (zips.length === 0) return { listings: [], reason: 'no-zip-mapping' as const };

    const raw = await fetchListingsForZips(zips);
    const filtered = raw.filter((l) => typeof l.yearBuilt === 'number' && l.yearBuilt <= 1939);
    // Keep at most 8 in the UI panel.
    return { listings: filtered.slice(0, 8) };
  },
  ['listings-v1'],
  { revalidate: 60 * 60 * 24 }, // 24h
);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const geoid = url.searchParams.get('geoid');
  if (!geoid || !/^\d{12}$/.test(geoid)) {
    return NextResponse.json({ error: 'invalid geoid' }, { status: 400 });
  }
  const data = await getListings(geoid);
  return NextResponse.json(data);
}
