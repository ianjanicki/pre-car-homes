import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import { COUNTIES, STATES_USED } from '../lib/cities';
import { fetchTractStats, type TractStats } from '../lib/census';

const CACHE_DIR = path.resolve('scripts/.cache');
const OUT_DIR = path.resolve('public/data');

async function download(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) {
    console.log(`  cached: ${path.basename(dest)}`);
    return;
  }
  console.log(`  fetching: ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed ${res.status}: ${url}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const apiKey = process.env.CENSUS_API_KEY;
  if (!apiKey) throw new Error('CENSUS_API_KEY missing in env');

  // 1. Download cartographic-boundary tract shapefiles for each state we touch,
  //    plus the national ZCTA file for the tract→ZIP join.
  console.log('Downloading TIGER tract boundaries…');
  for (const state of STATES_USED) {
    const url = `https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_${state}_tract_500k.zip`;
    await download(url, path.join(CACHE_DIR, `tracts_${state}.zip`));
  }
  // Census only publishes ZCTAs in the cartographic-boundary set every ~5 years; 2020 is current.
  const zctaZip = path.join(CACHE_DIR, 'zcta_us.zip');
  await download(
    'https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip',
    zctaZip,
  );

  // 2. Pull B25034 stats for each county.
  console.log('Fetching Census B25034 stats…');
  const stats: Record<string, TractStats> = {};
  for (const c of COUNTIES) {
    process.stdout.write(`  ${c.name} (${c.stateFips}${c.countyFips})… `);
    const rows = await fetchTractStats(c.stateFips, c.countyFips, apiKey);
    for (const r of rows) stats[r.geoid] = r;
    console.log(`${rows.length} tracts`);
  }

  // 3. Use mapshaper to merge, filter to our counties, and simplify.
  const countyPrefixes = COUNTIES.map((c) => `${c.stateFips}${c.countyFips}`);
  const filterExpr = countyPrefixes
    .map((p) => `GEOID.indexOf('${p}')===0`)
    .join(' || ');
  const inputs = STATES_USED.map((s) => path.join(CACHE_DIR, `tracts_${s}.zip`))
    .map((p) => `"${p}"`)
    .join(' ');
  const mergedOut = path.join(CACHE_DIR, 'tracts-merged.geojson');

  console.log('Merging + simplifying with mapshaper…');
  const cmd = [
    'pnpm exec mapshaper',
    '-i',
    inputs,
    'combine-files',
    '-merge-layers',
    `-filter "${filterExpr}"`,
    '-simplify 5% keep-shapes',
    `-o format=geojson "${mergedOut}"`,
  ].join(' ');
  execSync(cmd, { stdio: 'inherit' });

  // 4. Join stats onto features.
  console.log('Joining stats…');
  const fc = JSON.parse(await fs.readFile(mergedOut, 'utf8')) as GeoJSON.FeatureCollection;
  let missing = 0;
  for (const f of fc.features) {
    const props = f.properties as Record<string, string>;
    const geoid = props.GEOID;
    const s = stats[geoid];
    if (!s) missing++;
    f.properties = {
      geoid,
      name: props.NAMELSAD ?? props.NAME,
      total: s?.total ?? 0,
      pre1939: s?.pre1939 ?? 0,
      built1940to1949: s?.built1940to1949 ?? 0,
      pre_1939_share: s && s.total > 0 ? s.pre1939 / s.total : 0,
    };
  }
  if (missing > 0) console.warn(`  ${missing} tracts had no matching stats`);

  const outPath = path.join(OUT_DIR, 'tracts.geojson');
  await fs.writeFile(outPath, JSON.stringify(fc));
  const bytes = (await fs.stat(outPath)).size;
  console.log(`Wrote ${outPath} (${(bytes / 1024 / 1024).toFixed(2)} MB, ${fc.features.length} tracts)`);

  // 5. Spatial join with ZCTAs → tract→[ZIP] map.
  // mapshaper's -join only accepts unpacked shapefiles, so extract first.
  const zctaDir = path.join(CACHE_DIR, 'zcta');
  if (!existsSync(path.join(zctaDir, 'cb_2020_us_zcta520_500k.shp'))) {
    await fs.mkdir(zctaDir, { recursive: true });
    execSync(`unzip -o "${zctaZip}" -d "${zctaDir}"`, { stdio: 'inherit' });
  }
  const zctaShp = path.join(zctaDir, 'cb_2020_us_zcta520_500k.shp');

  console.log('Building tract→ZIP map via spatial join…');
  const tractZipsRaw = path.join(CACHE_DIR, 'tract-zips-raw.json');
  // Convert tract polygons to centroids, then point-in-polygon against ZCTAs.
  // (A tract can technically span two ZIPs; for an enrichment sample this is fine.)
  const joinCmd = [
    'pnpm exec mapshaper',
    `"${outPath}"`,
    '-points centroid',
    `-join "${zctaShp}" fields=GEOID20`,
    `-o format=json "${tractZipsRaw}"`,
  ].join(' ');
  execSync(joinCmd, { stdio: 'inherit' });

  const joinedRaw = JSON.parse(await fs.readFile(tractZipsRaw, 'utf8')) as
    | Array<Record<string, string | number>>
    | { tracts?: Array<Record<string, string | number>> };
  const joinedRows = Array.isArray(joinedRaw)
    ? joinedRaw
    : (joinedRaw.tracts as Array<Record<string, string | number>>);
  const tractZips: Record<string, string[]> = {};
  for (const r of joinedRows) {
    const geoid = r.geoid as string | undefined;
    const zip = r.GEOID20 as string | undefined;
    if (!geoid) continue;
    if (zip) tractZips[geoid] = [zip];
    else if (!tractZips[geoid]) tractZips[geoid] = [];
  }
  const zipMapPath = path.join(OUT_DIR, 'tract-zips.json');
  await fs.writeFile(zipMapPath, JSON.stringify(tractZips));
  console.log(`Wrote ${zipMapPath} (${Object.keys(tractZips).length} entries)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
