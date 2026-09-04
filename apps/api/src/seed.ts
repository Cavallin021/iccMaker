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

    const optionsToInsert = [];

    for (const folderName of folders) {
      const folderPath = path.join(canticosDir, folderName);
      const files = fs.readdirSync(folderPath);
      const images = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
      }).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      optionsToInsert.push({
        title: folderName,
        category: 'Cânticos',
        slidesCount: images.length,
        filePath: `../canticos/${folderName}`, // Caminho relativo a apps/api/
        originalFileName: `Pasta: ${folderName}`,
        images: images
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
