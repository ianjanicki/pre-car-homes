export type CountyTarget = {
  name: string;
  state: string;
  stateFips: string;
  countyFips: string;
};

export const COUNTIES: CountyTarget[] = [
  { name: 'Boston', state: 'MA', stateFips: '25', countyFips: '025' },
  { name: 'New York (Manhattan)', state: 'NY', stateFips: '36', countyFips: '061' },
  { name: 'Brooklyn', state: 'NY', stateFips: '36', countyFips: '047' },
  { name: 'Bronx', state: 'NY', stateFips: '36', countyFips: '005' },
  { name: 'Queens', state: 'NY', stateFips: '36', countyFips: '081' },
  { name: 'Staten Island', state: 'NY', stateFips: '36', countyFips: '085' },
  { name: 'Philadelphia', state: 'PA', stateFips: '42', countyFips: '101' },
  { name: 'San Francisco', state: 'CA', stateFips: '06', countyFips: '075' },
  { name: 'Chicago (Cook)', state: 'IL', stateFips: '17', countyFips: '031' },
  { name: 'New Orleans', state: 'LA', stateFips: '22', countyFips: '071' },
  { name: 'Washington DC', state: 'DC', stateFips: '11', countyFips: '001' },
  { name: 'Pittsburgh (Allegheny)', state: 'PA', stateFips: '42', countyFips: '003' },
  { name: 'Cincinnati (Hamilton)', state: 'OH', stateFips: '39', countyFips: '061' },
];

export const STATES_USED = Array.from(new Set(COUNTIES.map((c) => c.stateFips)));
