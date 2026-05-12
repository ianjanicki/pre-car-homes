// B25034 — Year Structure Built (ACS 5-year)
// _001E = total housing units
// _011E = built 1939 or earlier  (the "pre-car" bucket)
// _010E = built 1940-1949        (mostly post-war; included only for context)

export type TractStats = {
  geoid: string; // 11-digit: state(2) + county(3) + tract(6)
  total: number;
  pre1939: number;
  built1940to1949: number;
};

const ACS_YEAR = '2023';
const ACS_BASE = `https://api.census.gov/data/${ACS_YEAR}/acs/acs5`;
const VARS = ['B25034_001E', 'B25034_010E', 'B25034_011E'] as const;

export async function fetchTractStats(
  stateFips: string,
  countyFips: string,
  apiKey?: string,
): Promise<TractStats[]> {
  const params = new URLSearchParams({
    get: ['NAME', ...VARS].join(','),
    for: 'tract:*',
    in: `state:${stateFips} county:${countyFips}`,
  });
  if (apiKey) params.set('key', apiKey);

  const url = `${ACS_BASE}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Census API ${res.status}: ${await res.text()}`);
  }
  const rows = (await res.json()) as string[][];
  const [header, ...data] = rows;

  const idx = {
    total: header.indexOf('B25034_001E'),
    b1940: header.indexOf('B25034_010E'),
    pre1939: header.indexOf('B25034_011E'),
    state: header.indexOf('state'),
    county: header.indexOf('county'),
    tract: header.indexOf('tract'),
  };

  return data.map((row) => ({
    geoid: `${row[idx.state]}${row[idx.county]}${row[idx.tract]}`,
    total: Number(row[idx.total]) || 0,
    pre1939: Number(row[idx.pre1939]) || 0,
    built1940to1949: Number(row[idx.b1940]) || 0,
  }));
}

export function pre1939Share(s: TractStats): number {
  return s.total > 0 ? s.pre1939 / s.total : 0;
}
