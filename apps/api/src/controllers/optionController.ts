import { Request, Response } from 'express';
import Option from '../models/Option';
import fs from 'fs';
import path from 'path';
import PptxGenJS from 'pptxgenjs';
import PDFDocument from 'pdfkit';
import { sendPresentationEmail } from '../services/emailService';
import { getBirthdaysForNextWeek } from '../services/googleSheets';

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

    const pptx = new PptxGenJS();
    // Default 16:9 layout
    pptx.layout = 'LAYOUT_16x9';

    // Helper para formatar a data (ddMmmYY)
    const getNextSunday = () => {
      const d = new Date();
      d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
      const day = String(d.getDate()).padStart(2, '0');
      const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const month = meses[d.getMonth()];
      const year = String(d.getFullYear()).slice(-2);
      return `${day}${month}${year}`;
    };
    const fileNameBase = `Culto-${getNextSunday()}`;

    // Setup PDF
    const pdfDoc = new PDFDocument({
      autoFirstPage: false,
      size: [1920, 1080],
      margin: 0
    });

    const pdfChunks: any[] = [];
    pdfDoc.on('data', chunk => pdfChunks.push(chunk));
    const pdfPromise = new Promise<Buffer>((resolve) => {
      pdfDoc.on('end', () => resolve(Buffer.concat(pdfChunks)));
    });

    // Helper para adicionar slide estático
    const addStaticSlide = (fileName: string) => {
      const imagePath = path.resolve(__dirname, '../../public/template', fileName);
      if (fs.existsSync(imagePath)) {
        // Add to PPTX
        const slide = pptx.addSlide();
        slide.addImage({ path: imagePath, x: 0, y: 0, w: '100%', h: '100%' });

        // Add to PDF
        pdfDoc.addPage();
        pdfDoc.image(imagePath, 0, 0, { width: 1920, height: 1080 });
      }
    };

    // Helper para adicionar os slides de um bloco (Option)
    const addBlockSlides = async (optionId: string) => {
      const option = await Option.findById(optionId);
      if (!option) return;

      const dirPath = path.resolve(__dirname, '../../', option.filePath);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const files = fs.readdirSync(dirPath);
        const images = files.filter(f => {
          const ext = path.extname(f).toLowerCase();
          return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
        }).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        for (const image of images) {
          const imagePath = path.join(dirPath, image);

          // Add to PPTX
          const slide = pptx.addSlide();
          slide.addImage({ path: imagePath, x: 0, y: 0, w: '100%', h: '100%' });

          // Add to PDF
          pdfDoc.addPage();
          pdfDoc.image(imagePath, 0, 0, { width: 1920, height: 1080 });
        }
      }
    };

    // --- MONTAGEM DO MOLDE FIXO ---
    // Início: 2 Estáticos (com as imagens extras injetadas entre eles)
    addStaticSlide('static_1.jpg');

    if (extraImages && extraImages.length > 0) {
      for (const file of extraImages) {
        // Add to PPTX
        const slide = pptx.addSlide();
        slide.addImage({ path: file.path, x: 0, y: 0, w: '100%', h: '100%' });

        // Add to PDF
        pdfDoc.addPage();
        pdfDoc.image(file.path, 0, 0, { width: 1920, height: 1080 });
      }
    }

    addStaticSlide('static_2.jpg');

    // 3 Blocos
    await addBlockSlides(optionIds[0]);
    await addBlockSlides(optionIds[1]);
    await addBlockSlides(optionIds[2]);

    // 1 Estático
    addStaticSlide('static_3.jpg');

    // 1 Bloco
    await addBlockSlides(optionIds[3]);

    // 2 Estáticos
    addStaticSlide('static_4.jpg');
    addStaticSlide('static_5.jpg');

    // 2 Blocos
    await addBlockSlides(optionIds[4]);
    await addBlockSlides(optionIds[5]);

    // 1 Estático (com o texto dinâmico injetado no 6)
    // static_6.jpg
    const slide6Path = path.resolve(__dirname, '../../public/template/static_6.jpg');
    if (fs.existsSync(slide6Path)) {
      // PPTX
      const slide6 = pptx.addSlide();
      slide6.addImage({ path: slide6Path, x: 0, y: 0, w: '100%', h: '100%' });

      // PDF
      pdfDoc.addPage();
      pdfDoc.image(slide6Path, 0, 0, { width: 1920, height: 1080 });

      // Injeta o texto sobre o slide 6
      if (preachTheme || preachTitle) {
        const textToStamp = `${preachTheme}\n${preachTitle}`.trim();

        // PPTX text (Posição em polegadas baseado no PPTX padrão de 10 x 5.625 e coords 0.75x, 1.99y, fonte 20)
        slide6.addText(textToStamp, {
          x: 0.75,
          y: 1.97,
          w: 4.75,
          h: 0.84,
          fontSize: 20,
          bold: true,
          color: 'FFFF00',
          align: 'left',
          valign: 'top',
        });

        // PDF text (Posição convertida para 1920x1080 -> 10 pol = 1920px -> 1 pol = 192px)
        const px = 0.75 * 192; // 144
        const py = 1.97 * 192; // ~378
        pdfDoc.font('Helvetica-Bold')
          .fontSize(53) // A fonte 20 do PPTX fica equivalente a ~53 no canvas gigante de 1920x1080
          .fillColor('#FFFF00')
          .text(textToStamp, px, py, {
            align: 'left',
            width: 4.75 * 192
          });
      }
    }

    // 1 Bloco
    await addBlockSlides(optionIds[6]);

    // 1 Estático Final
    addStaticSlide('static_7.jpg');
    // -----------------------------

    // Finaliza a geração do PDF
    pdfDoc.end();

    // Aguarda o PDF terminar de ser gerado em memória
    const pdfBuffer = await pdfPromise;

    // Gerar o arquivo PPTX em memória
    const pptxBuffer = await pptx.stream() as Buffer;

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
