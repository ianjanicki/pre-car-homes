// Fetches NRHP historic-district polygons from the NPS ArcGIS REST service.
// State names in the upstream dataset are uppercase full names.

const NRHP_URL =
  'https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/1/query';

const STATE_NAMES_BY_FIPS: Record<string, string> = {
  '25': 'MASSACHUSETTS',
  '36': 'NEW YORK',
  '42': 'PENNSYLVANIA',
  '06': 'CALIFORNIA',
  '17': 'ILLINOIS',
  '22': 'LOUISIANA',
  '11': 'DISTRICT OF COLUMBIA',
  '39': 'OHIO',
};

type ArcGisFeatureCollection = {
  features: GeoJSON.Feature[];
  exceededTransferLimit?: boolean;
};

export async function fetchNrhpDistricts(stateFipsList: string[]): Promise<GeoJSON.FeatureCollection> {
  const stateNames = stateFipsList
    .map((f) => STATE_NAMES_BY_FIPS[f])
    .filter(Boolean)
    .map((n) => `'${n}'`);
  if (stateNames.length === 0) throw new Error('No matching state names');
  const where = `State IN (${stateNames.join(',')}) AND ResType='district'`;

  const all: GeoJSON.Feature[] = [];
  let offset = 0;
  const page = 1000;
  while (true) {
    const params = new URLSearchParams({
      where,
      outFields: 'RESNAME,State,County',
      f: 'geojson',
      resultOffset: String(offset),
      resultRecordCount: String(page),
      orderByFields: 'OBJECTID',
    });
    const res = await fetch(`${NRHP_URL}?${params.toString()}`);
    if (!res.ok) throw new Error(`NRHP API ${res.status}: ${await res.text()}`);
    const fc = (await res.json()) as ArcGisFeatureCollection;
    if (!fc.features || fc.features.length === 0) break;
    all.push(...fc.features);
    if (fc.features.length < page) break;
    offset += page;
  }
  return { type: 'FeatureCollection', features: all };
}
