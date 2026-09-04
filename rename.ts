import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const canticosDir = path.resolve(__dirname, 'apps/canticos');
const pdfPath = path.resolve(__dirname, 'LOUVORES DA CAPITAL 2025.pdf');

if (!fs.existsSync(pdfPath)) {
  console.error(`PDF não encontrado: ${pdfPath}`);
  process.exit(1);
}

// Extrai o texto do PDF
const text = execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf-8' });
const lines = text.split('\n');

const mappings: Record<string, string> = {};

// Função auxiliar para normalizar string (remover acentos e lowercase) para comparação
// Agora também remove qualquer coisa a partir do primeiro parêntese (ex: referências bíblicas)
const normalize = (str: string) => str.split('(')[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

for (const line of lines) {
  // Procura por "123 NOME DO CANTICO" ou "123 NOME (Referência)"
  const match = line.match(/^(\d{1,3})\s+(.+)$/);
  if (match) {
    const num = match[1].padStart(3, '0');
    const title = match[2].trim();
    mappings[normalize(title)] = num;
  }
}

// Vamos garantir que achamos os hinos
console.log(`Encontrados ${Object.keys(mappings).length} cânticos no PDF.`);

if (fs.existsSync(canticosDir)) {
  const folders = fs.readdirSync(canticosDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  const missing: string[] = [];
  let renamedCount = 0;

  for (const folderName of folders) {
    // Se a pasta já tiver número na frente (ex: 134-A Alegria), ignoramos
    if (/^\d{3}-/.test(folderName)) {
      continue;
    }

    const normFolder = normalize(folderName);
    const num = mappings[normFolder];

    if (num) {
      const newName = `${num}-${folderName}`;
      const oldPath = path.join(canticosDir, folderName);
      const newPath = path.join(canticosDir, newName);
      
      console.log(`✅ Renomeando: "${folderName}" -> "${newName}"`);
      fs.renameSync(oldPath, newPath);
      renamedCount++;
    } else {
      missing.push(folderName);
    }
  }

  console.log(`\nResumo: ${renamedCount} pastas renomeadas com sucesso.`);
  
  if (missing.length > 0) {
    console.log(`\n⚠️ Atenção: Não foi possível encontrar a numeração no PDF para as seguintes pastas (${missing.length}):`);
    missing.forEach(m => console.log(`- ${m}`));
  }

} else {
  console.error('Pasta apps/canticos não encontrada.');
}
