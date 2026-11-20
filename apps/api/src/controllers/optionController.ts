import { Request, Response } from 'express';
import Option from '../models/Option';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { sendPresentationEmail } from '../services/emailService';
import { getBirthdaysForNextWeek, getPreachingForNextSunday } from '../services/googleSheets';
import { buildPresentationFiles } from '../services/presentationService';
import { logPresentationMemory, maxEmailAttachmentBytes, PresentationMediaError } from '../services/presentationMedia';
import { buildVideoBuffer, getActiveNotices, removeUsedTemporaryNotices } from './noticeController';
import { uploadImage, deleteFolder } from '../services/cloudinaryService';

const tempDir = path.join(__dirname, '../../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Limpa arquivos com mais de 1 hora na pasta temp
const cleanupTempFiles = () => {
  if (!fs.existsSync(tempDir)) return;
  const now = Date.now();
  fs.readdirSync(tempDir).forEach(file => {
    const filePath = path.join(tempDir, file);
    try {
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 3600000) { // 1 hora
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error(`Erro ao limpar ${file}:`, e);
    }
  });
};

export const getOptions = async (req: Request, res: Response) => {
  try {
    const options = await Option.find().sort({ createdAt: -1 }).lean();
    res.json(options);
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: error.message });
  }
};

export const deleteOption = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const option = await Option.findById(id);
    if (!option) {
      return res.status(404).json({ message: 'Cântico não encontrado' });
    }

    const folderName = (option.get('filePath') || '').split('/').pop();

    if (option.get('images') && option.get('images')[0]?.startsWith('http')) {
      // Cloudinary deletion
      if (folderName) {
        await deleteFolder(folderName);
      }
    } else {
      // Local deletion
      const dirPath = path.resolve(__dirname, '../../', option.get('filePath'));
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    }

    await Option.findByIdAndDelete(id);
    res.json({ message: 'Cântico deletado com sucesso' });
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: error.message });
  }
};

export const getBirthdaysList = async (req: Request, res: Response) => {
  try {
    const birthdays = await getBirthdaysForNextWeek();
    res.json(birthdays);
  } catch (e) {
    const error = e as Error;
    console.error(error);
    res.status(500).json({ message: 'Erro ao buscar aniversariantes', error: error.message });
  }
};

export const getPreaching = async (_req: Request, res: Response) => {
  try {
    res.json(await getPreachingForNextSunday());
  } catch (error) {
    console.error('Erro ao buscar o cronograma de pregação:', error);
    res.status(503).json({ message: 'Não foi possível consultar a aba Pregação.' });
  }
};

export const createOption = async (req: Request, res: Response) => {
  try {
    const { title, category, slidesCount } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'É obrigatório enviar pelo menos uma imagem.' });
    }

    // Gerar nome único para a pasta no Cloudinary
    const folderName = `${Date.now()}-${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

    const cloudUrls: string[] = [];

    for (const file of files) {
      const url = await uploadImage(file.path, folderName);
      cloudUrls.push(url);
    }

    const newOption = new Option({
      title,
      category,
      slidesCount: slidesCount ? parseInt(slidesCount) : files.length,
      filePath: `cloud/${folderName}`,
      originalFileName: folderName,
      images: cloudUrls,
    });

    const savedOption = await newOption.save();
    res.status(201).json(savedOption);
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: error.message });
  }
};

interface PresentationJob {
  status: 'generating' | 'success' | 'error';
  message: string;
}

const presentationJobs = new Map<string, PresentationJob>();
let presentationRunning = false;

export const getPresentationStatus = (req: Request<{ jobId: string }>, res: Response) => {
  if (!process.env.STUDIO_PASSWORD || req.headers['x-studio-password'] !== process.env.STUDIO_PASSWORD) {
    return res.status(401).json({ message: 'Não autorizado. Senha inválida.' });
  }
  const job = presentationJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ message: 'O status da apresentação não está mais disponível.' });
  return res.json(job);
};

export const generatePresentation = (req: Request, res: Response) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const extraImages = files?.extraImages ?? [];
  const temporaryNotices = files?.temporaryNotices ?? [];
  const cleanupImages = async () => {
    await Promise.allSettled(
      [...extraImages, ...temporaryNotices].map(file => fs.promises.rm(file.path, { force: true }))
    );
  };
  const rejectRequest = (status: number, message: string) => {
    void cleanupImages();
    return res.status(status).json({ message });
  };

  if (!process.env.STUDIO_PASSWORD || req.headers['x-studio-password'] !== process.env.STUDIO_PASSWORD) {
    return rejectRequest(401, 'Não autorizado. Senha inválida.');
  }

  let optionIds: unknown = req.body.optionIds;
  if (typeof optionIds === 'string') {
    try {
      optionIds = JSON.parse(optionIds);
    } catch {
      optionIds = null;
    }
  }
  if (!Array.isArray(optionIds) || optionIds.length !== 7 || !optionIds.every(id => typeof id === 'string')) {
    return rejectRequest(400, 'É obrigatório selecionar exatamente 7 opções.');
  }

  let requestedOrder: unknown;
  try {
    requestedOrder = req.body.noticeOrder === undefined ? undefined : JSON.parse(req.body.noticeOrder);
  } catch {
    return rejectRequest(400, 'Ordem dos avisos inválida.');
  }
  let noticeOrder: (string | number)[] | undefined;
  if (requestedOrder !== undefined || temporaryNotices.length > 0) {
    if (!Array.isArray(requestedOrder) || !requestedOrder.every(item =>
      typeof item === 'string' ? /^[a-f0-9]{24}$/i.test(item) :
        Number.isInteger(item) && item >= 0 && item < temporaryNotices.length
    ) || new Set(requestedOrder).size !== requestedOrder.length ||
      requestedOrder.filter(item => typeof item === 'number').length !== temporaryNotices.length) {
      return rejectRequest(400, 'Ordem dos avisos inválida.');
    }
    noticeOrder = requestedOrder;
  }

  const duration = Number(req.body.noticeDuration ?? 10);
  if (!Number.isInteger(duration) || duration < 1 || duration > 99) {
    return rejectRequest(400, 'Informe uma duração entre 1 e 99 segundos para os avisos.');
  }
  if (!process.env.RESEND_API_KEY || !process.env.DESTINATION_EMAIL) {
    return rejectRequest(503, 'O envio de apresentações por e-mail ainda não está configurado.');
  }
  if (presentationRunning) {
    return rejectRequest(409, 'Já existe uma apresentação em processamento.');
  }

  const songIds: string[] = optionIds;
  const preachTheme = req.body.preachTheme || '';
  const preachTitle = req.body.preachTitle || '';
  const jobId = randomUUID();
  const job: PresentationJob = { status: 'generating', message: 'Montando os slides e gerando o vídeo de avisos.' };
  presentationJobs.set(jobId, job);
  presentationRunning = true;
  res.status(202).json({ jobId, ...job });

  void (async () => {
    try {
      logPresentationMemory('iniciando');
      const activeNotices = await getActiveNotices();
      const sharedNotices = new Map(activeNotices.map(notice => [String(notice._id), notice]));
      const notices = noticeOrder?.map(item => {
        if (typeof item === 'number') return { temporaryPath: temporaryNotices[item].path };
        const notice = sharedNotices.get(item);
        if (!notice) throw new Error('A lista compartilhada de avisos mudou durante a finalização.');
        return notice;
      }) ?? activeNotices;
      const { casamentos, slidesAniversariantes } = await getBirthdaysForNextWeek();
      if (casamentos === null || slidesAniversariantes === null) {
        job.status = 'error';
        job.message = 'Não foi possível consultar os aniversariantes ou as bodas. Tente gerar a apresentação novamente.';
        return;
      }
      const { pptxBuffer, fileNameBase } = await buildPresentationFiles(
        songIds, extraImages, preachTheme, preachTitle, false, true, casamentos, slidesAniversariantes
      );
      logPresentationMemory('PPTX pronto');
      const videoBuffer = await buildVideoBuffer(notices, duration, maxEmailAttachmentBytes - pptxBuffer.length);
      logPresentationMemory('enviando anexos');
      const videoName = fileNameBase.replace('Culto-', 'Avisos-') + '.mp4';
      const delivery = await sendPresentationEmail(pptxBuffer, `${fileNameBase}.pptx`, videoBuffer, videoBuffer ? videoName : undefined);
      await removeUsedTemporaryNotices(notices.filter(notice => '_id' in notice));
      job.status = 'success';
      job.message = delivery === 'separate'
        ? 'O PowerPoint e o vídeo de avisos foram enviados em dois e-mails.'
        : 'A apresentação foi enviada para o e-mail da igreja.';
      logPresentationMemory('finalizada');
    } catch (error) {
      console.error('Erro ao finalizar apresentação:', error);
      job.status = 'error';
      job.message = error instanceof PresentationMediaError
        ? error.message
        : 'Falha ao finalizar a apresentação. Os avisos temporários continuam disponíveis.';
    } finally {
      presentationRunning = false;
      setTimeout(() => presentationJobs.delete(jobId), 30 * 60_000).unref();
      await cleanupImages();
      cleanupTempFiles();
    }
  })();
};

export const generatePreviewPdf = async (req: Request, res: Response) => {
  try {
    const { optionIds } = req.body;
    
    if (!optionIds || !Array.isArray(optionIds) || optionIds.length === 0) {
      return res.status(400).json({ message: 'É obrigatório selecionar cânticos para o preview.' });
    }

    const { pdfBuffer, fileNameBase } = await buildPresentationFiles(optionIds, undefined, '', '', true);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Content-Disposition', `inline; filename="${fileNameBase}.pdf"`);
    res.send(pdfBuffer);
  } catch (e) {
    const error = e as Error;
    console.error('Erro no preview PDF:', error);
    res.status(500).json({ message: 'Erro ao gerar preview em PDF', error: error.message });
  }
};

export const downloadGeneratedFile = (req: Request, res: Response) => {
  try {
    const filename = req.params.filename as string;
    const filePath = path.join(tempDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Arquivo não encontrado ou já expirou.' });
    }

    res.download(filePath);
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao fazer o download', error: error.message });
  }
};
