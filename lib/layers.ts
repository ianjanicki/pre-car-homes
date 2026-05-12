// Layer registry — single source of truth for which BG property each ramp uses,
// what the gradient looks like, and how to label it in UI.

export type LayerId =
  | 'composite'
  | 'pre_1939_share'
  | 'small_res_share'
  | 'owner_occ_share'
  | 'vacancy_rate'
  | 'walkability'
  | 'intersection_density'
  | 'median_income'
  | 'nrhp_district'
  | 'industrial_count'
  | 'sfh_detached_share'
  | 'sfh_attached_share';

export type LayerDef = {
  id: LayerId;
  label: string;
  shortLabel: string;
  property: string;
  // ramp stops in property units (0-1 for shares, 0-1 for normalized composite)
  ramp: Array<[number, string]>;
  // Format value for the detail panel — e.g. '87.4%' or '0.42'
  format: (v: number) => string;
  // Higher value = "better" (red). For vacancy we invert the ramp colors.
  description: string;
};

const REDS_LIGHT_TO_DARK: Array<[number, string]> = [
  [0.0, '#f7f7f7'],
  [0.1, '#fee5d9'],
  [0.25, '#fcae91'],
  [0.4, '#fb6a4a'],
  [0.55, '#de2d26'],
  [0.7, '#a50f15'],
];

const REDS_INVERTED: Array<[number, string]> = [
  [0.0, '#a50f15'],
  [0.05, '#de2d26'],
  [0.1, '#fb6a4a'],
  [0.2, '#fcae91'],
  [0.35, '#fee5d9'],
  [0.6, '#f7f7f7'],
];

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export const LAYERS: Record<LayerId, LayerDef> = {
  composite: {
    id: 'composite',
    label: 'Pre-Car Charm (composite)',
    shortLabel: 'Charm',
    property: 'composite_score',
    // Ramp tuned to the soft-floor distribution (median ≈ 0.27, p90 ≈ 0.49).
    ramp: [
      [0.05, '#f7f7f7'],
      [0.15, '#fee5d9'],
      [0.25, '#fcae91'],
      [0.35, '#fb6a4a'],
      [0.5, '#de2d26'],
      [0.7, '#a50f15'],
    ],
    format: (v) => v.toFixed(3),
    description:
      'Pre-1939 housing share, weighted by residential typology, vacancy, owner-occupancy, walkability, income, NRHP overlay, and an industrial penalty. Multiplicative with soft floors so no single weak dimension crushes the score.',
  },
  pre_1939_share: {
    id: 'pre_1939_share',
    label: 'Built 1939 or earlier (%)',
    shortLabel: 'Pre-1939',
    property: 'pre_1939_share',
    ramp: REDS_LIGHT_TO_DARK,
    format: pct,
    description: 'ACS B25034 — share of housing units in this block group built 1939 or earlier.',
  },
  small_res_share: {
    id: 'small_res_share',
    label: 'Small residential typology (%)',
    shortLabel: 'Small residential',
    property: 'small_res_share',
    ramp: REDS_LIGHT_TO_DARK,
    format: pct,
    description: 'ACS B25024 — share of units in 1–4 unit buildings. High = rowhouse / streetcar-suburb pattern; low = towers, mobile homes, or industrial.',
  },
  owner_occ_share: {
    id: 'owner_occ_share',
    label: 'Owner-occupancy (%)',
    shortLabel: 'Owner-occupied',
    property: 'owner_occ_share',
    ramp: REDS_LIGHT_TO_DARK,
    format: pct,
    description: 'ACS B25003 — share of occupied units that are owner-occupied. Cared-for stock proxy.',
  },
  vacancy_rate: {
    id: 'vacancy_rate',
    label: 'Vacancy rate (%)',
    shortLabel: 'Vacancy',
    property: 'vacancy_rate',
    ramp: REDS_INVERTED, // low vacancy = dark red ("good")
    format: pct,
    description: 'ACS B25002 — share of housing units vacant. High vacancy is a blight signal.',
  },
  walkability: {
    id: 'walkability',
    label: 'Walkability (EPA NatWalkInd 1–20)',
    shortLabel: 'Walkability',
    property: 'walkability',
    ramp: [
      [1, '#f7f7f7'],
      [5, '#fee5d9'],
      [9, '#fcae91'],
      [12, '#fb6a4a'],
      [15, '#de2d26'],
      [18, '#a50f15'],
    ],
    format: (v) => v.toFixed(1),
    description:
      'EPA National Walkability Index — composite of intersection density, transit access, employment mix, and population density. 1 = car-dependent, 20 = most walkable.',
  },
  intersection_density: {
    id: 'intersection_density',
    label: 'Intersection density (D3B)',
    shortLabel: 'Intersections',
    property: 'intersection_density',
    ramp: [
      [0, '#f7f7f7'],
      [50, '#fee5d9'],
      [100, '#fcae91'],
      [200, '#fb6a4a'],
      [350, '#de2d26'],
      [500, '#a50f15'],
    ],
    format: (v) => v.toFixed(0),
    description:
      'EPA SLD — pedestrian-oriented intersections per square mile. High = tight pre-car street grid; low = cul-de-sacs and superblocks.',
  },
  median_income: {
    id: 'median_income',
    label: 'Median household income (USD)',
    shortLabel: 'Income',
    property: 'median_income',
    ramp: [
      [40000, '#f7f7f7'],
      [70000, '#fee5d9'],
      [100000, '#fcae91'],
      [140000, '#fb6a4a'],
      [200000, '#de2d26'],
      [250000, '#a50f15'],
    ],
    format: (v) => (v > 0 ? `$${Math.round(v / 1000)}k` : 'n/a'),
    description:
      'ACS B19013 — median household income. Used as a "high-end residential" coefficient in the composite (capped 40k–150k).',
  },
  nrhp_district: {
    id: 'nrhp_district',
    label: 'National Register historic district',
    shortLabel: 'NRHP district',
    property: 'nrhp_district',
    ramp: [
      [0, '#f7f7f7'],
      [1, '#a50f15'],
    ],
    format: (v) => (v >= 1 ? 'Yes' : 'No'),
    description:
      'NPS National Register of Historic Places — block group centroid falls inside an officially-listed historic district. Binary.',
  },
  industrial_count: {
    id: 'industrial_count',
    label: 'OSM industrial polygons',
    shortLabel: 'Industrial',
    property: 'industrial_count',
    ramp: [
      [0, '#a50f15'],
      [1, '#de2d26'],
      [3, '#fb6a4a'],
      [6, '#fcae91'],
      [12, '#fee5d9'],
      [25, '#f7f7f7'],
    ],
    format: (v) => v.toFixed(0),
    description:
      'OpenStreetMap landuse=industrial polygons whose centroid falls inside this block group. High count = industrial district; drives the composite penalty.',
  },
  sfh_detached_share: {
    id: 'sfh_detached_share',
    label: 'Single-family detached (%)',
    shortLabel: 'SFH detached',
    property: 'sfh_detached_share',
    ramp: REDS_LIGHT_TO_DARK,
    format: pct,
    description: 'ACS B25024 — share of 1-unit detached homes. High = Wilmette / Brookline streetcar-suburb pattern.',
  },
  sfh_attached_share: {
    id: 'sfh_attached_share',
    label: 'Single-family attached (%)',
    shortLabel: 'SFH attached',
    property: 'sfh_attached_share',
    ramp: REDS_LIGHT_TO_DARK,
    format: pct,
    description: 'ACS B25024 — share of 1-unit attached (rowhouse) homes. High = Society Hill / Capitol Hill / French Quarter pattern.',
  },
};

export const LAYER_ORDER: LayerId[] = [
  'composite',
  'pre_1939_share',
  'small_res_share',
  'owner_occ_share',
  'vacancy_rate',
  'walkability',
  'intersection_density',
  'median_income',
  'nrhp_district',
  'industrial_count',
  'sfh_detached_share',
  'sfh_attached_share',
];

export function defaultLayer(): LayerId {
  return 'composite';
}
