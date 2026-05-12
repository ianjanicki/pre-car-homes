// ACS 5-year tables we pull for v2:
//
// B25034 — Year Structure Built
//   _001E = total housing units
//   _011E = built 1939 or earlier
//   _010E = built 1940-1949 (context only)
//
// B25024 — Units in Structure
//   _001E = total
//   _002E = 1, detached
//   _003E = 1, attached
//   _004E = 2 units
//   _005E = 3-4 units
//   _006E = 5-9 units
//   _007E = 10-19 units
//   _008E = 20-49 units
//   _009E = 50+ units
//   _010E = mobile home
//   _011E = boat / RV / van
//
// B25003 — Tenure
//   _001E = occupied units
//   _002E = owner-occupied
//   _003E = renter-occupied
//
// B25002 — Occupancy
//   _001E = total housing units
//   _002E = occupied
//   _003E = vacant

export type BlockGroupStats = {
  geoid: string; // 12-digit: state(2)+county(3)+tract(6)+bg(1)
  total: number;
  pre1939: number;
  built1940to1949: number;
  // B25024 derived
  smallResShare: number; // 1-4 unit buildings as share of total
  sfhDetachedShare: number;
  sfhAttachedShare: number;
  multifamilyLargeShare: number; // 50+ unit buildings
  // B25003
  ownerOccShare: number;
  // B25002
  vacancyRate: number;
  // B19013 — median household income (dollars). -666666666 = no data.
  medianIncome: number;
};

const ACS_YEAR = '2023';
const ACS_BASE = `https://api.census.gov/data/${ACS_YEAR}/acs/acs5`;

const VARS = [
  // B25034 — year built
  'B25034_001E',
  'B25034_010E',
  'B25034_011E',
  // B25024 — units in structure
  'B25024_001E',
  'B25024_002E',
  'B25024_003E',
  'B25024_004E',
  'B25024_005E',
  'B25024_009E',
  // B25003 — tenure
  'B25003_001E',
  'B25003_002E',
  // B25002 — occupancy
  'B25002_001E',
  'B25002_003E',
  // B19013 — median household income (last 12 months)
  'B19013_001E',
] as const;

export async function fetchBlockGroupStats(
  stateFips: string,
  countyFips: string,
  apiKey: string,
): Promise<BlockGroupStats[]> {
  const params = new URLSearchParams({
    get: ['NAME', ...VARS].join(','),
    for: 'block group:*',
    in: `state:${stateFips} county:${countyFips} tract:*`,
    key: apiKey,
  });
  const url = `${ACS_BASE}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Census API ${res.status}: ${await res.text()}`);

  const rows = (await res.json()) as string[][];
  const [header, ...data] = rows;
  const col = (n: string) => header.indexOf(n);

  const c = {
    state: col('state'),
    county: col('county'),
    tract: col('tract'),
    bg: col('block group'),
    b25034_total: col('B25034_001E'),
    b25034_1940s: col('B25034_010E'),
    b25034_pre1939: col('B25034_011E'),
    b25024_total: col('B25024_001E'),
    sfh_detached: col('B25024_002E'),
    sfh_attached: col('B25024_003E'),
    twoUnit: col('B25024_004E'),
    threeFourUnit: col('B25024_005E'),
    fiftyPlus: col('B25024_009E'),
    tenure_total: col('B25003_001E'),
    owner: col('B25003_002E'),
    occ_total: col('B25002_001E'),
    vacant: col('B25002_003E'),
    medianIncome: col('B19013_001E'),
  };

  const num = (row: string[], idx: number) => {
    const v = Number(row[idx]);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  const safeDiv = (n: number, d: number) => (d > 0 ? n / d : 0);

  return data.map((row) => {
    const total = num(row, c.b25034_total);
    const b25024Total = num(row, c.b25024_total);
    const detached = num(row, c.sfh_detached);
    const attached = num(row, c.sfh_attached);
    const twoUnit = num(row, c.twoUnit);
    const threeFour = num(row, c.threeFourUnit);
    const fiftyPlus = num(row, c.fiftyPlus);
    const tenureTotal = num(row, c.tenure_total);
    const owner = num(row, c.owner);
    const occTotal = num(row, c.occ_total);
    const vacant = num(row, c.vacant);
    const incomeRaw = Number(row[c.medianIncome]);
    // Census uses -666666666 as the "no estimate" sentinel for income.
    const medianIncome = Number.isFinite(incomeRaw) && incomeRaw > 0 ? incomeRaw : 0;

    return {
      geoid: `${row[c.state]}${row[c.county]}${row[c.tract]}${row[c.bg]}`,
      total,
      pre1939: num(row, c.b25034_pre1939),
      built1940to1949: num(row, c.b25034_1940s),
      smallResShare: safeDiv(detached + attached + twoUnit + threeFour, b25024Total),
      sfhDetachedShare: safeDiv(detached, b25024Total),
      sfhAttachedShare: safeDiv(attached, b25024Total),
      multifamilyLargeShare: safeDiv(fiftyPlus, b25024Total),
      ownerOccShare: safeDiv(owner, tenureTotal),
      vacancyRate: safeDiv(vacant, occTotal),
      medianIncome,
    };
  });
}

export function pre1939Share(s: BlockGroupStats): number {
  return s.total > 0 ? s.pre1939 / s.total : 0;
}
