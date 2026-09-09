import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import Option from './models/Option';

dotenv.config();

const seedOptions = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/iccmaker');
    
    await Option.deleteMany(); // Limpa as opções antigas
    
    const canticosDir = path.resolve(__dirname, '../../canticos');
    
    if (!fs.existsSync(canticosDir)) {
      console.error(`A pasta de cânticos não foi encontrada em: ${canticosDir}`);
      process.exit(1);
    }

    const folders = fs.readdirSync(canticosDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    // Extract PDF text for lyrics
    const pdfPath = path.resolve(__dirname, '../../../LOUVORES DA CAPITAL 2025.pdf');
    let pdfText = '';
    if (fs.existsSync(pdfPath)) {
      const { PDFParse } = require('pdf-parse');
      const dataBuffer = fs.readFileSync(pdfPath);
      const parser = new PDFParse({ data: dataBuffer });
      const data = await parser.getText();
      // Remove page numbers e.g. "-- 14 of 56 --"
      pdfText = data.text.replace(/\n-- \d+ of \d+ --\n/g, '\n');
    } else {
      console.warn('PDF não encontrado, cânticos ficarão sem letra.');
    }

    const optionsToInsert = [];

    for (const folderName of folders) {
      const folderPath = path.join(canticosDir, folderName);
      const files = fs.readdirSync(folderPath);
      const images = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
      }).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      // Tentar encontrar a letra no PDF. O formato no PDF é tipo "1 GLÓRIA PRA SEMPRE\nLetra..."
      let lyrics = '';
      if (pdfText) {
        // Título vem no formato "001-Glória Pra Sempre"
        const match = folderName.match(/^(\d+)-(.*)$/);
        if (match) {
          const number = parseInt(match[1], 10);
          
          // Regex para encontrar o cântico e capturar tudo até o próximo número de cântico
          // Exemplo: "\n1 GLÓRIA PRA SEMPRE\n...letra...\n2 MADEIRO LAVRADO\n"
          const regex = new RegExp(`\\n${number}\\s+[^\\n]+\\n([\\s\\S]*?)(?=\\n\\d+\\s+[^\\n]+|$)`, 'i');
          const textMatch = pdfText.match(regex);
          if (textMatch) {
            // Remove multiple newlines at the end
            lyrics = textMatch[1].trim();
          }
        }
      }

      optionsToInsert.push({
        title: folderName,
        category: 'Cânticos',
        slidesCount: images.length,
        filePath: `../canticos/${folderName}`, // Caminho relativo a apps/api/
        originalFileName: `Pasta: ${folderName}`,
        images: images,
        lyrics: lyrics
      });
    }

    if (optionsToInsert.length > 0) {
      await Option.insertMany(optionsToInsert);
      console.log(`Sucesso! ${optionsToInsert.length} cânticos foram inseridos no banco de dados.`);
    } else {
      console.log('Nenhum cântico encontrado na pasta.');
    }

    process.exit();
  } catch (error) {
    console.error('Erro ao semear banco de dados:', error);
    process.exit(1);
  }
};

seedOptions();
