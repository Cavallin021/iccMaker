import fs from 'fs';
import path from 'path';
import PptxGenJS from 'pptxgenjs';
import PDFDocument from 'pdfkit';
import Option from '../models/Option';
import Template from '../models/Template';

export interface PresentationFiles {
  pdfBuffer: Buffer;
  pptxBuffer: Buffer;
  fileNameBase: string;
}

export const buildPresentationFiles = async (
  optionIds: string[],
  extraImages: Express.Multer.File[] | undefined,
  preachTheme: string,
  preachTitle: string,
  skipPptx: boolean = false,
  skipPdf: boolean = false
): Promise<PresentationFiles> => {
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

  const pdfChunks: Buffer[] = [];
  pdfDoc.on('data', chunk => pdfChunks.push(chunk));
  const pdfPromise = new Promise<Buffer>((resolve) => {
    pdfDoc.on('end', () => resolve(Buffer.concat(pdfChunks)));
  });

  // Busca os templates customizados
  const templates = await Template.find().lean();
  const getTemplateUrl = (pos: number) => {
    const t = templates.find(temp => temp.position === pos);
    return t ? t.imageUrl : null;
  };

  // Helper para adicionar slide estático
  const addStaticSlide = async (position: number, fallbackFileName: string) => {
    const customUrl = getTemplateUrl(position);
    
    let buffer: Buffer | null = null;
    let fallbackPath = path.resolve(__dirname, '../../public/template', fallbackFileName);

    if (customUrl) {
      try {
        const response = await fetch(customUrl);
        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      } catch (err) {
        console.error(`Erro ao baixar template ${position} do Cloudinary:`, err);
      }
    }

    if (buffer) {
      // Add to PPTX
      if (!skipPptx) {
        const slide = pptx.addSlide();
        const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
        slide.addImage({ data: base64, x: 0, y: 0, w: '100%', h: '100%' });
      }
      // Add to PDF
      if (!skipPdf) {
        pdfDoc.addPage();
        pdfDoc.image(buffer, 0, 0, { width: 1920, height: 1080 });
      }
    } else if (fs.existsSync(fallbackPath)) {
      // Add to PPTX
      if (!skipPptx) {
        const slide = pptx.addSlide();
        slide.addImage({ path: fallbackPath, x: 0, y: 0, w: '100%', h: '100%' });
      }
      // Add to PDF
      if (!skipPdf) {
        pdfDoc.addPage();
        pdfDoc.image(fallbackPath, 0, 0, { width: 1920, height: 1080 });
      }
    }
  };

  // Helper para adicionar os slides de um bloco (Option)
  const addBlockSlides = async (optionId: string | undefined) => {
    if (!optionId) return;
    const option = await Option.findById(optionId);
    if (!option) return;

    const imagesArray = option.get('images');
    if (imagesArray && imagesArray.length > 0 && imagesArray[0].startsWith('http')) {
      // Caso seja Cloudinary (URLs)
      for (const imageUrl of imagesArray) {
        // Add to PPTX
        if (!skipPptx) {
          const slide = pptx.addSlide();
          slide.addImage({ path: imageUrl, x: 0, y: 0, w: '100%', h: '100%' });
        }

        // Add to PDF
        if (!skipPdf) {
          try {
            const response = await fetch(imageUrl);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            pdfDoc.addPage();
            pdfDoc.image(buffer, 0, 0, { width: 1920, height: 1080 });
          } catch (error) {
            console.error(`Erro ao baixar imagem do Cloudinary: ${imageUrl}`, error);
          }
        }
      }
    } else {
      // Caso seja local
      const dirPath = path.resolve(__dirname, '../../', option.get('filePath') || '');
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const files = fs.readdirSync(dirPath);
        const images = files.filter(f => {
          const ext = path.extname(f).toLowerCase();
          return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
        }).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        for (const image of images) {
          const imagePath = path.join(dirPath, image);

          // Add to PPTX
          if (!skipPptx) {
            const slide = pptx.addSlide();
            slide.addImage({ path: imagePath, x: 0, y: 0, w: '100%', h: '100%' });
          }

          // Add to PDF
          if (!skipPdf) {
            pdfDoc.addPage();
            pdfDoc.image(imagePath, 0, 0, { width: 1920, height: 1080 });
          }
        }
      }
    }
  };

  // --- MONTAGEM DO MOLDE FIXO ---
  // Início: 2 Estáticos (com as imagens extras injetadas entre eles)
  await addStaticSlide(1, 'static_1.jpg');

  if (extraImages && extraImages.length > 0) {
    for (const file of extraImages) {
      // Add to PPTX
      if (!skipPptx) {
        const slide = pptx.addSlide();
        slide.addImage({ path: file.path, x: 0, y: 0, w: '100%', h: '100%' });
      }

      // Add to PDF
      if (!skipPdf) {
        pdfDoc.addPage();
        pdfDoc.image(file.path, 0, 0, { width: 1920, height: 1080 });
      }
    }
  }

  await addStaticSlide(2, 'static_2.jpg');

  // 3 Blocos
  await addBlockSlides(optionIds[0]);
  await addBlockSlides(optionIds[1]);
  await addBlockSlides(optionIds[2]);

  // 1 Estático
  await addStaticSlide(3, 'static_3.jpg');

  // 1 Bloco
  await addBlockSlides(optionIds[3]);

  // 2 Estáticos
  await addStaticSlide(4, 'static_4.jpg');
  await addStaticSlide(5, 'static_5.jpg');

  // 2 Blocos
  await addBlockSlides(optionIds[4]);
  await addBlockSlides(optionIds[5]);

  // 1 Estático (com o texto dinâmico injetado no 6)
  const customUrl6 = getTemplateUrl(6);
  let slide6Buffer: Buffer | null = null;
  let slide6FallbackPath = path.resolve(__dirname, '../../public/template/static_6.jpg');

  if (customUrl6) {
    try {
      const response = await fetch(customUrl6);
      const arrayBuffer = await response.arrayBuffer();
      slide6Buffer = Buffer.from(arrayBuffer);
    } catch (err) {
      console.error(`Erro ao baixar template 6 do Cloudinary:`, err);
    }
  }

  const hasSlide6 = slide6Buffer !== null || fs.existsSync(slide6FallbackPath);

  if (hasSlide6) {
    // PPTX
    let slide6: any;
    if (!skipPptx) {
      slide6 = pptx.addSlide();
      if (slide6Buffer) {
        const base64 = `data:image/jpeg;base64,${slide6Buffer.toString('base64')}`;
        slide6.addImage({ data: base64, x: 0, y: 0, w: '100%', h: '100%' });
      } else {
        slide6.addImage({ path: slide6FallbackPath, x: 0, y: 0, w: '100%', h: '100%' });
      }
    }

    // PDF
    if (!skipPdf) {
      pdfDoc.addPage();
      if (slide6Buffer) {
        pdfDoc.image(slide6Buffer, 0, 0, { width: 1920, height: 1080 });
      } else {
        pdfDoc.image(slide6FallbackPath, 0, 0, { width: 1920, height: 1080 });
      }
    }

    // Injeta o texto sobre o slide 6
    if (preachTheme || preachTitle) {
      const textToStamp = `${preachTheme}\n${preachTitle}`.trim();

      // PPTX text
      if (!skipPptx && slide6) {
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
      }

      // PDF text (Posição convertida para 1920x1080 -> 10 pol = 1920px -> 1 pol = 192px)
      if (!skipPdf) {
        const px = 0.75 * 192; // 144
        const py = 1.97 * 192; // ~378
        pdfDoc.font('Helvetica-Bold')
          .fontSize(53)
          .fillColor('#FFFF00')
          .text(textToStamp, px, py, {
            align: 'left',
            width: 4.75 * 192
          });
      }
    }
  }

  // 1 Bloco
  await addBlockSlides(optionIds[6]);

  // 1 Estático Final
  await addStaticSlide(7, 'static_7.jpg');
  // -----------------------------

  // Finaliza a geração do PDF
  if (!skipPdf) {
    pdfDoc.end();
  }

  // Aguarda o PDF terminar de ser gerado em memória
  const pdfBuffer = skipPdf ? Buffer.from([]) : await pdfPromise;

  // Gerar o arquivo PPTX em memória (somente se não for pular)
  const pptxBuffer = skipPptx ? Buffer.from([]) : (await pptx.stream() as Buffer);

  return {
    pdfBuffer,
    pptxBuffer,
    fileNameBase
  };
};
