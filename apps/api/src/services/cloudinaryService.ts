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

export const uploadImage = async (filePath: string, folder: string): Promise<string> => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `iccMaker/${folder}`,
      resource_type: 'image',
    });
    return result.secure_url;
  } catch (error) {
    console.error(`Erro ao enviar arquivo para o Cloudinary (${filePath}):`, error);
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
