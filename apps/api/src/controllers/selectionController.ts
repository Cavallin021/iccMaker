import { Request, Response } from 'express';
import Selection from '../models/Selection';
import Option from '../models/Option';
import { sendTelegramNotification } from '../services/telegramService';

export const createSelection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { songs } = req.body;

    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      res.status(400).json({ message: 'Lista de cânticos inválida.' });
      return;
    }

    const newSelection = new Selection({
      songs
    });

    await newSelection.save();

    const getNextSunday = () => {
      const d = new Date();
      d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
      const day = String(d.getDate()).padStart(2, '0');
      const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      const month = meses[d.getMonth()];
      const year = d.getFullYear();
      return `${day} de ${month} de ${year}`;
    };

    // Tenta notificar o admin
    const msg = `🔔 *Nova Seleção de Cânticos!*\n\nA equipe enviou uma nova lista para o culto.\nAcesse o Estúdio para gerar a apresentação de *${getNextSunday()}*.`;
    const notificationSent = await sendTelegramNotification(msg);

    if (!notificationSent) {
      res.status(201).json({ 
        message: 'Sua seleção foi salva no sistema com sucesso, mas o servidor falhou em notificar a equipe. Por favor, avise o administrador.', 
        selection: newSelection 
      });
      return;
    }

    res.status(201).json({ message: 'Seleção enviada com sucesso!', selection: newSelection });
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao enviar seleção', error: error.message });
  }
};

export const getPendingSelections = async (req: Request, res: Response): Promise<void> => {
  try {
    // Busca todas as seleções (não apenas as pendentes) usando .lean() para máxima performance
    const selections = await Selection.find({}).sort({ createdAt: -1 }).lean();
    res.json(selections);
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao buscar seleções', error: error.message });
  }
};

export const markAsProcessed = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const selection = await Selection.findByIdAndUpdate(id, { status: 'processed' }, { returnDocument: 'after' });

    if (!selection) {
      res.status(404).json({ message: 'Seleção não encontrada.' });
      return;
    }

    res.json({ message: 'Seleção marcada como processada.', selection });
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao atualizar seleção', error: error.message });
  }
};

export const deleteSelection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const selection = await Selection.findByIdAndDelete(id);

    if (!selection) {
      res.status(404).json({ message: 'Seleção não encontrada.' });
      return;
    }

    res.json({ message: 'Seleção removida com sucesso.' });
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao remover seleção', error: error.message });
  }
};
