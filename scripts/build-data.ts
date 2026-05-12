import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import { COUNTIES, STATES_USED } from '../lib/cities';
import { fetchBlockGroupStats, type BlockGroupStats } from '../lib/census';

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

  // 1. Download block-group TIGER shapefiles per state and the national ZCTA file.
  console.log('Downloading TIGER block-group boundaries…');
  for (const state of STATES_USED) {
    const url = `https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_${state}_bg_500k.zip`;
    await download(url, path.join(CACHE_DIR, `bg_${state}.zip`));
  }
  // Census only publishes ZCTAs in the generalized set every ~5 years; 2020 is current.
  const zctaZip = path.join(CACHE_DIR, 'zcta_us.zip');
  await download(
    'https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip',
    zctaZip,
  );

  // 2. Pull ACS stats per county.
  console.log('Fetching Census ACS stats…');
  const stats: Record<string, BlockGroupStats> = {};
  for (const c of COUNTIES) {
    process.stdout.write(`  ${c.name} (${c.stateFips}${c.countyFips})… `);
    const rows = await fetchBlockGroupStats(c.stateFips, c.countyFips, apiKey);
    for (const r of rows) stats[r.geoid] = r;
    console.log(`${rows.length} block groups`);
  }

  // 3. Merge state BG shapefiles, filter to our counties, simplify.
  const countyPrefixes = COUNTIES.map((c) => `${c.stateFips}${c.countyFips}`);
  const filterExpr = countyPrefixes
    .map((p) => `GEOID.indexOf('${p}')===0`)
    .join(' || ');
  const inputs = STATES_USED.map((s) => path.join(CACHE_DIR, `bg_${s}.zip`))
    .map((p) => `"${p}"`)
    .join(' ');
  const mergedOut = path.join(CACHE_DIR, 'bg-merged.geojson');

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
    const pre_1939_share = s && s.total > 0 ? s.pre1939 / s.total : 0;
    const small_res_share = s?.smallResShare ?? 0;
    const owner_occ_share = s?.ownerOccShare ?? 0;
    const vacancy_rate = s?.vacancyRate ?? 0;
    // Composite charm score using the ACS signals we currently have.
    // Will be re-derived as walkability / tree canopy / NRHP layers come in.
    const composite_score =
      pre_1939_share *
      small_res_share *
      (1 - Math.min(vacancy_rate, 0.6)) *
      (0.5 + 0.5 * owner_occ_share);
    f.properties = {
      geoid,
      name: props.NAMELSAD ?? props.NAME,
      total: s?.total ?? 0,
      pre1939: s?.pre1939 ?? 0,
      built1940to1949: s?.built1940to1949 ?? 0,
      pre_1939_share,
      small_res_share,
      sfh_detached_share: s?.sfhDetachedShare ?? 0,
      sfh_attached_share: s?.sfhAttachedShare ?? 0,
      multifamily_large_share: s?.multifamilyLargeShare ?? 0,
      owner_occ_share,
      vacancy_rate,
      composite_score,
    };
  }
  if (missing > 0) console.warn(`  ${missing} block groups had no matching stats`);

  const outPath = path.join(OUT_DIR, 'bg.geojson');
  await fs.writeFile(outPath, JSON.stringify(fc));
  const bytes = (await fs.stat(outPath)).size;
  console.log(`Wrote ${outPath} (${(bytes / 1024 / 1024).toFixed(2)} MB, ${fc.features.length} block groups)`);

  // 5. Spatial join with ZCTAs → bg→[ZIP] map.
  const zctaDir = path.join(CACHE_DIR, 'zcta');
  if (!existsSync(path.join(zctaDir, 'cb_2020_us_zcta520_500k.shp'))) {
    await fs.mkdir(zctaDir, { recursive: true });
    execSync(`unzip -o "${zctaZip}" -d "${zctaDir}"`, { stdio: 'inherit' });
  }
  const zctaShp = path.join(zctaDir, 'cb_2020_us_zcta520_500k.shp');

  console.log('Building BG→ZIP map via centroid spatial join…');
  const bgZipsRaw = path.join(CACHE_DIR, 'bg-zips-raw.json');
  const joinCmd = [
    'pnpm exec mapshaper',
    `"${outPath}"`,
    '-points centroid',
    `-join "${zctaShp}" fields=GEOID20`,
    `-o format=json "${bgZipsRaw}"`,
  ].join(' ');
  execSync(joinCmd, { stdio: 'inherit' });

  const joinedRaw = JSON.parse(await fs.readFile(bgZipsRaw, 'utf8')) as
    | Array<Record<string, string | number>>
    | { [key: string]: Array<Record<string, string | number>> };
  const joinedRows: Array<Record<string, string | number>> = Array.isArray(joinedRaw)
    ? joinedRaw
    : Object.values(joinedRaw).flat();
  const bgZips: Record<string, string[]> = {};
  for (const r of joinedRows) {
    const geoid = r.geoid as string | undefined;
    const zip = r.GEOID20 as string | undefined;
    if (!geoid) continue;
    if (zip) bgZips[geoid] = [zip];
    else if (!bgZips[geoid]) bgZips[geoid] = [];
  }
  const zipMapPath = path.join(OUT_DIR, 'bg-zips.json');
  await fs.writeFile(zipMapPath, JSON.stringify(bgZips));
  console.log(`Wrote ${zipMapPath} (${Object.keys(bgZips).length} entries)`);

  // Clean up old tract-named outputs so they don't get served stale.
  for (const old of ['tracts.geojson', 'tract-zips.json']) {
    const p = path.join(OUT_DIR, old);
    if (existsSync(p)) await fs.unlink(p);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
