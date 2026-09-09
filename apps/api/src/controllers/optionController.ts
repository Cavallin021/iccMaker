import { Request, Response } from 'express';
import Option from '../models/Option';
import fs from 'fs';
import path from 'path';
import { sendPresentationEmail } from '../services/emailService';
import { getBirthdaysForNextWeek } from '../services/googleSheets';
import { buildPresentationFiles } from '../services/presentationService';

export const getOptions = async (req: Request, res: Response) => {
  try {
    const options = await Option.find().sort({ createdAt: -1 });
    res.json(options);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getBirthdaysList = async (req: Request, res: Response) => {
  try {
    const birthdays = await getBirthdaysForNextWeek();
    res.json(birthdays);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao buscar aniversariantes', error: error.message });
  }
};

export const createOption = async (req: Request, res: Response) => {
  try {
    const { title, category, slidesCount } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'Arquivo PPTX ou PNG é obrigatório' });
    }

    const newOption = new Option({
      title,
      category,
      slidesCount: slidesCount ? parseInt(slidesCount) : 1,
      filePath: file.path,
      originalFileName: file.originalname,
    });

    const savedOption = await newOption.save();
    res.status(201).json(savedOption);
  } catch (error: any) {
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

    let emailStatus = 'disabled';

    // Dispara o envio de e-mail e aguarda (Síncrono)
    if (process.env.RESEND_API_KEY && process.env.DESTINATION_EMAIL) {
      try {
        await sendPresentationEmail(pptxBuffer, `${fileNameBase}.pptx`);
        emailStatus = 'success';
      } catch (err: any) {
        console.error('Erro ao enviar e-mail:', err.message);
        emailStatus = 'failed';
      }
    }

    res.writeHead(200, {
      'Content-Disposition': `attachment; filename="${fileNameBase}.pdf"`,
      'Content-Type': 'application/pdf',
      'X-Email-Status': emailStatus,
      'Access-Control-Expose-Headers': 'X-Email-Status'
    });

    res.end(pdfBuffer);

    // Limpeza dos arquivos temporários extras do disco
    if (extraImages && extraImages.length > 0) {
      for (const file of extraImages) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao gerar apresentação', error: error.message });
  }
};
