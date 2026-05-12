// Server-only RapidAPI clients for Redfin Base and Realtor Search.
// Both APIs return active for-sale listings. We filter to year_built <= 1939
// so the listings reinforce the heatmap's "pre-car" signal.

import 'server-only';

export type RawListing = {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  yearBuilt?: number;
  price?: number;
  url?: string;
  source: 'redfin' | 'realtor';
};

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? '';

const HEADERS_REDFIN = {
  'x-rapidapi-key': RAPIDAPI_KEY,
  'x-rapidapi-host': 'redfin-base.p.rapidapi.com',
};

const HEADERS_REALTOR = {
  'x-rapidapi-key': RAPIDAPI_KEY,
  'x-rapidapi-host': 'realtor-search.p.rapidapi.com',
};

// --- Realtor Search ---

type RealtorResult = {
  list_price?: number;
  href?: string;
  description?: { year_built?: number };
  location?: {
    address?: {
      line?: string;
      city?: string;
      state_code?: string;
      postal_code?: string;
    };
  };
};

export async function fetchRealtorListings(zip: string): Promise<RawListing[]> {
  if (!RAPIDAPI_KEY) return [];
  const url = `https://realtor-search.p.rapidapi.com/properties/search-buy?location=${encodeURIComponent(
    zip,
  )}&limit=25&offset=0&search_radius=0`;
  const res = await fetch(url, { headers: HEADERS_REALTOR });
  if (!res.ok) {
    console.warn(`realtor ${zip}: HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { data?: { results?: RealtorResult[] } };
  const results = data?.data?.results ?? [];
  return results.flatMap<RawListing>((r) => {
    const addr = r.location?.address;
    if (!addr?.line) return [];
    return [
      {
        address: addr.line,
        city: addr.city,
        state: addr.state_code,
        zip: addr.postal_code,
        yearBuilt: r.description?.year_built,
        price: r.list_price,
        url: r.href,
        source: 'realtor',
      },
    ];
  });
}

// --- Redfin Base ---

type RedfinHome = {
  yearBuilt?: number;
  price?: { value?: number };
  streetLine?: { value?: string };
  city?: string;
  state?: string;
  zip?: string;
  url?: string;
};

export async function fetchRedfinListings(zip: string): Promise<RawListing[]> {
  if (!RAPIDAPI_KEY) return [];
  const url = `https://redfin-base.p.rapidapi.com/properties/search-sale?regionId=${encodeURIComponent(
    zip,
  )}&regionType=2&limit=25`;
  const res = await fetch(url, { headers: HEADERS_REDFIN });
  if (!res.ok) {
    console.warn(`redfin ${zip}: HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { homes?: RedfinHome[] };
  const homes = data?.homes ?? [];
  return homes.flatMap<RawListing>((h) => {
    const street = h.streetLine?.value;
    if (!street) return [];
    return [
      {
        address: street,
        city: h.city,
        state: h.state,
        zip: h.zip,
        yearBuilt: h.yearBuilt,
        price: h.price?.value,
        url: h.url ? `https://redfin.com${h.url}` : undefined,
        source: 'redfin',
      },
    ];
  });
}

export async function fetchListingsForZips(zips: string[]): Promise<RawListing[]> {
  if (zips.length === 0) return [];
  // Cap fan-out so a 30-ZIP tract doesn't burn the whole quota in one click.
  const sample = zips.slice(0, 3);
  const results = await Promise.allSettled(sample.map((z) => fetchRealtorListings(z)));
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
