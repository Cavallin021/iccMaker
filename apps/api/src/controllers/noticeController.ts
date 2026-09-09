import { Request, Response } from 'express';
import Notice from '../models/Notice';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';

const AVISOS_DIR = path.join(__dirname, '../../../avisos');

// Certifique-se de que a pasta existe
if (!fs.existsSync(AVISOS_DIR)) {
  fs.mkdirSync(AVISOS_DIR, { recursive: true });
}

export const getNotices = async (req: Request, res: Response): Promise<void> => {
  try {
    const notices = await Notice.find().sort({ order: 1, createdAt: -1 });
    res.json(notices);
  } catch (error: any) {
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
    
    // Obter o maior "order" atual para colocar o novo aviso no fim da fila
    const lastNotice = await Notice.findOne().sort({ order: -1 });
    const nextOrder = lastNotice ? lastNotice.order + 1 : 0;

    const newNotice = new Notice({
      title: title || req.file.originalname,
      filename: req.file.filename,
      isRecurring: isRecurring === 'true' || isRecurring === true,
      isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : true,
      duration: duration ? parseInt(duration) : 10,
      order: nextOrder
    });

    await newNotice.save();
    res.status(201).json(newNotice);
  } catch (error: any) {
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
  } catch (error: any) {
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

    // Remover arquivo físico
    const filePath = path.join(AVISOS_DIR, notice.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: 'Aviso removido com sucesso.' });
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao remover aviso', error: error.message });
  }
};

export const buildVideoBuffer = async (): Promise<Buffer | null> => {
  return new Promise(async (resolve, reject) => {
    try {
      const activeNotices = await Notice.find({ isActive: true }).sort({ order: 1 });
      if (activeNotices.length === 0) {
        return resolve(null);
      }

      const listPath = path.join(AVISOS_DIR, 'lista_avisos.txt');
      const outputPath = path.join(AVISOS_DIR, 'avisos.mp4');
      
      let listContent = '';
      for (const notice of activeNotices) {
        const imgPath = path.join(AVISOS_DIR, notice.filename).replace(/\\/g, '/');
        listContent += `file '${imgPath}'\n`;
        listContent += `duration ${notice.duration}\n`;
      }
      
      const lastNotice = activeNotices[activeNotices.length - 1];
      const lastImgPath = path.join(AVISOS_DIR, lastNotice.filename).replace(/\\/g, '/');
      listContent += `file '${lastImgPath}'\n`;

      fs.writeFileSync(listPath, listContent, 'utf-8');

      const ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -vsync vfr -pix_fmt yuv420p "${outputPath}"`;
      
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
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao preparar vídeo', error: error.message });
  }
};
