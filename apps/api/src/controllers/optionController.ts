import { Request, Response } from 'express';
import Option from '../models/Option';
import fs from 'fs';
import path from 'path';
import { sendPresentationEmail } from '../services/emailService';
import { getBirthdaysForNextWeek } from '../services/googleSheets';
import { buildPresentationFiles } from '../services/presentationService';
import { buildVideoBuffer } from './noticeController';
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

export const generatePresentation = async (req: Request, res: Response) => {
  try {
    const providedPassword = req.headers['x-studio-password'];
    if (providedPassword !== process.env.STUDIO_PASSWORD) {
      return res.status(401).json({ message: 'Não autorizado. Senha inválida.' });
    }

    let optionIdsRaw = req.body.optionIds;
    let optionIds: string[];

    // Tratamento para FormData (quando vier string do JSON.stringify)
    if (typeof optionIdsRaw === 'string') {
      try {
        optionIds = JSON.parse(optionIdsRaw);
      } catch {
        optionIds = [];
      }
    } else {
      optionIds = optionIdsRaw;
    }

    if (!optionIds || !Array.isArray(optionIds) || optionIds.length !== 7) {
      return res.status(400).json({ message: 'É obrigatório selecionar exatamente 7 opções' });
    }

    const extraImages = req.files as Express.Multer.File[] | undefined;
    const preachTheme = req.body.preachTheme || '';
    const preachTitle = req.body.preachTitle || '';

    // Utiliza o Service recém-criado para montar a apresentação
    const { pdfBuffer, pptxBuffer, fileNameBase } = await buildPresentationFiles(
      optionIds,
      extraImages,
      preachTheme,
      preachTitle
    );

    // Tenta gerar o vídeo dos avisos, se houver falha não impede o envio do PPTX
    let videoBuffer: Buffer | null = null;
    try {
      videoBuffer = await buildVideoBuffer();
    } catch (e) {
    const err = e as Error;
      console.error('Erro ao gerar vídeo dos avisos durante a apresentação:', err.message);
    }

    let emailStatus = 'disabled';

    // Dispara o envio de e-mail e aguarda (Síncrono)
    if (process.env.RESEND_API_KEY && process.env.DESTINATION_EMAIL) {
      try {
        const videoName = fileNameBase.replace('Culto-', 'Avisos-') + '.mp4';
        await sendPresentationEmail(pptxBuffer, `${fileNameBase}.pptx`, videoBuffer, videoBuffer ? videoName : undefined);
        emailStatus = 'success';
      } catch (e) {
    const err = e as Error;
        console.error('Erro ao enviar e-mail:', err.message);
        emailStatus = 'failed';
      }
    }

    // Limpar temps antigos
    cleanupTempFiles();

    // Salvar novos buffers em disco
    const pdfPath = path.join(tempDir, `${fileNameBase}.pdf`);
    const pptxPath = path.join(tempDir, `${fileNameBase}.pptx`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    fs.writeFileSync(pptxPath, pptxBuffer);

    res.status(200).json({
      message: 'Apresentação gerada com sucesso!',
      fileNameBase,
      emailStatus
    });

    // Limpeza dos arquivos temporários extras do disco
    if (extraImages && extraImages.length > 0) {
      for (const file of extraImages) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

  } catch (e) {
    const error = e as Error;
    console.error(error);
    res.status(500).json({ message: 'Erro ao gerar apresentação', error: error.message });
  }
};

export const generatePreviewPdf = async (req: Request, res: Response) => {
  try {
    const { optionIds } = req.body;
    
    if (!optionIds || !Array.isArray(optionIds) || optionIds.length === 0) {
      return res.status(400).json({ message: 'É obrigatório selecionar cânticos para o preview.' });
    }

    const { pdfBuffer, fileNameBase } = await buildPresentationFiles(optionIds, undefined, '', '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Content-Disposition', `attachment; filename="${fileNameBase}.pdf"`);
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
