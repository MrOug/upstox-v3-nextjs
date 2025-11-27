export function parseCSVLine(text: string): string[] {
  const matches: string[] = [];
  const re = /(?!\s*$)\s*(?:'([^']*)'|"([^"]*)"|(^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*(?:,|$)/g;
  let match;
  
  while ((match = re.exec(text)) !== null) {
    if (match[2] !== undefined) matches.push(match[2]);
    else if (match[1] !== undefined) matches.push(match[1]);
    else if (match[3] !== undefined) matches.push(match[3]);
    else matches.push('');
  }
  
  return matches;
}

export function parseCSV(text: string) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];
  
  const headers = parseCSVLine(lines[0]);
  const result: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const currentline = parseCSVLine(lines[i]);
    if (currentline.length >= headers.length) {
      const obj: any = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = currentline[j];
      }
      result.push(obj);
    }
  }
  
  return result;
}

export function parseStockCSV(csvContent: string) {
  const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l);
  const stocks: any[] = [];
  let currentStock: string | null = null;
  let currentIncDate: string | null = null;
  let monthlyData: any[] = [];
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('Company Name') || line.startsWith('Monthly Breakdown') || line.startsWith('Date,Open,Close')) {
      continue;
    }
    
    const parts = line.split(',');
    
    if (parts.length >= 2 && (parts[1].includes('/') || parts[1].includes('-')) && 
        (parts[1].split('/').length === 3 || parts[1].split('-').length === 3)) {
      if (currentStock && monthlyData.length > 0) {
        stocks.push({
          stock: currentStock,
          incorporationDate: currentIncDate,
          monthlyData: [...monthlyData]
        });
      }
      currentStock = parts[0].trim();
      currentIncDate = parts[1].trim();
      monthlyData = [];
    } else if (parts.length >= 5 && monthNames.some(m => parts[0].startsWith(m))) {
      monthlyData.push({
        date: parts[0].trim(),
        open: parts[1].trim() || '',
        close: parts[2].trim() || '',
        high: parts[3].trim() || '',
        low: parts[4].trim() || '',
        changePct: parts[5] ? parts[5].trim() : ''
      });
    }
  }
  
  if (currentStock && monthlyData.length > 0) {
    stocks.push({
      stock: currentStock,
      incorporationDate: currentIncDate,
      monthlyData: [...monthlyData]
    });
  }
  
  return stocks;
}

export function downloadCSV(csvContent: string, fileName: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  window.URL.revokeObjectURL(url);
}