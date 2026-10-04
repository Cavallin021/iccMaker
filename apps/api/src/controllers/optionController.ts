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

    // Responde imediatamente ao frontend para evitar timeout
    res.status(200).json({
      message: 'Apresentação está sendo gerada e será enviada para o e-mail em alguns minutos!',
      status: 'success'
    });

    // Processamento pesado em segundo plano (Background)
    setTimeout(async () => {
      try {
        console.log('Iniciando geração da apresentação em background...');
        
        // Passamos false para skipPptx e true para skipPdf (não precisamos do PDF no email)
        const { pptxBuffer, fileNameBase } = await buildPresentationFiles(
          optionIds,
          extraImages,
          preachTheme,
          preachTitle,
          false,
          true
        );

        let videoBuffer: Buffer | null = null;
        try {
          videoBuffer = await buildVideoBuffer();
        } catch (e) {
          const err = e as Error;
          console.error('Erro ao gerar vídeo dos avisos durante a apresentação:', err.message);
        }

        if (process.env.RESEND_API_KEY && process.env.DESTINATION_EMAIL) {
          try {
            const videoName = fileNameBase.replace('Culto-', 'Avisos-') + '.mp4';
            await sendPresentationEmail(pptxBuffer, `${fileNameBase}.pptx`, videoBuffer, videoBuffer ? videoName : undefined);
            console.log('Email enviado com sucesso em background!');
          } catch (e) {
            const err = e as Error;
            console.error('Erro ao enviar e-mail em background:', err.message);
          }
        }

      } catch (err) {
        console.error('Erro crítico no processamento em background da apresentação:', err);
      } finally {
        // Limpar temps antigos e imagens extras após terminar
        cleanupTempFiles();
        if (extraImages && extraImages.length > 0) {
          for (const file of extraImages) {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          }
        }
        console.log('Limpeza de arquivos temporários concluída.');
      }
    }, 0);

  } catch (e) {
    const error = e as Error;
    console.error(error);
    res.status(500).json({ message: 'Erro ao iniciar geração', error: error.message });
  }
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
