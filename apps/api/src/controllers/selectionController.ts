import { Request, Response } from 'express';
import Selection from '../models/Selection';
import Option from '../models/Option';

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

    res.status(201).json({ message: 'Seleção enviada com sucesso!', selection: newSelection });
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao enviar seleção', error: error.message });
  }
};

export const getPendingSelections = async (req: Request, res: Response): Promise<void> => {
  try {
    // Busca todas as seleções (não apenas as pendentes)
    const selections = await Selection.find({}).sort({ createdAt: -1 });
    res.json(selections);
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao buscar seleções', error: error.message });
  }
};

export const markAsProcessed = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const selection = await Selection.findByIdAndUpdate(id, { status: 'processed' }, { new: true });
    
    if (!selection) {
      res.status(404).json({ message: 'Seleção não encontrada.' });
      return;
    }

    res.json({ message: 'Seleção marcada como processada.', selection });
  } catch (error: any) {
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
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao remover seleção', error: error.message });
  }
};
