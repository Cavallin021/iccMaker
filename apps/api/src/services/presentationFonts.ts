import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

export const weddingFontName = 'Dancing Script Bold';

const fontPart = 'fonts/dancing-script-bold.fntdata';
const fontPath = path.resolve(__dirname, '../../assets/fonts/DancingScript-Bold.fntdata');
const relationshipType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font';

export const embedWeddingFont = async (presentation: Buffer): Promise<Buffer> => {
  const zip = await JSZip.loadAsync(presentation);
  const manifestPath = '[Content_Types].xml';
  const presentationPath = 'ppt/presentation.xml';
  const relationsPath = 'ppt/_rels/presentation.xml.rels';
  const manifest = await zip.file(manifestPath)?.async('string');
  const document = await zip.file(presentationPath)?.async('string');
  const relations = await zip.file(relationsPath)?.async('string');
  if (!manifest?.includes('</Types>') || !document?.includes('<p:defaultTextStyle>') ||
    !relations?.includes('</Relationships>')) {
    throw new Error('Não foi possível localizar as partes do PowerPoint necessárias para incorporar a fonte de bodas.');
  }

  const ids = new Set(Array.from(relations.matchAll(/\bId="([^"]+)"/g), match => match[1]));
  let nextId = ids.size + 1;
  while (ids.has(`rId${nextId}`)) nextId++;
  const id = `rId${nextId}`;
  // Same font registration as the Canva-exported model, including the bold face name.
  const fontList = '<p:embeddedFontLst><p:embeddedFont>' +
    `<p:font typeface="${weddingFontName}" charset="1" panose="03080800040507000D00"/>` +
    `<p:regular r:id="${id}"/></p:embeddedFont></p:embeddedFontLst>`;

  zip.file(presentationPath, document
    .replace(/<p:presentation\b[^>]*>/, opening => opening
      .replace(/\s(?:embedTrueTypeFonts|saveSubsetFonts)="[^"]*"/g, '')
      .replace(/>$/, ' embedTrueTypeFonts="1" saveSubsetFonts="0">'))
    .replace('<p:defaultTextStyle>', `${fontList}<p:defaultTextStyle>`));
  zip.file(relationsPath, relations.replace('</Relationships>',
    `<Relationship Id="${id}" Type="${relationshipType}" Target="${fontPart}"/></Relationships>`));
  if (!manifest.includes('Extension="fntdata"')) {
    zip.file(manifestPath, manifest.replace('</Types>',
      '<Default Extension="fntdata" ContentType="application/x-fontdata"/></Types>'));
  }
  zip.file(`ppt/${fontPart}`, await readFile(fontPath));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};
