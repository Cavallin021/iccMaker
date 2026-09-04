import { execSync } from 'child_process';
const text = execSync('pdftotext "LOUVORES DA CAPITAL 2025.pdf" -', { encoding: 'utf-8' });
const lines = text.split('\n');
const map: Record<string, string> = {};
for (const line of lines) {
  const match = line.match(/^(\d+)\s+([A-ZÇÃÕÁÉÍÓÚÂÊÔÀ\s?!]+)$/);
  if (match) {
    const num = match[1].padStart(3, '0');
    let title = match[2].trim().toLowerCase().replace(/(^\w|\s\w)/g, m => m.toUpperCase()); // Title Case
    map[title] = num;
  }
}
console.log(Object.keys(map).length, 'canticos encontrados');
console.log(Object.entries(map).slice(0, 5));
