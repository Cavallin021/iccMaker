import { Request, Response } from 'express';
import Notice, { type INotice } from '../models/Notice';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { Types } from 'mongoose';
import { maxEmailAttachmentBytes, prepareSlideImage, PresentationMediaError } from '../services/presentationMedia';
import { uploadImage, deleteImage } from '../services/cloudinaryService';

const runFfmpeg = promisify(execFile);
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
  let uploadedUrl: string | undefined;
  try {
    if (!req.file) {
      res.status(400).json({ message: 'Imagem é obrigatória.' });
      return;
    }

    const { title, isActive, order } = req.body;
    
    // Upload to Cloudinary
    uploadedUrl = await uploadImage(req.file.buffer, 'avisos');

    // Obter o maior "order" atual para colocar o novo aviso no fim da fila
    const lastNotice = await Notice.findOne().sort({ order: -1 });
    const nextOrder = lastNotice ? lastNotice.order + 1 : 0;

    const newNotice = new Notice({
      title: title || req.file.originalname,
      filename: uploadedUrl,
      isRecurring: true,
      expiresAfterPresentation: false,
      isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : true,
      order: order !== undefined && Number.isFinite(Number(order)) ? Number(order) : nextOrder
    });

    await newNotice.save();
    uploadedUrl = undefined;
    res.status(201).json(newNotice);
  } catch (e) {
    const error = e as Error;
    if (uploadedUrl) await deleteImage(uploadedUrl);
    res.status(500).json({ message: 'Erro ao criar aviso', error: error.message });
  }
};

export const updateNotice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { isActive, order } = req.body;
    const updates = { isActive, order };
    
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
    const notice = await Notice.findById(id);
    
    if (!notice) {
      res.status(404).json({ message: 'Aviso não encontrado.' });
      return;
    }

    // Remover arquivo do Cloudinary se for URL, senão remove local (legado)
    if (notice.filename.startsWith('http')) {
      await deleteImage(notice.filename, { strict: true });
    } else {
      const filePath = path.join(AVISOS_DIR, path.basename(notice.filename));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await notice.deleteOne();
    res.json({ message: 'Aviso removido com sucesso.' });
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao remover aviso', error: error.message });
  }
};

export const getActiveNotices = () =>
  Notice.find({ isActive: true }).sort({ order: 1, createdAt: -1, _id: 1 }).lean();

type VideoNotice = Pick<INotice, 'filename' | 'expiresAfterPresentation'> & { _id: Types.ObjectId };

export const removeUsedTemporaryNotices = async (notices: VideoNotice[]): Promise<void> => {
  for (const notice of notices) {
    if (notice.expiresAfterPresentation !== true) continue;
    try {
      const removed = await Notice.findOneAndDelete({
        _id: notice._id,
        filename: notice.filename,
        expiresAfterPresentation: true
      });
      if (!removed) continue;
      if (removed.filename.startsWith('https://')) {
        await deleteImage(removed.filename);
      } else {
        await fs.promises.rm(path.join(AVISOS_DIR, path.basename(removed.filename)), { force: true });
      }
    } catch (error) {
      console.error('Falha ao limpar aviso temporário:', error);
    }
  }
};

export const buildVideoBuffer = async (
  notices: ({ filename: string } | { temporaryPath: string })[],
  duration: number,
  preferredMaxBytes = maxEmailAttachmentBytes
): Promise<Buffer | null> => {
  if (notices.length === 0) return null;

  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'iccmaker-avisos-'));
  const output = path.join(directory, 'avisos.mp4');
  try {
    const { stdout: encoders } = await runFfmpeg('ffmpeg', ['-hide_banner', '-encoders']);
    const hasX264 = /\blibx264\b/.test(encoders);
    const codec = hasX264
      ? ['-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast']
      : ['-c:v', 'mpeg4', '-q:v', '5'];
    const frame = path.join(directory, 'frame.jpg');
    const clipNames: string[] = [];
    let clipsSize = 0;

    // Encode one still image at a time to keep memory independent of the number of notices.
    for (const [index, notice] of notices.entries()) {
      const source = 'temporaryPath' in notice ? notice.temporaryPath :
        /^https?:\/\//.test(notice.filename) ? notice.filename :
          path.join(AVISOS_DIR, path.basename(notice.filename));
      await fs.promises.writeFile(frame, await prepareSlideImage(source));
      const name = `slide-${index}.mp4`;
      const clip = path.join(directory, name);
      await runFfmpeg('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-loop', '1', '-framerate', '30', '-threads', '1', '-i', frame,
        '-t', String(duration), '-filter_threads', '1',
        '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1',
        '-pix_fmt', 'yuv420p', ...codec, '-threads', '1', clip
      ]);
      clipsSize += (await fs.promises.stat(clip)).size;
      if (clipsSize > 4 * maxEmailAttachmentBytes) {
        throw new PresentationMediaError('O vídeo de avisos ficou muito grande. Reduza a duração ou a quantidade de avisos.');
      }
      clipNames.push(name);
    }

    const list = path.join(directory, 'clips.txt');
    await fs.promises.writeFile(list, clipNames.map(name => `file '${name}'`).join('\n'));
    await runFfmpeg('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', list,
      '-c', 'copy', '-movflags', '+faststart', output
    ]);
    const originalSize = (await fs.promises.stat(output)).size;
    if (originalSize <= preferredMaxBytes) return await fs.promises.readFile(output);

    const seconds = duration * notices.length;
    const compact = path.join(directory, 'avisos-compactado.mp4');
    const minimumBitrate = 32_000;
    const preferredLimit = Math.min(preferredMaxBytes, maxEmailAttachmentBytes);
    const targets = [
      { bytes: preferredLimit, width: 1280, fill: 0.8 },
      { bytes: preferredLimit, width: 960, fill: 0.55 },
    ];
    if (originalSize > maxEmailAttachmentBytes && preferredLimit < maxEmailAttachmentBytes) {
      targets.push({ bytes: maxEmailAttachmentBytes, width: 960, fill: 0.55 });
    }

    for (const { bytes, width, fill } of targets) {
      const bitrate = Math.floor(bytes * 8 * fill / seconds);
      if (bitrate < minimumBitrate) continue;
      try {
        await runFfmpeg('ffmpeg', [
          '-hide_banner', '-loglevel', 'error', '-y', '-threads', '1', '-i', output,
          '-filter_threads', '1', '-vf', `scale=${width}:-2`,
          ...(hasX264 ? ['-c:v', 'libx264', '-preset', 'veryfast'] : ['-c:v', 'mpeg4']),
          '-b:v', String(bitrate), '-g', '300',
          '-pix_fmt', 'yuv420p', '-threads', '1', '-movflags', '+faststart', compact
        ]);
        if ((await fs.promises.stat(compact)).size <= bytes) return await fs.promises.readFile(compact);
      } catch (error) {
        console.error('Não foi possível compactar o vídeo de avisos:', error);
      }
    }
    if (originalSize <= maxEmailAttachmentBytes) return await fs.promises.readFile(output);
    throw new PresentationMediaError('O vídeo ainda excede 25 MB depois da compactação. Os avisos temporários continuam disponíveis.');
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
};

export const generateVideo = async (req: Request, res: Response): Promise<void> => {
  try {
    const duration: unknown = req.body?.duration ?? 10;
    if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 1 || duration > 99) {
      res.status(400).json({ message: 'Informe uma duração entre 1 e 99 segundos.' });
      return;
    }
    const videoBuffer = await buildVideoBuffer(await getActiveNotices(), duration);
    if (!videoBuffer) {
      res.status(400).json({ message: 'Nenhum aviso ativo para gerar vídeo.' });
      return;
    }
    res.type('mp4').attachment('avisos.mp4').send(videoBuffer);
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao preparar vídeo', error: error.message });
  }
};
