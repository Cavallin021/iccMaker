import { Request, Response } from 'express';
import Notice from '../models/Notice';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { uploadImage, deleteImage } from '../services/cloudinaryService';

const AVISOS_DIR = path.join(__dirname, '../../../avisos');

// Certifique-se de que a pasta existe
if (!fs.existsSync(AVISOS_DIR)) {
  fs.mkdirSync(AVISOS_DIR, { recursive: true });
}

export const getNotices = async (req: Request, res: Response): Promise<void> => {
  try {
    const notices = await Notice.find().sort({ order: 1, createdAt: -1 }).lean();
    res.json(notices);
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao buscar avisos', error: error.message });
  }
};

export const createNotice = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'Imagem é obrigatória.' });
      return;
    }

    const { title, isRecurring, isActive, duration } = req.body;
    
    // Upload to Cloudinary
    const secureUrl = await uploadImage(req.file.path, 'avisos');
    
    // Delete temporary local file
    fs.unlinkSync(req.file.path);

    // Obter o maior "order" atual para colocar o novo aviso no fim da fila
    const lastNotice = await Notice.findOne().sort({ order: -1 });
    const nextOrder = lastNotice ? lastNotice.order + 1 : 0;

    const newNotice = new Notice({
      title: title || req.file.originalname,
      filename: secureUrl, // Storing Cloudinary URL directly in filename
      isRecurring: isRecurring === 'true' || isRecurring === true,
      isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : true,
      duration: duration ? parseInt(duration) : 10,
      order: nextOrder
    });

    await newNotice.save();
    res.status(201).json(newNotice);
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao criar aviso', error: error.message });
  }
};

export const updateNotice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const notice = await Notice.findByIdAndUpdate(id, updates, { returnDocument: 'after' });
    if (!notice) {
      res.status(404).json({ message: 'Aviso não encontrado.' });
      return;
    }
    
    res.json(notice);
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao atualizar aviso', error: error.message });
  }
};

export const deleteNotice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const notice = await Notice.findByIdAndDelete(id);
    
    if (!notice) {
      res.status(404).json({ message: 'Aviso não encontrado.' });
      return;
    }

    // Remover arquivo do Cloudinary se for URL, senão remove local (legado)
    if (notice.filename.startsWith('http')) {
      await deleteImage(notice.filename);
    } else {
      const filePath = path.join(AVISOS_DIR, notice.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({ message: 'Aviso removido com sucesso.' });
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao remover aviso', error: error.message });
  }
};

export const buildVideoBuffer = async (): Promise<Buffer | null> => {
  return new Promise(async (resolve, reject) => {
    try {
      const activeNotices = await Notice.find({ isActive: true }).sort({ order: 1 }).lean();
      if (activeNotices.length === 0) {
        return resolve(null);
      }

      const outputPath = path.join(AVISOS_DIR, 'avisos.mp4');
      
      let ffmpegInputs = '';
      let filterComplex = '';
      let concatInputs = '';

      activeNotices.forEach((notice, index) => {
        // Usa a URL do Cloudinary diretamente, ou caminho local se for legado
        const imgPath = notice.filename.startsWith('http') ? notice.filename : path.join(AVISOS_DIR, notice.filename).replace(/\\/g, '/');
        // Define framerate fixo para evitar problemas de fps, loop e duração
        ffmpegInputs += `-loop 1 -framerate 30 -t ${notice.duration} -i "${imgPath}" `;
        // Redimensiona mantendo proporção (letterbox) para garantir mesma resolução antes de concatenar
        filterComplex += `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v${index}]; `;
        concatInputs += `[v${index}]`;
      });

      filterComplex += `${concatInputs}concat=n=${activeNotices.length}:v=1:a=0[v]`;

      const ffmpegCmd = `ffmpeg -y ${ffmpegInputs}-filter_complex "${filterComplex}" -map "[v]" -pix_fmt yuv420p -c:v libx264 -crf 28 -preset veryfast "${outputPath}"`;
      
      exec(ffmpegCmd, (error, stdout, stderr) => {
        if (error) {
          console.error('Erro no FFmpeg:', error);
          console.error('Stderr:', stderr);
          return reject(new Error('Erro ao gerar o vídeo.'));
        }
        
        const videoBuffer = fs.readFileSync(outputPath);
        resolve(videoBuffer);
      });
    } catch (error) {
      reject(error);
    }
  });
};

export const generateVideo = async (req: Request, res: Response): Promise<void> => {
  try {
    const videoBuffer = await buildVideoBuffer();
    if (!videoBuffer) {
      res.status(400).json({ message: 'Nenhum aviso ativo para gerar vídeo.' });
      return;
    }
    res.json({ message: 'Vídeo gerado com sucesso!', videoUrl: '/avisos/avisos.mp4' });
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao preparar vídeo', error: error.message });
  }
};
