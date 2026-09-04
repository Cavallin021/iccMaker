const fs = require('fs');
const path = require('path');

const canticosDir = path.resolve(__dirname, 'apps/canticos');

const mappings = {
  'A Alegria': '134',
  'A Começar em Mim': '060',
  'A Minha Alma Está Cheia de Paz': '136',
  'Andam Procurando': '048',
  'Antífona': '019',
  'A Paz do Céu': '119',
  'Aqui Viemos Te Adorar': '127',
  'As Palavras da Minha Boca': '020',
  'A Tua Paz': '041',
  'Enquanto Oramos': '044',
  'Exultação': '023',
  'Glória ao Senhor': '171',
  'Lei Perfeita': '110',
  'Maravilhas Divinas': '062',
  'Quando Ele Estendeu sua Mão': '201',
  'Salmo 25': '054',
  'Um Grande Amigo': '087',
};

if (fs.existsSync(canticosDir)) {
  const folders = fs.readdirSync(canticosDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const folderName of folders) {
    if (mappings[folderName]) {
      const newName = `${mappings[folderName]}-${folderName}`;
      const oldPath = path.join(canticosDir, folderName);
      const newPath = path.join(canticosDir, newName);
      
      console.log(`Renomeando: ${folderName} -> ${newName}`);
      fs.renameSync(oldPath, newPath);
    } else {
      console.warn(`Atenção: Nenhuma numeração encontrada para a pasta "${folderName}"`);
    }
  }
} else {
  console.error('Pasta apps/canticos não encontrada.');
}
