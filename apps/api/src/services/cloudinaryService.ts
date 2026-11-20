import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import path from 'path';

// Load variables in case it's run as a standalone script
dotenv.config({ path: path.join(__dirname, '../../.env') });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadImage = async (file: string | Buffer, folder: string): Promise<string> => {
  try {
    const options = { folder: `iccMaker/${folder}`, resource_type: 'image' as const };
    const result = typeof file === 'string'
      ? await cloudinary.uploader.upload(file, options)
      : await new Promise<import('cloudinary').UploadApiResponse>((resolve, reject) => {
          cloudinary.uploader.upload_stream(options, (error, upload) => {
            if (error || !upload) reject(error ?? new Error('Cloudinary não retornou a imagem.'));
            else resolve(upload);
          }).end(file);
        });
    return result.secure_url;
  } catch (error) {
    console.error(`Erro ao enviar arquivo para o Cloudinary (${folder}):`, error);
    throw error;
  }
};

export const deleteFolder = async (folder: string): Promise<void> => {
  try {
    // Delete resources inside the folder
    await cloudinary.api.delete_resources_by_prefix(`iccMaker/${folder}`);
    // Delete the folder itself
    await cloudinary.api.delete_folder(`iccMaker/${folder}`);
  } catch (error) {
    console.error(`Erro ao deletar pasta no Cloudinary (${folder}):`, error);
  }
};

export const deleteImage = async (url: string, { strict = false } = {}): Promise<void> => {
  try {
    // Extract public_id from Cloudinary URL
    const urlParts = url.split('/');
    const filename = urlParts[urlParts.length - 1];
    const folder = urlParts[urlParts.length - 2];
    const rootFolder = urlParts[urlParts.length - 3];
    
    // public_id is usually folder/filename (without extension)
    const publicId = `${rootFolder}/${folder}/${filename.split('.')[0]}`;
    const { result } = await cloudinary.uploader.destroy(publicId, { invalidate: true });
    if (result !== 'ok' && result !== 'not found') {
      throw new Error('Cloudinary não confirmou a remoção da imagem.');
    }
  } catch (error) {
    if (strict) throw error;
    console.error(`Erro ao deletar imagem no Cloudinary (${url}):`, error);
  }
};
