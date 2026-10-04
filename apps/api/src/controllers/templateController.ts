import { Request, Response } from 'express';
import Template from '../models/Template';
import { uploadImage, deleteImage } from '../services/cloudinaryService';
import fs from 'fs';

export const getTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const templates = await Template.find().sort({ position: 1 }).lean();
    res.json(templates);
  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao buscar templates', error: error.message });
  }
};

export const updateTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { position } = req.body;
    
    if (!req.file) {
      res.status(400).json({ message: 'Imagem é obrigatória.' });
      return;
    }

    const pos = parseInt(position, 10);
    if (pos < 1 || pos > 7) {
      res.status(400).json({ message: 'Posição inválida (deve ser 1 a 7).' });
      return;
    }

    const existing = await Template.findOne({ position: pos });
    
    try {
      // Upload nova pro Cloudinary
      const secureUrl = await uploadImage(req.file.path, 'templates');

      if (existing) {
        // Deletar a antiga
        if (existing.imageUrl.startsWith('http')) {
          await deleteImage(existing.imageUrl);
        }
        existing.imageUrl = secureUrl;
        await existing.save();
        res.json(existing);
      } else {
        const newTemp = new Template({ position: pos, imageUrl: secureUrl });
        await newTemp.save();
        res.status(201).json(newTemp);
      }
    } finally {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }

  } catch (e) {
    const error = e as Error;
    res.status(500).json({ message: 'Erro ao atualizar template', error: error.message });
  }
};
