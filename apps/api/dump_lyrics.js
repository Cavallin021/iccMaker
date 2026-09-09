const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
dotenv.config();

const OptionSchema = new mongoose.Schema({
  title: String,
  lyrics: String
}, { strict: false });

const Option = mongoose.model('Option', OptionSchema, 'options');

async function dump() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/iccmaker');
  const options = await Option.find().sort({ title: 1 });
  
  let md = '# Resultado da Extração das Letras\n\nAbaixo estão as letras extraídas do PDF para cada cântico. Se algo estiver em branco ou incorreto, podemos ajustar o algoritmo de extração (regex).\n\n';
  
  for (const opt of options) {
    md += `## ${opt.title}\n`;
    if (!opt.lyrics || opt.lyrics.trim() === '') {
      md += `> [!WARNING]\n> Nenhuma letra encontrada ou extraída.\n\n`;
    } else {
      md += '```text\n' + opt.lyrics + '\n```\n\n';
    }
  }
  
  fs.writeFileSync('/home/joao/.gemini/antigravity-ide/brain/2920cdc5-7da2-42b7-bea0-11f1768526f1/extracted_lyrics.md', md);
  console.log('Done!');
  process.exit(0);
}
dump();
