import type {
  NumerologyRecommendation,
  MonthlyData,
  RecommendationLabel,
  NumericPatternEntry,
} from './types';

const CHINESE_NEW_YEAR_DATES: Record<number, string> = {
  1930: '01-30', 1931: '02-17', 1932: '02-06', 1933: '01-26', 1934: '02-14',
  1935: '02-04', 1936: '01-24', 1937: '02-11', 1938: '01-31', 1939: '02-19',
  1940: '02-08', 1941: '01-27', 1942: '02-15', 1943: '02-05', 1944: '01-25',
  1945: '02-13', 1946: '02-02', 1947: '01-22', 1948: '02-10', 1949: '01-29',
  1950: '02-17', 1951: '02-06', 1952: '01-27', 1953: '02-14', 1954: '02-03',
  1955: '01-24', 1956: '02-12', 1957: '01-31', 1958: '02-18', 1959: '02-08',
  1960: '01-28', 1961: '02-15', 1962: '02-05', 1963: '01-25', 1964: '02-13',
  1965: '02-02', 1966: '01-21', 1967: '02-09', 1968: '01-30', 1969: '02-17',
  1970: '02-06', 1971: '01-27', 1972: '02-15', 1973: '02-03', 1974: '01-23',
  1975: '02-11', 1976: '01-31', 1977: '02-18', 1978: '02-07', 1979: '01-28',
  1980: '02-16', 1981: '02-05', 1982: '01-25', 1983: '02-13', 1984: '02-02',
  1985: '02-20', 1986: '02-09', 1987: '01-29', 1988: '02-17', 1989: '02-06',
  1990: '01-27', 1991: '02-15', 1992: '02-04', 1993: '01-23', 1994: '02-10',
  1995: '01-31', 1996: '02-19', 1997: '02-07', 1998: '01-28', 1999: '02-16',
  2000: '02-05', 2001: '01-24', 2002: '02-12', 2003: '02-01', 2004: '01-22',
  2005: '02-09', 2006: '01-29', 2007: '02-18', 2008: '02-07', 2009: '01-26',
  2010: '02-14', 2011: '02-03', 2012: '01-23', 2013: '02-10', 2014: '01-31',
  2015: '02-19', 2016: '02-08', 2017: '01-28', 2018: '02-16', 2019: '02-05',
  2020: '01-25', 2021: '02-12', 2022: '02-01', 2023: '01-22', 2024: '02-10',
  2025: '01-29', 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03',
};

const CHINESE_ZODIAC_ANIMALS = [
  'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake',
  'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig',
];

const MASTER_NUMBERS = [11, 22, 28, 33, 20];

const MONTH_MAP: Record<string, number> = {
  'Jan': 1, 'January': 1, 'Feb': 2, 'February': 2,
  'Mar': 3, 'March': 3, 'Apr': 4, 'April': 4,
  'May': 5, 'Jun': 6, 'June': 6, 'Jul': 7, 'July': 7,
  'Aug': 8, 'August': 8, 'Sep': 9, 'Sept': 9, 'September': 9,
  'Oct': 10, 'October': 10, 'Nov': 11, 'November': 11,
  'Dec': 12, 'December': 12,
};

// ─── Zodiac ────────────────────────────────────────────────────────

export function getChineseZodiac(dateStr: string): string {
  const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const year = parseInt(parts[2]);

  let chineseYear = year;
  if (CHINESE_NEW_YEAR_DATES[year]) {
    const cnyParts = CHINESE_NEW_YEAR_DATES[year].split('-');
    const cnyMonth = parseInt(cnyParts[0]);
    const cnyDay = parseInt(cnyParts[1]);
    if (month < cnyMonth || (month === cnyMonth && day < cnyDay)) {
      chineseYear = year - 1;
    }
  }

  return CHINESE_ZODIAC_ANIMALS[(chineseYear - 1924) % 12];
}

// ─── Life Path ─────────────────────────────────────────────────────

export function calculateLifePath(dateStr: string): number {
  const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
  let total = parseInt(parts[0]) + parseInt(parts[1]);
  for (const digit of parts[2].toString()) {
    total += parseInt(digit);
  }

  if (MASTER_NUMBERS.includes(total)) return total;

  while (total > 9) {
    total = total.toString().split('').reduce((sum, d) => sum + parseInt(d), 0);
    if (MASTER_NUMBERS.includes(total)) return total;
  }

  return total;
}

// ─── Month-Year helpers ────────────────────────────────────────────

export function normalizeMonthYear(dateStr: string): string {
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    let year = parts[1];
    if (year.length === 2) {
      year = parseInt(year) < 50 ? '20' + year : '19' + year;
    }
    return parts[0] + ' ' + year;
  }
  return dateStr;
}

/** Parse a "MMM YYYY" string into { month: 1-12, year: number } */
function parseMonthYear(monthYear: string): { month: number; year: number } | null {
  const normalized = normalizeMonthYear(monthYear);
  const parts = normalized.split(' ');
  if (parts.length < 2) return null;
  const month = MONTH_MAP[parts[0]];
  const year = parseInt(parts[1]);
  if (!month || isNaN(year)) return null;
  return { month, year };
}

// ─── Personal Year / Month ─────────────────────────────────────────

function reduceNumber(num: number): number {
  if (MASTER_NUMBERS.includes(num)) return num;
  let result = num;
  while (result > 9) {
    result = result.toString().split('').reduce((sum, d) => sum + parseInt(d), 0);
    if (MASTER_NUMBERS.includes(result)) return result;
  }
  return result;
}

export function calculatePersonalYear(incorporationDateStr: string, targetMonthYear: string): number {
  const parsed = parseMonthYear(targetMonthYear);
  if (!parsed) return 0;

  const incParts = incorporationDateStr.includes('/')
    ? incorporationDateStr.split('/')
    : incorporationDateStr.split('-');
  const birthDay = parseInt(incParts[0]);
  const birthMonth = parseInt(incParts[1]);

  const { month: targetMonth, year: targetYear } = parsed;
  const yearToUse = targetMonth >= birthMonth ? targetYear : targetYear - 1;

  let total = birthDay + birthMonth;
  for (const digit of yearToUse.toString()) {
    total += parseInt(digit);
  }

  return reduceNumber(total);
}

export function calculatePersonalMonth(incorporationDateStr: string, targetMonthYear: string): number {
  const parsed = parseMonthYear(targetMonthYear);
  if (!parsed) return 0;

  const incParts = incorporationDateStr.includes('/')
    ? incorporationDateStr.split('/')
    : incorporationDateStr.split('-');
  const birthDay = parseInt(incParts[0]);
  const birthMonth = parseInt(incParts[1]);

  const { month: targetMonth, year: targetYear } = parsed;
  const yearToUse = targetMonth >= birthMonth ? targetYear : targetYear - 1;

  let total = birthDay + birthMonth + targetMonth;
  for (const digit of yearToUse.toString()) {
    total += parseInt(digit);
  }

  return reduceNumber(total);
}

// ─── Pattern Analysis & Recommendations ────────────────────────────

/**
 * Build a histogram of average returns grouped by a numerology value
 * (Personal Year or Personal Month).
 */
function buildNumerologyHistory(
  monthlyData: MonthlyData[],
  incorporationDate: string,
  getValue: (incDate: string, monthYear: string) => number,
): NumericPatternEntry[] {
  const buckets = new Map<number, number[]>();

  for (const m of monthlyData) {
    const change = parseFloat(m.change);
    if (isNaN(change)) continue;

    const value = getValue(incorporationDate, m.date);
    if (value === 0) continue; // skip unparseable

    if (!buckets.has(value)) buckets.set(value, []);
    buckets.get(value)!.push(change);
  }

  const entries: NumericPatternEntry[] = [];
  buckets.forEach((returns, value) => {
    const sum = returns.reduce((a: number, b: number) => a + b, 0);
    entries.push({
      value,
      avgReturn: parseFloat((sum / returns.length).toFixed(2)),
      count: returns.length,
    });
  });

  entries.sort((a, b) => b.avgReturn - a.avgReturn);
  return entries;
}

/**
 * Score a single numeric value (PY or PM) against its historical performance.
 * Returns a 0-100 score where:
 *   - 100 = this value historically had the best average return
 *   - 0   = this value historically had the worst average return
 *   - 50  = neutral / no data / all values identical
 */
function scoreNumerologyValue(
  currentValue: number,
  history: NumericPatternEntry[],
): { score: number; best: NumericPatternEntry; worst: NumericPatternEntry } {
  const best: NumericPatternEntry = { value: 0, avgReturn: -Infinity, count: 0 };
  const worst: NumericPatternEntry = { value: 0, avgReturn: Infinity, count: 0 };

  for (const h of history) {
    if (h.avgReturn > best.avgReturn) { best.value = h.value; best.avgReturn = h.avgReturn; best.count = h.count; }
    if (h.avgReturn < worst.avgReturn) { worst.value = h.value; worst.avgReturn = h.avgReturn; worst.count = h.count; }
  }

  const current = history.find(h => h.value === currentValue);

  // No data at all
  if (!current || current.count === 0) return { score: 50, best, worst };

  const maxRet = best.avgReturn;
  const minRet = worst.avgReturn;

  // All identical → neutral
  if (maxRet === minRet) return { score: 50, best, worst };

  // Normalise 0-100
  let raw = ((current.avgReturn - minRet) / (maxRet - minRet)) * 100;

  // Confidence: pull toward 50 when sample size is tiny
  const confidence = Math.min(current.count / 3, 1);
  const score = Math.round(raw * confidence + 50 * (1 - confidence));

  return { score: Math.max(0, Math.min(100, score)), best, worst };
}

function getRecommendationLabel(score: number): RecommendationLabel {
  if (score >= 70) return 'STRONG BUY';
  if (score >= 50) return 'BUY';
  if (score >= 30) return 'NEUTRAL';
  return 'AVOID';
}

function buildSummary(
  label: RecommendationLabel,
  score: number,
  currentPY: number,
  currentPM: number,
  pyScore: number,
  pmScore: number,
  pyHistory: NumericPatternEntry[],
  pmHistory: NumericPatternEntry[],
): string {
  const parts: string[] = [];

  if (label === 'STRONG BUY' || label === 'BUY') {
    const pyRec = pyHistory.find(h => h.value === currentPY);
    const pmRec = pmHistory.find(h => h.value === currentPM);
    if (pyRec && pyRec.count >= 2) {
      parts.push(`PY ${currentPY} avg +${pyRec.avgReturn}% (${pyRec.count}x)`);
    }
    if (pmRec && pmRec.count >= 2) {
      parts.push(`PM ${currentPM} avg +${pmRec.avgReturn}% (${pmRec.count}x)`);
    }
  }

  if (parts.length === 0) {
    if (label === 'STRONG BUY') return 'Strong historical performance in current cycle';
    if (label === 'BUY') return 'Above-average historical returns in this cycle';
    if (label === 'AVOID') return 'Weak historical performance in current cycle';
    return 'Mixed or insufficient historical data';
  }

  const prefix = label === 'STRONG BUY' ? '🔥 ' : '';
  return prefix + parts.join(' · ');
}

/**
 * Analyze monthly candle data through a numerological lens and produce
 * a buy/hold/avoid recommendation based on how the current Personal Year
 * and Personal Month values have performed for this stock in the past.
 *
 * @param monthlyData  Array of monthly data points (must have `date` and `change`).
 * @param incorporationDate  DD/MM/YYYY string.
 * @returns A `NumerologyRecommendation` or `null` if there isn't enough data.
 */
export function analyzeNumerologyPatterns(
  monthlyData: MonthlyData[],
  incorporationDate: string,
): NumerologyRecommendation | null {
  if (!monthlyData || monthlyData.length < 3) return null;
  if (!incorporationDate || incorporationDate === 'N/A' || incorporationDate === 'Not Available') return null;

  // Life path & zodiac (static)
  const lifePath = calculateLifePath(incorporationDate);
  const companyZodiac = getChineseZodiac(incorporationDate);

  // Build PY / PM histories
  const pyHistory = buildNumerologyHistory(monthlyData, incorporationDate, calculatePersonalYear);
  const pmHistory = buildNumerologyHistory(monthlyData, incorporationDate, calculatePersonalMonth);

  if (pyHistory.length === 0 || pmHistory.length === 0) return null;

  // Current period = latest month
  const latestMonth = monthlyData[monthlyData.length - 1];
  const currentPY = latestMonth.py ?? calculatePersonalYear(incorporationDate, latestMonth.date);
  const currentPM = latestMonth.pm ?? calculatePersonalMonth(incorporationDate, latestMonth.date);

  // Score
  const pyResult = scoreNumerologyValue(currentPY, pyHistory);
  const pmResult = scoreNumerologyValue(currentPM, pmHistory);

  const score = Math.round(pyResult.score * 0.55 + pmResult.score * 0.45);
  const label = getRecommendationLabel(score);
  const summary = buildSummary(label, score, currentPY, currentPM, pyResult.score, pmResult.score, pyHistory, pmHistory);

  return {
    score,
    pyScore: pyResult.score,
    pmScore: pmResult.score,
    lifePath,
    companyZodiac,
    currentPY,
    currentPM,
    bestPY: pyResult.best,
    bestPM: pmResult.best,
    worstPY: pyResult.worst,
    worstPM: pmResult.worst,
    pyHistory,
    pmHistory,
    label,
    summary,
  };
}
