import path from 'node:path';
import type PptxGenJS from 'pptxgenjs';
import type { BirthdaySlides } from './googleSheets';

const template = (name: string) => path.resolve(__dirname, '../../public/template', `aniversariantes-${name}.png`);
const cardStyle = {
  M: { color: '2F7BEA', image: template('card-m') },
  F: { color: 'E8467F', image: template('card-f') },
  neutral: { color: '6858A9', image: template('card-neutro') }
};

export const addBirthdaySlides = (pptx: PptxGenJS, birthdays: BirthdaySlides) => {
  if (birthdays.pages.length === 0) return;
  pptx.defineSlideMaster({ title: 'Aniversariantes', background: { path: template('fundo') } });

  const width = 2.1075;
  const height = 3.225;
  const gap = 0.36;
  const top = 1.5;
  const centered = { align: 'center', valign: 'middle', margin: 0, fit: 'shrink' } as const;
  for (const cards of birthdays.pages) {
    const slide = pptx.addSlide({ masterName: 'Aniversariantes' });
    slide.addText('Aniversariantes da semana', {
      x: 0.45, y: 0.3375, w: 9.1, h: 0.5625, margin: 0, align: 'center', valign: 'middle',
      color: 'FFFFFF', fontFace: 'Arial', fontSize: 28.5, bold: true
    });
    slide.addText(birthdays.period, {
      x: 0.45, y: 0.8625, w: 9.1, h: 0.3375, margin: 0, align: 'center', valign: 'middle',
      color: 'C9C4E8', fontFace: 'Calibri', fontSize: 16.5, bold: true
    });

    const left = (10 - (cards.length * width + (cards.length - 1) * gap)) / 2;
    cards.forEach(({ name, day, month, weekday, gender }, index) => {
      const x = left + index * (width + gap);
      const { image, color } = cardStyle[gender ?? 'neutral'];
      slide.addImage({ path: image, x, y: top, w: width, h: height });
      slide.addText(day, {
        ...centered, x: x + 0.4, y: top + 0.39, w: 1.305, h: 0.72,
        fontFace: 'Arial', fontSize: 44.25, color, bold: true
      });
      slide.addText(month, {
        ...centered, x: x + 0.4, y: top + 1.06, w: 1.305, h: 0.26,
        fontFace: 'Arial', fontSize: month.length >= 8 ? 12.5 : 14.25, color, bold: true
      });
      slide.addText(name, {
        ...centered, x: x + 0.188, y: top + 1.755, w: 1.732, h: 0.825,
        fontFace: 'Arial', fontSize: 18, color: 'FFFFFF', bold: true
      });
      slide.addText(weekday, {
        ...centered, x: x + 0.191, y: top + 2.692, w: 1.725, h: 0.345,
        fontFace: 'Arial Black', fontSize: 10, color: '1C1838'
      });
    });
  }
};
