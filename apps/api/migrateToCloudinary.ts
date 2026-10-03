import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { uploadImage } from './src/services/cloudinaryService';

dotenv.config();

const runMigration = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('MongoDB Conectado');

    const Option = mongoose.model('Option', new mongoose.Schema({}, { strict: false }));
    const options = await Option.find();

    console.log(`Encontrados ${options.length} cânticos.`);

    for (let i = 0; i < options.length; i++) {
      const option: any = options[i];
      const filePath = option.get('filePath');
      const images = option.get('images');
      const folderName = filePath ? filePath.split('/').pop() : '';

      if (!folderName || !images || images.length === 0) {
        continue;
      }

      // Check if already migrated
      if (images[0].startsWith('http')) {
        console.log(`[${i + 1}/${options.length}] ${option.get('title')} já migrado. Pulando...`);
        continue;
      }

      console.log(`[${i + 1}/${options.length}] Migrando ${option.get('title')}... (${images.length} imagens)`);

      const localDir = path.resolve(__dirname, '../canticos', folderName);
      if (!fs.existsSync(localDir)) {
        console.warn(`Pasta local não encontrada: ${localDir}. Pulando...`);
        continue;
      }

      const cloudUrls: string[] = [];

      for (const img of images) {
        const localImgPath = path.join(localDir, img);
        if (fs.existsSync(localImgPath)) {
          const url = await uploadImage(localImgPath, folderName);
          cloudUrls.push(url);
        } else {
          console.warn(`Arquivo não encontrado: ${localImgPath}`);
        }
      }

      if (cloudUrls.length > 0) {
        await Option.findByIdAndUpdate(option._id, { images: cloudUrls });
        console.log(`Sucesso: ${cloudUrls.length} imagens atualizadas para ${option.get('title')}.`);
      }
    }

    console.log('Migração concluída!');
    process.exit(0);
  } catch (error) {
    console.error('Erro na migração:', error);
    process.exit(1);
  }
};

runMigration();
