import fs from 'node:fs';
import readline from 'node:readline';

export type SldEntry = {
  walkability: number; // NatWalkInd 1-20
  intersectionDensity: number; // D3B
};

// Reads the EPA Smart Location Database CSV and returns a map keyed on a
// reconstructed 12-digit GEOID (state+county+tract+blockgroup).
//
// The CSV's `GEOID10` / `GEOID20` columns are mangled to scientific notation
// (Excel-style export — e.g. "4.8113E+11"), so we cannot use them directly.
// We rebuild from STATEFP, COUNTYFP, TRACTCE, BLKGRPCE which are stored as
// plain integers and can be zero-padded back into the canonical GEOID.
export async function loadSld(csvPath: string): Promise<Map<string, SldEntry>> {
  const stream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header: string[] | null = null;
  let idxState = -1;
  let idxCounty = -1;
  let idxTract = -1;
  let idxBg = -1;
  let idxWalk = -1;
  let idxD3B = -1;
  const out = new Map<string, SldEntry>();

  for await (const line of rl) {
    if (!header) {
      header = line.split(',');
      idxState = header.indexOf('STATEFP');
      idxCounty = header.indexOf('COUNTYFP');
      idxTract = header.indexOf('TRACTCE');
      idxBg = header.indexOf('BLKGRPCE');
      idxWalk = header.indexOf('NatWalkInd');
      idxD3B = header.indexOf('D3B');
      if (idxState < 0 || idxCounty < 0 || idxTract < 0 || idxBg < 0 || idxWalk < 0) {
        throw new Error('SLD CSV missing required columns');
      }
      continue;
    }
    const cols = line.split(',');
    const state = (cols[idxState] || '').padStart(2, '0');
    const county = (cols[idxCounty] || '').padStart(3, '0');
    const tract = (cols[idxTract] || '').padStart(6, '0');
    const bg = (cols[idxBg] || '').padStart(1, '0');
    if (state.length !== 2 || county.length !== 3 || tract.length !== 6 || bg.length !== 1) {
      continue;
    }
    const geoid = `${state}${county}${tract}${bg}`;
    const walk = Number(cols[idxWalk]);
    const d3b = Number(cols[idxD3B]);
    if (!Number.isFinite(walk)) continue;
    out.set(geoid, {
      walkability: walk,
      intersectionDensity: Number.isFinite(d3b) ? d3b : 0,
    });
  }
  return out;
}
