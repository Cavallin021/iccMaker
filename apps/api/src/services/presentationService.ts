import fs from 'fs';
import path from 'path';
import PptxGenJS from 'pptxgenjs';
import PDFDocument from 'pdfkit';
import Option from '../models/Option';
import Template from '../models/Template';
import type { BirthdaySlides, WeddingAnniversary } from './googleSheets';
import { addBirthdaySlides } from './birthdaySlides';
import { embedWeddingFont, weddingFontName } from './presentationFonts';
import { logPresentationMemory, maxPresentationMediaBytes, prepareSlideImage, PresentationMediaError, readSlideImage } from './presentationMedia';

export interface PresentationFiles {
  pdfBuffer: Buffer;
  pptxBuffer: Buffer;
  fileNameBase: string;
}

const weddingBackground = path.resolve(__dirname, '../../public/template/bodas.png');
const weddingMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });

const addWeddingSlide = (pptx: PptxGenJS, anniversary: WeddingAnniversary) => {
  const slide = pptx.addSlide({ masterName: 'Bodas' });

  const [day, month] = anniversary.date.split('/');
  const monthName = weddingMonth.format(new Date(Date.UTC(2000, Number(month) - 1, 1))).toLocaleUpperCase('pt-BR');
  const years = `${anniversary.anos} ${anniversary.anos === 1 ? 'ANO' : 'ANOS'}`;
  const title = anniversary.bodas
    ? `BODAS DE ${anniversary.bodas.toLocaleUpperCase('pt-BR')} - ${years}`
    : `${years} DE CASAMENTO`;

  const textStyle = { align: 'center', valign: 'middle', color: '2E2C1C', margin: 0, fit: 'shrink' } as const;
  // Posições e tamanhos do modelo convertidos para o layout de 10 × 5,625 polegadas.
  slide.addText(anniversary.casal, {
    ...textStyle, x: 2.6, y: 2.71, w: 4.8, h: 0.58,
    fontFace: weddingFontName, fontSize: 39, bold: true
  });
  slide.addText(title, {
    ...textStyle, x: 2.6, y: 3.79, w: 4.8, h: 0.25,
    fontFace: 'Belleza', fontSize: 15
  });
  slide.addText(`${day} / ${monthName}`, {
    ...textStyle, x: 3.54, y: 4.13, w: 2.92, h: 0.25,
    fontFace: 'Belleza', fontSize: 15
  });
};

export const buildPresentationFiles = async (
  optionIds: string[],
  extraImages: Express.Multer.File[] | undefined,
  preachTheme: string,
  preachTitle: string,
  skipPptx: boolean = false,
  skipPdf: boolean = false,
  weddingAnniversaries: WeddingAnniversary[] = [],
  birthdays?: BirthdaySlides
): Promise<PresentationFiles> => {
  const pptx = new PptxGenJS();
  // Default 16:9 layout
  pptx.layout = 'LAYOUT_16x9';
  let presentationMediaBytes = 0;
  if (!skipPptx && weddingAnniversaries.length > 0) {
    pptx.defineSlideMaster({ title: 'Bodas', background: { path: weddingBackground } });
    presentationMediaBytes = (await fs.promises.stat(weddingBackground)).size;
  }

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

  const pdfDoc = skipPdf ? null : new PDFDocument({
    autoFirstPage: false,
    size: [1920, 1080],
    margin: 0
  });
  const pdfPromise = pdfDoc && new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
  });

  const templates = await Template.find().lean();
  const resolveTemplate = async (position: number, fallbackFileName: string): Promise<string | Buffer | null> => {
    const customUrl = templates.find(template => template.position === position)?.imageUrl;
    if (customUrl) {
      try {
        return await readSlideImage(customUrl);
      } catch (error) {
        console.error(`Erro ao baixar o modelo da posição ${position}:`, error);
      }
    }
    const fallback = path.resolve(__dirname, '../../public/template', fallbackFileName);
    return fs.existsSync(fallback) ? fallback : null;
  };

  const addImageSlide = async (source: string | Buffer) => {
    const prepared = await prepareSlideImage(source);
    presentationMediaBytes += prepared.length;
    if (presentationMediaBytes > maxPresentationMediaBytes) {
      throw new PresentationMediaError('As imagens da apresentação excedem o limite de 18 MB após a otimização. Reduza as imagens extras e tente novamente.');
    }

    let slide: ReturnType<PptxGenJS['addSlide']> | undefined;
    if (!skipPptx) {
      slide = pptx.addSlide();
      slide.addImage({ data: `image/jpeg;base64,${prepared.toString('base64')}`, x: 0, y: 0, w: '100%', h: '100%' });
    }
    if (pdfDoc) {
      pdfDoc.addPage();
      pdfDoc.image(prepared, 0, 0, { width: 1920, height: 1080 });
    }
    return slide;
  };

  const addStaticSlide = async (position: number, fallbackFileName: string) => {
    const image = await resolveTemplate(position, fallbackFileName);
    if (image) await addImageSlide(image);
  };

  const addBlockSlides = async (optionId: string | undefined) => {
    if (!optionId) return;
    const option = await Option.findById(optionId).lean();
    if (!option) return;

    if (option.images?.length && /^https?:\/\//.test(option.images[0])) {
      for (const url of option.images) {
        if (!skipPptx) {
          await addImageSlide(url);
        } else {
          try {
            await addImageSlide(url);
          } catch (error) {
            if (error instanceof PresentationMediaError) throw error;
            console.error('Erro ao carregar imagem de cântico para a prévia:', error);
          }
        }
      }
      return;
    }

    const dirPath = path.resolve(__dirname, '../../', option.filePath || '');
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      const images = fs.readdirSync(dirPath)
        .filter(file => /\.(?:jpg|jpeg|png)$/i.test(file))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      for (const image of images) await addImageSlide(path.join(dirPath, image));
    }
  };

  // --- MONTAGEM DO MOLDE FIXO ---
  // Início: 2 Estáticos (com as imagens extras injetadas entre eles)
  await addStaticSlide(1, 'static_1.jpg');

  for (const file of extraImages ?? []) await addImageSlide(file.path);

  if (!skipPptx) {
    if (birthdays) addBirthdaySlides(pptx, birthdays);
    for (const anniversary of weddingAnniversaries) addWeddingSlide(pptx, anniversary);
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

  const messageBackground = await resolveTemplate(6, 'static_6.jpg');
  if (messageBackground) {
    const slide = await addImageSlide(messageBackground);
    if (preachTheme || preachTitle) {
      const text = `${preachTheme}\n${preachTitle}`.trim();
      slide?.addText(text, {
        x: 0.75, y: 1.97, w: 4.75, h: 0.84, fontSize: 20,
        bold: true, color: 'FFFF00', align: 'left', valign: 'top'
      });
      pdfDoc?.font('Helvetica-Bold').fontSize(53).fillColor('#FFFF00')
        .text(text, 0.75 * 192, 1.97 * 192, { align: 'left', width: 4.75 * 192 });
    }
  }

  // 1 Bloco
  await addBlockSlides(optionIds[6]);

  // 1 Estático Final
  await addStaticSlide(7, 'static_7.jpg');
  // -----------------------------

  pdfDoc?.end();
  const pdfBuffer = pdfPromise ? await pdfPromise : Buffer.alloc(0);

  let pptxBuffer: Buffer = Buffer.alloc(0);
  if (!skipPptx) {
    logPresentationMemory(`compactando PPTX com ${Math.round(presentationMediaBytes / 1024)} KiB de imagens`);
    const result = await pptx.stream({ compression: true });
    if (!Buffer.isBuffer(result)) throw new Error('A biblioteca não retornou um arquivo PPTX.');
    pptxBuffer = weddingAnniversaries.length > 0 ? await embedWeddingFont(result) : result;
  }

  return {
    pdfBuffer,
    pptxBuffer,
    fileNameBase
  };
};
