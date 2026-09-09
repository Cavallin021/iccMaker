import { Resend } from 'resend';

export const sendPresentationEmail = async (attachmentBuffer: Buffer, fileName: string, videoBuffer?: Buffer | null, videoFileName?: string) => {
  const { RESEND_API_KEY, DESTINATION_EMAIL } = process.env;

  if (!RESEND_API_KEY || !DESTINATION_EMAIL) {
    throw new Error('Configurações do Resend incompletas no arquivo de ambiente (Falta RESEND_API_KEY ou DESTINATION_EMAIL).');
  }

  const resend = new Resend(RESEND_API_KEY);
  
  const attachments = [
    {
      filename: fileName,
      content: attachmentBuffer,
    },
  ];

  if (videoBuffer && videoFileName) {
    attachments.push({
      filename: videoFileName,
      content: videoBuffer,
    });
  }

  const { data, error } = await resend.emails.send({
    // 'onboarding@resend.dev' é o remetente oficial de testes do Resend
    from: 'Igreja de Cristo <onboarding@resend.dev>',
    to: DESTINATION_EMAIL,
    subject: `Apresentação Gerada: ${fileName}`,
    html: '<p>Olá! A sua apresentação foi gerada com sucesso pelo Studio Maker. Os arquivos gerados estão em anexo.</p>',
    attachments,
  });

  if (error) {
    throw new Error(error.message);
  }

  console.log(`Email enviado via Resend: ${data?.id}`);
  return data;
};
