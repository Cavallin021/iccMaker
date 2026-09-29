export const sendTelegramNotification = async (message: string): Promise<boolean> => {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não definidos. Notificação ignorada.');
    return false;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Falha ao enviar notificação do Telegram:', err);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Erro de rede ao enviar notificação do Telegram:', error);
    return false;
  }
};
