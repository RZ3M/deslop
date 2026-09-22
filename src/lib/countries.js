// Countries and regions for the country filter.
// X's "About this account" reports either a country ("United States") or,
// for some accounts, only a region ("South Asia", "Europe"). LinkedIn profiles
// show free-text places ("Toronto, Ontario, Canada", "San Francisco Bay Area").

// [ISO code, name, subregion, ...aliases]
// Subregions: NAM Northern America, CAM Central America, CAR Caribbean, SAM South America,
// EUR Europe, NAF North Africa, SSA Sub-Saharan Africa, WAS West Asia / Middle East,
// CAS Central Asia, SAS South Asia, EAS East Asia, SEA Southeast Asia, OCE Oceania.
const DATA = [
  ['AF', 'Afghanistan', 'SAS'],
  ['AL', 'Albania', 'EUR'],
  ['DZ', 'Algeria', 'NAF'],
  ['AD', 'Andorra', 'EUR'],
  ['AO', 'Angola', 'SSA'],
  ['AG', 'Antigua and Barbuda', 'CAR'],
  ['AR', 'Argentina', 'SAM'],
  ['AM', 'Armenia', 'WAS'],
  ['AU', 'Australia', 'OCE'],
  ['AT', 'Austria', 'EUR', 'Österreich'],
  ['AZ', 'Azerbaijan', 'WAS'],
  ['BS', 'Bahamas', 'CAR', 'The Bahamas'],
  ['BH', 'Bahrain', 'WAS'],
  ['BD', 'Bangladesh', 'SAS'],
  ['BB', 'Barbados', 'CAR'],
  ['BY', 'Belarus', 'EUR'],
  ['BE', 'Belgium', 'EUR', 'België', 'Belgique'],
  ['BZ', 'Belize', 'CAM'],
  ['BJ', 'Benin', 'SSA'],
  ['BM', 'Bermuda', 'NAM'],
  ['BT', 'Bhutan', 'SAS'],
  ['BO', 'Bolivia', 'SAM'],
  ['BA', 'Bosnia and Herzegovina', 'EUR', 'Bosnia'],
  ['BW', 'Botswana', 'SSA'],
  ['BR', 'Brazil', 'SAM', 'Brasil'],
  ['BN', 'Brunei', 'SEA', 'Brunei Darussalam'],
  ['BG', 'Bulgaria', 'EUR'],
  ['BF', 'Burkina Faso', 'SSA'],
  ['BI', 'Burundi', 'SSA'],
  ['CV', 'Cabo Verde', 'SSA', 'Cape Verde'],
  ['KH', 'Cambodia', 'SEA'],
  ['CM', 'Cameroon', 'SSA'],
  ['CA', 'Canada', 'NAM'],
  ['KY', 'Cayman Islands', 'CAR'],
  ['CF', 'Central African Republic', 'SSA'],
  ['TD', 'Chad', 'SSA'],
  ['CL', 'Chile', 'SAM'],
  ['CN', 'China', 'EAS', 'Mainland China', "People's Republic of China", 'PRC'],
  ['CO', 'Colombia', 'SAM'],
  ['KM', 'Comoros', 'SSA'],
  ['CG', 'Congo', 'SSA', 'Republic of the Congo', 'Congo-Brazzaville'],
  ['CD', 'DR Congo', 'SSA', 'Democratic Republic of the Congo', 'DRC', 'Congo-Kinshasa'],
  ['CR', 'Costa Rica', 'CAM'],
  ['CI', "Côte d'Ivoire", 'SSA', 'Ivory Coast', "Cote d'Ivoire"],
  ['HR', 'Croatia', 'EUR', 'Hrvatska'],
  ['CU', 'Cuba', 'CAR'],
  ['CY', 'Cyprus', 'EUR'],
  ['CZ', 'Czechia', 'EUR', 'Czech Republic'],
  ['DK', 'Denmark', 'EUR', 'Danmark'],
  ['DJ', 'Djibouti', 'SSA'],
  ['DM', 'Dominica', 'CAR'],
  ['DO', 'Dominican Republic', 'CAR'],
  ['EC', 'Ecuador', 'SAM'],
  ['EG', 'Egypt', 'NAF'],
  ['SV', 'El Salvador', 'CAM'],
  ['GQ', 'Equatorial Guinea', 'SSA'],
  ['ER', 'Eritrea', 'SSA'],
  ['EE', 'Estonia', 'EUR'],
  ['SZ', 'Eswatini', 'SSA', 'Swaziland'],
  ['ET', 'Ethiopia', 'SSA'],
  ['FJ', 'Fiji', 'OCE'],
  ['FI', 'Finland', 'EUR', 'Suomi'],
  ['FR', 'France', 'EUR'],
  ['GA', 'Gabon', 'SSA'],
  ['GM', 'Gambia', 'SSA', 'The Gambia'],
  ['GE', 'Georgia', 'WAS'],
  ['DE', 'Germany', 'EUR', 'Deutschland'],
  ['GH', 'Ghana', 'SSA'],
  ['GI', 'Gibraltar', 'EUR'],
  ['GR', 'Greece', 'EUR'],
  ['GL', 'Greenland', 'NAM'],
  ['GD', 'Grenada', 'CAR'],
  ['GU', 'Guam', 'OCE'],
  ['GT', 'Guatemala', 'CAM'],
  ['GN', 'Guinea', 'SSA'],
  ['GW', 'Guinea-Bissau', 'SSA'],
  ['GY', 'Guyana', 'SAM'],
  ['HT', 'Haiti', 'CAR'],
  ['HN', 'Honduras', 'CAM'],
  ['HK', 'Hong Kong', 'EAS', 'Hong Kong SAR'],
  ['HU', 'Hungary', 'EUR', 'Magyarország'],
  ['IS', 'Iceland', 'EUR'],
  ['IN', 'India', 'SAS', 'Bharat'],
  ['ID', 'Indonesia', 'SEA'],
  ['IR', 'Iran', 'WAS', 'Islamic Republic of Iran'],
  ['IQ', 'Iraq', 'WAS'],
  ['IE', 'Ireland', 'EUR', 'Republic of Ireland'],
  ['IL', 'Israel', 'WAS'],
  ['IT', 'Italy', 'EUR', 'Italia'],
  ['JM', 'Jamaica', 'CAR'],
  ['JP', 'Japan', 'EAS'],
  ['JO', 'Jordan', 'WAS'],
  ['KZ', 'Kazakhstan', 'CAS'],
  ['KE', 'Kenya', 'SSA'],
  ['KI', 'Kiribati', 'OCE'],
  ['XK', 'Kosovo', 'EUR'],
  ['KW', 'Kuwait', 'WAS'],
  ['KG', 'Kyrgyzstan', 'CAS'],
  ['LA', 'Laos', 'SEA', "Lao People's Democratic Republic"],
  ['LV', 'Latvia', 'EUR'],
  ['LB', 'Lebanon', 'WAS'],
  ['LS', 'Lesotho', 'SSA'],
  ['LR', 'Liberia', 'SSA'],
  ['LY', 'Libya', 'NAF'],
  ['LI', 'Liechtenstein', 'EUR'],
  ['LT', 'Lithuania', 'EUR'],
  ['LU', 'Luxembourg', 'EUR'],
  ['MO', 'Macao', 'EAS', 'Macau'],
  ['MG', 'Madagascar', 'SSA'],
  ['MW', 'Malawi', 'SSA'],
  ['MY', 'Malaysia', 'SEA'],
  ['MV', 'Maldives', 'SAS'],
  ['ML', 'Mali', 'SSA'],
  ['MT', 'Malta', 'EUR'],
  ['MH', 'Marshall Islands', 'OCE'],
  ['MR', 'Mauritania', 'SSA'],
  ['MU', 'Mauritius', 'SSA'],
  ['MX', 'Mexico', 'CAM', 'México'],
  ['FM', 'Micronesia', 'OCE'],
  ['MD', 'Moldova', 'EUR'],
  ['MC', 'Monaco', 'EUR'],
  ['MN', 'Mongolia', 'EAS'],
  ['ME', 'Montenegro', 'EUR'],
  ['MA', 'Morocco', 'NAF'],
  ['MZ', 'Mozambique', 'SSA'],
  ['MM', 'Myanmar', 'SEA', 'Burma'],
  ['NA', 'Namibia', 'SSA'],
  ['NR', 'Nauru', 'OCE'],
  ['NP', 'Nepal', 'SAS'],
  ['NL', 'Netherlands', 'EUR', 'The Netherlands', 'Holland', 'Nederland'],
  ['NZ', 'New Zealand', 'OCE', 'Aotearoa'],
  ['NI', 'Nicaragua', 'CAM'],
  ['NE', 'Niger', 'SSA'],
  ['NG', 'Nigeria', 'SSA'],
  ['KP', 'North Korea', 'EAS', 'DPRK', "Democratic People's Republic of Korea"],
  ['MK', 'North Macedonia', 'EUR', 'Macedonia'],
  ['NO', 'Norway', 'EUR', 'Norge'],
  ['OM', 'Oman', 'WAS'],
  ['PK', 'Pakistan', 'SAS'],
  ['PW', 'Palau', 'OCE'],
  ['PS', 'Palestine', 'WAS', 'Palestinian Territories', 'State of Palestine', 'Palestinian Territory'],
  ['PA', 'Panama', 'CAM'],
  ['PG', 'Papua New Guinea', 'OCE'],
  ['PY', 'Paraguay', 'SAM'],
  ['PE', 'Peru', 'SAM', 'Perú'],
  ['PH', 'Philippines', 'SEA', 'The Philippines'],
  ['PL', 'Poland', 'EUR', 'Polska'],
  ['PT', 'Portugal', 'EUR'],
  ['PR', 'Puerto Rico', 'CAR'],
  ['QA', 'Qatar', 'WAS'],
  ['RO', 'Romania', 'EUR', 'România'],
  ['RU', 'Russia', 'EUR', 'Russian Federation'],
  ['RW', 'Rwanda', 'SSA'],
  ['KN', 'Saint Kitts and Nevis', 'CAR'],
  ['LC', 'Saint Lucia', 'CAR'],
  ['VC', 'Saint Vincent and the Grenadines', 'CAR'],
  ['WS', 'Samoa', 'OCE'],
  ['SM', 'San Marino', 'EUR'],
  ['ST', 'São Tomé and Príncipe', 'SSA', 'Sao Tome and Principe'],
  ['SA', 'Saudi Arabia', 'WAS', 'KSA', 'Kingdom of Saudi Arabia'],
  ['SN', 'Senegal', 'SSA'],
  ['RS', 'Serbia', 'EUR', 'Srbija'],
  ['SC', 'Seychelles', 'SSA'],
  ['SL', 'Sierra Leone', 'SSA'],
  ['SG', 'Singapore', 'SEA'],
  ['SK', 'Slovakia', 'EUR'],
  ['SI', 'Slovenia', 'EUR'],
  ['SB', 'Solomon Islands', 'OCE'],
  ['SO', 'Somalia', 'SSA'],
  ['ZA', 'South Africa', 'SSA'],
  ['KR', 'South Korea', 'EAS', 'Korea', 'Republic of Korea', 'Korea, Republic of'],
  ['SS', 'South Sudan', 'SSA'],
  ['ES', 'Spain', 'EUR', 'España'],
  ['LK', 'Sri Lanka', 'SAS'],
  ['SD', 'Sudan', 'NAF'],
  ['SR', 'Suriname', 'SAM'],
  ['SE', 'Sweden', 'EUR', 'Sverige'],
  ['CH', 'Switzerland', 'EUR', 'Schweiz', 'Suisse'],
  ['SY', 'Syria', 'WAS', 'Syrian Arab Republic'],
  ['TW', 'Taiwan', 'EAS'],
  ['TJ', 'Tajikistan', 'CAS'],
  ['TZ', 'Tanzania', 'SSA'],
  ['TH', 'Thailand', 'SEA'],
  ['TL', 'Timor-Leste', 'SEA', 'East Timor'],
  ['TG', 'Togo', 'SSA'],
  ['TO', 'Tonga', 'OCE'],
  ['TT', 'Trinidad and Tobago', 'CAR'],
  ['TN', 'Tunisia', 'NAF'],
  ['TR', 'Türkiye', 'WAS', 'Turkey', 'Turkiye'],
  ['TM', 'Turkmenistan', 'CAS'],
  ['TV', 'Tuvalu', 'OCE'],
  ['UG', 'Uganda', 'SSA'],
  ['UA', 'Ukraine', 'EUR'],
  ['AE', 'United Arab Emirates', 'WAS', 'UAE', 'Dubai', 'Abu Dhabi'],
  ['GB', 'United Kingdom', 'EUR', 'UK', 'Great Britain', 'Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
  ['US', 'United States', 'NAM', 'USA', 'US', 'United States of America', 'America', 'U.S.', 'U.S.A.'],
  ['UY', 'Uruguay', 'SAM'],
  ['UZ', 'Uzbekistan', 'CAS'],
  ['VU', 'Vanuatu', 'OCE'],
  ['VA', 'Vatican City', 'EUR', 'Holy See'],
  ['VE', 'Venezuela', 'SAM'],
  ['VN', 'Vietnam', 'SEA', 'Viet Nam'],
  ['YE', 'Yemen', 'WAS'],
  ['ZM', 'Zambia', 'SSA'],
  ['ZW', 'Zimbabwe', 'SSA'],
];

export const COUNTRIES = DATA.map(([code, name, sub, ...aliases]) => ({ code, name, sub, aliases, flag: flagOf(code) }));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

const ASIA = ['SAS', 'EAS', 'SEA', 'CAS', 'WAS'];

// Region ids are prefixed with "region:" in the blocked list.
export const REGIONS = [
  { id: 'africa', name: 'Africa', subs: ['NAF', 'SSA'], aliases: [] },
  { id: 'north-africa', name: 'North Africa', subs: ['NAF'], aliases: [] },
  { id: 'sub-saharan-africa', name: 'Sub-Saharan Africa', subs: ['SSA'], aliases: [] },
  { id: 'europe', name: 'Europe', subs: ['EUR'], aliases: ['European Union', 'EU'] },
  { id: 'north-america', name: 'North America', subs: ['NAM', 'CAM', 'CAR'], aliases: [] },
  { id: 'central-america', name: 'Central America', subs: ['CAM'], aliases: [] },
  { id: 'caribbean', name: 'Caribbean', subs: ['CAR'], aliases: ['The Caribbean'] },
  { id: 'south-america', name: 'South America', subs: ['SAM'], aliases: [] },
  {
    id: 'latin-america',
    name: 'Latin America',
    subs: ['SAM', 'CAM', 'CAR'],
    aliases: ['Latin America and the Caribbean', 'Latin America & Caribbean', 'LATAM'],
  },
  { id: 'asia', name: 'Asia', subs: ASIA, aliases: [] },
  { id: 'south-asia', name: 'South Asia', subs: ['SAS'], aliases: ['Southern Asia'] },
  { id: 'east-asia', name: 'East Asia', subs: ['EAS'], aliases: ['Eastern Asia'] },
  { id: 'southeast-asia', name: 'Southeast Asia', subs: ['SEA'], aliases: ['South-East Asia', 'South East Asia'] },
  {
    id: 'east-asia-pacific',
    name: 'East Asia & Pacific',
    subs: ['EAS', 'SEA', 'OCE'],
    aliases: ['East Asia and Pacific', 'East Asia and the Pacific', 'Asia Pacific', 'Asia-Pacific', 'APAC'],
  },
  { id: 'central-asia', name: 'Central Asia', subs: ['CAS'], aliases: [] },
  { id: 'middle-east', name: 'Middle East', subs: ['WAS'], aliases: ['West Asia', 'Western Asia'], extra: ['EG'] },
  {
    id: 'mena',
    name: 'Middle East & North Africa',
    subs: ['WAS', 'NAF'],
    aliases: ['Middle East and North Africa', 'MENA'],
  },
  { id: 'oceania', name: 'Oceania', subs: ['OCE'], aliases: ['Australia and Oceania', 'Pacific'] },
];

const BY_REGION = new Map(REGIONS.map((r) => [r.id, r]));

const INDEX = new Map();
for (const c of COUNTRIES) {
  for (const n of [c.name, ...c.aliases]) INDEX.set(norm(n), { kind: 'country', code: c.code });
}
for (const r of REGIONS) {
  for (const n of [r.name, ...r.aliases]) INDEX.set(norm(n), { kind: 'region', id: r.id });
}

// US states and Canadian provinces show up as the last part of some places
// ("Austin, Texas") and are easy to resolve without the model.
const US_STATES =
  'alabama alaska arizona arkansas california colorado connecticut delaware florida hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada ohio oklahoma oregon pennsylvania tennessee texas utah vermont virginia washington wisconsin wyoming'.split(' ');
const US_STATES_MULTI = ['new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'rhode island', 'south carolina', 'south dakota', 'west virginia', 'district of columbia', 'washington dc', 'washington d.c.'];
const CA_PROVINCES = ['ontario', 'quebec', 'québec', 'british columbia', 'alberta', 'manitoba', 'saskatchewan', 'nova scotia', 'new brunswick', 'newfoundland and labrador', 'prince edward island'];
for (const s of [...US_STATES, ...US_STATES_MULTI]) if (!INDEX.has(norm(s))) INDEX.set(norm(s), { kind: 'country', code: 'US' });
for (const p of CA_PROVINCES) INDEX.set(norm(p), { kind: 'country', code: 'CA' });

// Resolve free text to a country or region. Returns null when unsure; the
// caller can then ask Jev to pick among the blocked countries.
export function matchPlace(raw) {
  if (!raw) return null;
  const whole = INDEX.get(norm(raw));
  if (whole) return describe(whole);

  const parts = raw.split(/[,|·]/).map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const key = norm(parts[i]);
    // "Atlanta, Georgia" vs "Tbilisi, Georgia": let the model decide.
    if (key === 'georgia' && parts.length > 1) return null;
    const hit = INDEX.get(key);
    if (hit) return describe(hit);
  }
  return null;
}

export function getCountry(code) {
  return BY_CODE.get(code) || null;
}

export function getRegion(id) {
  return BY_REGION.get(id) || null;
}

export function regionContains(regionId, countryCode) {
  const r = BY_REGION.get(regionId);
  const c = BY_CODE.get(countryCode);
  if (!r || !c) return false;
  return r.subs.includes(c.sub) || (r.extra || []).includes(c.code);
}

// blocked: array of country codes ("IN") and region ids ("region:europe").
// includeRegions: when an account only discloses a region, block it if that
// region contains any blocked country.
export function isBlockedPlace(place, blocked, includeRegions) {
  if (!place || !blocked?.length) return false;
  const codes = blocked.filter((b) => !b.startsWith('region:'));
  const regions = blocked.filter((b) => b.startsWith('region:')).map((b) => b.slice(7));

  if (place.kind === 'country') {
    return codes.includes(place.code) || regions.some((r) => regionContains(r, place.code));
  }
  if (place.kind === 'region') {
    if (regions.includes(place.id)) return true;
    return includeRegions && codes.some((code) => regionContains(place.id, code));
  }
  return false;
}

export function placeLabel(place) {
  if (!place) return 'Unknown';
  return place.kind === 'country' ? `${place.flag} ${place.name}` : `🌐 ${place.name}`;
}

function describe(hit) {
  if (hit.kind === 'country') {
    const c = BY_CODE.get(hit.code);
    return { kind: 'country', code: c.code, name: c.name, flag: c.flag };
  }
  const r = BY_REGION.get(hit.id);
  return { kind: 'region', id: r.id, name: r.name };
}

function norm(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function flagOf(code) {
  if (code === 'XK') return '🇽🇰';
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
