import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import { COUNTIES, STATES_USED } from '../lib/cities';
import { fetchBlockGroupStats, type BlockGroupStats } from '../lib/census';
import { loadSld } from '../lib/sld';
import { fetchNrhpDistricts } from '../lib/nrhp';
import { industrialQuery, osmToPolygonFc, overpass, type Bbox } from '../lib/overpass';

const CACHE_DIR = path.resolve('scripts/.cache');
const OUT_DIR = path.resolve('public/data');

// Approximate bounding boxes per county (state+county FIPS) used to scope
// Overpass queries. Generous on each side to ensure we cover every BG.
// Order: [south, west, north, east]
const COUNTY_BBOX: Record<string, Bbox> = {
  '25025': [42.20, -71.20, 42.42, -70.98], // Suffolk MA (Boston)
  '36061': [40.68, -74.05, 40.89, -73.90], // New York NY (Manhattan)
  '36047': [40.55, -74.05, 40.75, -73.82], // Kings NY (Brooklyn)
  '36005': [40.77, -73.94, 40.93, -73.76], // Bronx NY
  '36081': [40.54, -73.97, 40.81, -73.69], // Queens NY
  '36085': [40.48, -74.27, 40.66, -74.04], // Richmond NY (Staten Island)
  '42101': [39.86, -75.29, 40.14, -74.95], // Philadelphia PA
  '06075': [37.70, -123.05, 37.86, -122.34], // San Francisco CA
  '17031': [41.46, -88.27, 42.16, -87.50], // Cook IL (Chicago + suburbs)
  '22071': [29.85, -90.15, 30.20, -89.60], // Orleans LA (New Orleans)
  '11001': [38.78, -77.13, 39.00, -76.90], // DC
  '42003': [40.20, -80.37, 40.68, -79.68], // Allegheny PA (Pittsburgh)
  '39061': [39.04, -84.83, 39.33, -84.35], // Hamilton OH (Cincinnati)
};

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

  // EPA Smart Location Database v3 — CSV at BG level (~250 MB) keyed on
  // GEOID10. Contains the NatWalkInd composite (1-20) and all underlying vars.
  // NOTE: SLD uses 2010 BG boundaries; our TIGER is 2020. ~95% of GEOIDs
  // overlap — accept the small mismatch for v2.
  const sldCsv = path.join(CACHE_DIR, 'sld.csv');
  await download(
    'https://edg.epa.gov/EPADataCommons/public/OA/EPA_SmartLocationDatabase_V3_Jan_2021_Final.csv',
    sldCsv,
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

  // 2a. Load EPA Smart Location Database (walkability + intersection density).
  console.log('Loading EPA SLD (NatWalkInd, D3B)…');
  const sld = await loadSld(sldCsv);
  console.log(`  ${sld.size} BG entries`);

  // 2b. Fetch NRHP historic districts for our states (cached).
  const nrhpFile = path.join(CACHE_DIR, 'nrhp.geojson');
  if (!existsSync(nrhpFile)) {
    console.log('Fetching NRHP historic districts…');
    const fc = await fetchNrhpDistricts(STATES_USED);
    await fs.writeFile(nrhpFile, JSON.stringify(fc));
    console.log(`  ${fc.features.length} district polygons`);
  } else {
    console.log(`  cached: ${path.basename(nrhpFile)}`);
  }

  // 2c. Fetch OSM industrial land-use polygons via Overpass (per-county, cached).
  // County bboxes derived from the BG TIGER file are looked up below; for now we
  // hardcode a wide-enough bbox per county that captures all its BGs plus a
  // small buffer. We compute these from the COUNTIES list using a static lookup
  // — easier than reading the TIGER shapefile twice.
  const industrialFile = path.join(CACHE_DIR, 'industrial.geojson');
  if (!existsSync(industrialFile)) {
    console.log('Fetching OSM industrial landuse per county…');
    const allInd: GeoJSON.Feature[] = [];
    for (const c of COUNTIES) {
      const bbox = COUNTY_BBOX[`${c.stateFips}${c.countyFips}`];
      if (!bbox) {
        console.warn(`  no bbox for ${c.name}`);
        continue;
      }
      const cacheKey = `osm-industrial-${c.stateFips}${c.countyFips}.json`;
      const cachePath = path.join(CACHE_DIR, cacheKey);
      let fc: GeoJSON.FeatureCollection;
      if (existsSync(cachePath)) {
        fc = JSON.parse(await fs.readFile(cachePath, 'utf8')) as GeoJSON.FeatureCollection;
        console.log(`  ${c.name}: ${fc.features.length} (cached)`);
      } else {
        const raw = await overpass(industrialQuery(bbox));
        fc = osmToPolygonFc(raw);
        await fs.writeFile(cachePath, JSON.stringify(fc));
        console.log(`  ${c.name}: ${fc.features.length}`);
        await new Promise((r) => setTimeout(r, 2000)); // throttle
      }
      allInd.push(...fc.features);
    }
    await fs.writeFile(
      industrialFile,
      JSON.stringify({ type: 'FeatureCollection', features: allInd }),
    );
  } else {
    console.log(`  cached: ${path.basename(industrialFile)}`);
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
    const sldEntry = sld.get(geoid);
    const walkability = sldEntry?.walkability ?? 0;
    const intersection_density = sldEntry?.intersectionDensity ?? 0;
    const walk_norm = walkability > 0 ? Math.min(Math.max(walkability - 5, 0) / 15, 1) : 0;
    // Composite charm score. Will pick up tree canopy + NRHP in upcoming milestones.
    const composite_score =
      pre_1939_share *
      small_res_share *
      (1 - Math.min(vacancy_rate, 0.6)) *
      (0.5 + 0.5 * owner_occ_share) *
      (0.5 + 0.5 * walk_norm);
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
      walkability,
      intersection_density,
      composite_score,
    };
  }
  if (missing > 0) console.warn(`  ${missing} block groups had no matching stats`);

  // 4a. Spatial-join: NRHP districts (BG centroid → district) and OSM industrial
  // landuse (industrial centroid → BG) in a single mapshaper pipeline.
  console.log('Spatial joins (NRHP + industrial)…');
  const draftPath = path.join(CACHE_DIR, 'bg-with-stats.geojson');
  await fs.writeFile(draftPath, JSON.stringify(fc));

  // BG-centroid → NRHP polygon (where does each BG sit?)
  const nrhpJoined = path.join(CACHE_DIR, 'bg-nrhp-joined.json');
  execSync(
    [
      'pnpm exec mapshaper',
      `"${draftPath}"`,
      '-points centroid',
      `-join "${nrhpFile}" calc="nrhp_count=count()"`,
      `-o format=json "${nrhpJoined}"`,
    ].join(' '),
    { stdio: 'inherit' },
  );

  // Industrial polygon centroids → BG (how many industrial polys lie in each BG?)
  const indJoined = path.join(CACHE_DIR, 'bg-ind-joined.geojson');
  execSync(
    [
      'pnpm exec mapshaper',
      `"${draftPath}"`,
      `-join "${industrialFile}" calc="industrial_count=count()" point-method`,
      `-o format=geojson "${indJoined}"`,
    ].join(' '),
    { stdio: 'inherit' },
  );

  const joinedNrhpRaw = JSON.parse(await fs.readFile(nrhpJoined, 'utf8')) as
    | Array<Record<string, string | number>>
    | { [key: string]: Array<Record<string, string | number>> };
  const joinedNrhp: Array<Record<string, string | number>> = Array.isArray(joinedNrhpRaw)
    ? joinedNrhpRaw
    : Object.values(joinedNrhpRaw).flat();
  const nrhpByGeoid: Record<string, number> = {};
  for (const r of joinedNrhp) {
    const g = r.geoid as string | undefined;
    if (!g) continue;
    nrhpByGeoid[g] = (r.nrhp_count as number) > 0 ? 1 : 0;
  }

  const indFc = JSON.parse(await fs.readFile(indJoined, 'utf8')) as GeoJSON.FeatureCollection;
  const indCountByGeoid: Record<string, number> = {};
  for (const feature of indFc.features) {
    const p = feature.properties as Record<string, unknown> | null;
    if (!p) continue;
    const g = p.geoid as string;
    indCountByGeoid[g] = (p.industrial_count as number) ?? 0;
  }

  // Patch features in-place + recompute composite with bonuses/penalties.
  for (const f of fc.features) {
    const p = f.properties as Record<string, unknown>;
    const geoid = p.geoid as string;
    const nrhpFlag = nrhpByGeoid[geoid] ?? 0;
    const indCount = indCountByGeoid[geoid] ?? 0;
    // Penalty saturates around 5 industrial polygons; max 40% knockdown.
    const indPenalty = Math.min(indCount / 5, 1) * 0.4;
    p.nrhp_district = nrhpFlag;
    p.industrial_count = indCount;
    const base = p.composite_score as number;
    p.composite_score = base * (1 + 0.25 * nrhpFlag) * (1 - indPenalty);
  }

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
