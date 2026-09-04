import { Resend } from 'resend';

export const sendPresentationEmail = async (attachmentBuffer: Buffer, fileName: string) => {
  const { RESEND_API_KEY, DESTINATION_EMAIL } = process.env;

  if (!RESEND_API_KEY || !DESTINATION_EMAIL) {
    throw new Error('Configurações do Resend incompletas no arquivo de ambiente (Falta RESEND_API_KEY ou DESTINATION_EMAIL).');
  }

  const resend = new Resend(RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    // 'onboarding@resend.dev' é o remetente oficial de testes do Resend
    from: 'Igreja de Cristo <onboarding@resend.dev>',
    to: DESTINATION_EMAIL,
    subject: `Apresentação Gerada: ${fileName}`,
    html: '<p>Olá! A sua apresentação foi gerada com sucesso pelo Studio Maker. O arquivo <strong>PPTX</strong> está em anexo.</p>',
    attachments: [
      {
        filename: fileName,
        content: attachmentBuffer,
      },
    ],
  });

  if (error) {
    throw new Error(error.message);
  }

  console.log(`Email enviado via Resend: ${data?.id}`);
  return data;
};
