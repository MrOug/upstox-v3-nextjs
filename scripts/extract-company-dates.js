const fs = require('fs');
const readline = require('readline');

async function processCSV() {
    const inputFile = 'public/registered_companies.csv';
    const outputFile = 'public/company_dates.csv';

    const fileStream = fs.createReadStream(inputFile);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const outputStream = fs.createWriteStream(outputFile);
    outputStream.write('COMPANY_NAME,DATE_OF_REGISTRATION\n');

    let isFirstLine = true;
    let companyIdx = -1;
    let dateIdx = -1;
    let count = 0;

    for await (const line of rl) {
        if (isFirstLine) {
            const headers = line.split(',');
            companyIdx = headers.findIndex(h => h.includes('COMPANY_NAME'));
            dateIdx = headers.findIndex(h => h.includes('DATE_OF_REGISTRATION'));
            console.log(`Found columns: COMPANY_NAME at ${companyIdx}, DATE_OF_REGISTRATION at ${dateIdx}`);
            isFirstLine = false;
            continue;
        }

        // Simple CSV parse (handle quoted fields)
        const parts = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                parts.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        parts.push(current);

        if (parts.length > Math.max(companyIdx, dateIdx)) {
            const companyName = parts[companyIdx]?.trim() || '';
            const date = parts[dateIdx]?.trim() || '';
            if (companyName && date) {
                outputStream.write(`"${companyName.replace(/"/g, '""')}","${date}"\n`);
                count++;
                if (count % 100000 === 0) {
                    console.log(`Processed ${count} records...`);
                }
            }
        }
    }

    outputStream.end();
    console.log(`Done! Created ${outputFile} with ${count} records`);
}

processCSV().catch(console.error);
