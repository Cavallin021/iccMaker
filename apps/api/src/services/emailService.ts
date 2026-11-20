import { randomUUID } from 'node:crypto';
import { Resend } from 'resend';
import { maxEmailAttachmentBytes, PresentationMediaError } from './presentationMedia';

interface EmailAttachment {
  filename: string;
  buffer: Buffer;
}

export const sendPresentationEmail = async (
  attachmentBuffer: Buffer, fileName: string, videoBuffer?: Buffer | null, videoFileName?: string
): Promise<'combined' | 'separate'> => {
  const { RESEND_API_KEY, DESTINATION_EMAIL } = process.env;
  if (!RESEND_API_KEY || !DESTINATION_EMAIL) {
    throw new Error('Configurações do Resend incompletas no arquivo de ambiente.');
  }

  const presentation = { filename: fileName, buffer: attachmentBuffer };
  const video = videoBuffer && videoFileName ? { filename: videoFileName, buffer: videoBuffer } : null;
  const attachments = video ? [presentation, video] : [presentation];
  if (attachments.some(attachment => attachment.buffer.length > maxEmailAttachmentBytes)) {
    throw new PresentationMediaError('Um dos arquivos ainda excede o limite de 25 MB por e-mail. Os avisos temporários continuam disponíveis.');
  }

  const resend = new Resend(RESEND_API_KEY);
  const send = async (subject: string, files: EmailAttachment[]) => {
    const email = {
      from: 'Igreja de Cristo <onboarding@resend.dev>',
      to: DESTINATION_EMAIL,
      subject,
      html: '<p>Os arquivos gerados pelo Studio Maker estão em anexo.</p>',
      attachments: files.map(({ filename, buffer }) => ({ filename, content: buffer.toString('base64') })),
    };
    const options = { idempotencyKey: randomUUID() };
    let result = await resend.emails.send(email, options);
    if (result.error?.statusCode === 429) {
      await new Promise(resolve => setTimeout(resolve, 1100));
      result = await resend.emails.send(email, options);
    }
    if (result.error) throw new Error(result.error.message);
    console.log(`E-mail aceito pelo Resend: ${result.data?.id}`);
  };

  const subject = `Apresentação Gerada: ${fileName}`;
  if (!video || presentation.buffer.length + video.buffer.length <= maxEmailAttachmentBytes) {
    await send(subject, attachments);
    return 'combined';
  }

  await send(subject, [presentation]);
  try {
    await send(`Vídeo de Avisos: ${video.filename}`, [video]);
  } catch (error) {
    console.error('Falhou o envio separado do vídeo de avisos:', error);
    throw new PresentationMediaError('O PowerPoint foi enviado, mas o vídeo de avisos não foi enviado. Os avisos temporários continuam disponíveis.');
  }
  return 'separate';
};
