import sharp from 'sharp';
import { stat } from 'node:fs/promises';

const maxSourceBytes = 24 * 1024 * 1024;
const maxSlideBytes = 320 * 1024;
export const maxPresentationMediaBytes = 18 * 1024 * 1024;
export const maxEmailAttachmentBytes = 25 * 1024 * 1024;

export class PresentationMediaError extends Error {}

sharp.cache(false);

export const readSlideImage = async (url: string): Promise<Buffer> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const reader = response.body?.getReader();
  if (!response.ok || !reader) {
    await reader?.cancel();
    throw new Error(`Não foi possível baixar a imagem do slide (HTTP ${response.status}).`);
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, bytes);

      bytes += value.byteLength;
      if (bytes > maxSourceBytes) {
        throw new PresentationMediaError('Uma imagem da apresentação ultrapassa 24 MB. Envie uma versão menor.');
      }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
};

export const prepareSlideImage = async (source: string | Buffer): Promise<Buffer> => {
  const image = typeof source === 'string' && /^https?:\/\//.test(source)
    ? await readSlideImage(source)
    : source;
  const bytes = typeof image === 'string' ? (await stat(image)).size : image.length;
  if (bytes > maxSourceBytes) {
    throw new PresentationMediaError('Uma imagem da apresentação ultrapassa 24 MB. Envie uma versão menor.');
  }

  const encode = (width: number, height: number, quality: number) =>
    sharp(image, { limitInputPixels: 26_000_000 })
      .autoOrient()
      .resize({ width, height, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, chromaSubsampling: '4:4:4' })
      .toBuffer();

  const fullSize = await encode(1920, 1080, 84);
  if (fullSize.length <= maxSlideBytes) return fullSize;
  return encode(1600, 900, 75);
};

export const logPresentationMemory = (stage: string) => {
  const { rss, heapUsed, external } = process.memoryUsage();
  const mib = (bytes: number) => Math.round(bytes / 1024 / 1024);
  console.info(`Apresentação | ${stage} | RSS ${mib(rss)} MiB | heap ${mib(heapUsed)} MiB | externa ${mib(external)} MiB`);
};
