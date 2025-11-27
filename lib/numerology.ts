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
  2025: '01-29', 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03'
};

const CHINESE_ZODIAC_ANIMALS = [
  'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake',
  'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'
];

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

export function calculateLifePath(dateStr: string): number {
  const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
  let total = parseInt(parts[0]) + parseInt(parts[1]);
  for (const digit of parts[2].toString()) {
    total += parseInt(digit);
  }
  
  const masterNumbers = [11, 22, 28, 33, 20];
  if (masterNumbers.includes(total)) return total;
  
  while (total > 9) {
    total = total.toString().split('').reduce((sum, d) => sum + parseInt(d), 0);
    if (masterNumbers.includes(total)) return total;
  }
  
  return total;
}

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

export function calculatePersonalYear(incorporationDateStr: string, targetMonthYear: string): number {
  targetMonthYear = normalizeMonthYear(targetMonthYear);
  const incParts = incorporationDateStr.includes('/') ? incorporationDateStr.split('/') : incorporationDateStr.split('-');
  const birthDay = parseInt(incParts[0]);
  const birthMonth = parseInt(incParts[1]);
  
  const monthMap: Record<string, number> = {
    'Jan': 1, 'January': 1, 'Feb': 2, 'February': 2,
    'Mar': 3, 'March': 3, 'Apr': 4, 'April': 4,
    'May': 5, 'Jun': 6, 'June': 6, 'Jul': 7, 'July': 7,
    'Aug': 8, 'August': 8, 'Sep': 9, 'Sept': 9, 'September': 9,
    'Oct': 10, 'October': 10, 'Nov': 11, 'November': 11,
    'Dec': 12, 'December': 12
  };
  
  const targetParts = targetMonthYear.split(' ');
  const targetMonth = monthMap[targetParts[0]];
  const targetYear = parseInt(targetParts[1]);
  const yearToUse = targetMonth >= birthMonth ? targetYear : targetYear - 1;
  
  let total = birthDay + birthMonth;
  for (const digit of yearToUse.toString()) {
    total += parseInt(digit);
  }
  
  const masterNumbers = [11, 22, 28, 33, 20];
  if (masterNumbers.includes(total)) return total;
  
  while (total > 9) {
    total = total.toString().split('').reduce((sum, d) => sum + parseInt(d), 0);
    if (masterNumbers.includes(total)) return total;
  }
  
  return total;
}

export function calculatePersonalMonth(incorporationDateStr: string, targetMonthYear: string): number {
  targetMonthYear = normalizeMonthYear(targetMonthYear);
  const incParts = incorporationDateStr.includes('/') ? incorporationDateStr.split('/') : incorporationDateStr.split('-');
  const birthDay = parseInt(incParts[0]);
  const birthMonth = parseInt(incParts[1]);
  
  const monthMap: Record<string, number> = {
    'Jan': 1, 'January': 1, 'Feb': 2, 'February': 2,
    'Mar': 3, 'March': 3, 'Apr': 4, 'April': 4,
    'May': 5, 'Jun': 6, 'June': 6, 'Jul': 7, 'July': 7,
    'Aug': 8, 'August': 8, 'Sep': 9, 'Sept': 9, 'September': 9,
    'Oct': 10, 'October': 10, 'Nov': 11, 'November': 11,
    'Dec': 12, 'December': 12
  };
  
  const targetParts = targetMonthYear.split(' ');
  const targetMonth = monthMap[targetParts[0]];
  const targetYear = parseInt(targetParts[1]);
  const yearToUse = targetMonth >= birthMonth ? targetYear : targetYear - 1;
  
  let total = birthDay + birthMonth + targetMonth;
  for (const digit of yearToUse.toString()) {
    total += parseInt(digit);
  }
  
  const masterNumbers = [11, 22, 28, 33, 20];
  if (masterNumbers.includes(total)) return total;
  
  while (total > 9) {
    total = total.toString().split('').reduce((sum, d) => sum + parseInt(d), 0);
    if (masterNumbers.includes(total)) return total;
  }
  
  return total;
}