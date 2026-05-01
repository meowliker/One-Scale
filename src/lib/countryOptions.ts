export interface CountryOption {
  value: string;
  label: string;
}

export const WORLDWIDE_COUNTRY_VALUE = 'WORLDWIDE';

const COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX',
  'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ',
  'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK',
  'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM',
  'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS',
  'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN',
  'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN',
  'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV',
  'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ',
  'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI',
  'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM',
  'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC',
  'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV',
  'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR',
  'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
] as const;

const LABEL_OVERRIDES: Record<string, string> = {
  CD: 'Democratic Republic of the Congo',
  CG: 'Republic of the Congo',
  CI: "Cote d'Ivoire",
  CZ: 'Czech Republic',
  FK: 'Falkland Islands',
  FM: 'Micronesia',
  GB: 'United Kingdom',
  HK: 'Hong Kong',
  IR: 'Iran',
  KP: 'North Korea',
  KR: 'South Korea',
  LA: 'Laos',
  MD: 'Moldova',
  MK: 'North Macedonia',
  MO: 'Macau',
  PS: 'Palestine',
  RU: 'Russia',
  SZ: 'Eswatini',
  SY: 'Syria',
  TW: 'Taiwan',
  TZ: 'Tanzania',
  US: 'United States',
  VA: 'Vatican City',
  VE: 'Venezuela',
  VN: 'Vietnam',
};

const regionNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function getRegionLabel(code: string): string {
  return LABEL_OVERRIDES[code] || regionNames?.of(code) || code;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { value: WORLDWIDE_COUNTRY_VALUE, label: 'Worldwide' },
  ...COUNTRY_CODES.map((code) => ({ value: code, label: getRegionLabel(code) })).sort((a, b) =>
    a.label.localeCompare(b.label),
  ),
];

export const COUNTRY_ALIASES: Record<string, string> = {
  america: 'US',
  bolivia: 'BO',
  britain: 'GB',
  'brunei': 'BN',
  'burma': 'MM',
  'cape verde': 'CV',
  'caribbean netherlands': 'BQ',
  'congo': 'CG',
  'congo democratic republic': 'CD',
  'congo drc': 'CD',
  'congo republic': 'CG',
  'czechia': 'CZ',
  'd r congo': 'CD',
  'democratic republic congo': 'CD',
  'democratic republic of congo': 'CD',
  'dr congo': 'CD',
  drc: 'CD',
  england: 'GB',
  global: WORLDWIDE_COUNTRY_VALUE,
  iran: 'IR',
  ivory: 'CI',
  'ivory coast': 'CI',
  korea: 'KR',
  kosovo: 'XK',
  laos: 'LA',
  macau: 'MO',
  micronesia: 'FM',
  moldova: 'MD',
  myanmar: 'MM',
  palestine: 'PS',
  russia: 'RU',
  swaziland: 'SZ',
  syria: 'SY',
  tanzania: 'TZ',
  turkey: 'TR',
  turkiye: 'TR',
  uae: 'AE',
  uk: 'GB',
  usa: 'US',
  'united states of america': 'US',
  vatican: 'VA',
  venezuela: 'VE',
  vietnam: 'VN',
  world: WORLDWIDE_COUNTRY_VALUE,
  worldwide: WORLDWIDE_COUNTRY_VALUE,
};

export function normalizeCountryCode(value?: string): string {
  const code = String(value || '').trim().toUpperCase();
  if (code === WORLDWIDE_COUNTRY_VALUE) return WORLDWIDE_COUNTRY_VALUE;
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

export function dedupeCountryCodes(values: string[]): string[] {
  return [...new Set(values.map(normalizeCountryCode).filter(Boolean))];
}

export function normalizeCountryName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function parseCountryInput(value: string): string[] {
  const labelMap = new Map(
    COUNTRY_OPTIONS.map((option) => [normalizeCountryName(option.label), option.value]),
  );
  const aliasMap = new Map(
    Object.entries(COUNTRY_ALIASES).map(([name, code]) => [normalizeCountryName(name), code]),
  );

  return dedupeCountryCodes(
    value
      .split(/[\n,;\t]+/)
      .map((entry) => entry.replace(/^(include|exclude)\s+/i, '').replace(/\s+x$/i, '').trim())
      .map((entry) => {
        const code = normalizeCountryCode(entry);
        if (code) return code;
        const normalizedName = normalizeCountryName(entry);
        return labelMap.get(normalizedName) || aliasMap.get(normalizedName) || '';
      }),
  );
}

export function getCountryLabel(value?: string): string {
  const code = normalizeCountryCode(value);
  if (code === WORLDWIDE_COUNTRY_VALUE) return 'Worldwide';
  return COUNTRY_OPTIONS.find((option) => option.value === code)?.label || code || 'Not set';
}
