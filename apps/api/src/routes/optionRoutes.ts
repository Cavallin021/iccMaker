import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import path from 'path';
import { getOptions, createOption, generatePresentation, getPresentationStatus, generatePreviewPdf, getBirthdaysList, getPreaching, downloadGeneratedFile, deleteOption } from '../controllers/optionController';

const router = express.Router();

import os from 'os';

// Configuração do Multer para salvar arquivos na pasta temporária do sistema
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });
const presentationUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => {
      const suffix = path.extname(file.originalname).toLowerCase();
      cb(null, randomUUID() + (/^\.[a-z0-9]{1,8}$/.test(suffix) ? suffix : ''));
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 70 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas.'));
  }
}).fields([{ name: 'extraImages', maxCount: 20 }, { name: 'temporaryNotices', maxCount: 50 }]);

router.get('/', getOptions);
router.get('/birthdays', getBirthdaysList);
router.get('/preaching', getPreaching);
router.post('/', upload.array('images', 50), createOption);
router.post('/generate', (req, res, next) => {
  if (!process.env.STUDIO_PASSWORD || req.headers['x-studio-password'] !== process.env.STUDIO_PASSWORD) {
    res.status(401).json({ message: 'Não autorizado. Senha inválida.' });
    return;
  }
  presentationUpload(req, res, error => {
    if (error) {
      res.status(400).json({ message: 'Envie até 50 avisos e 20 imagens extras, com até 10 MB por imagem.' });
      return;
    }
    next();
  });
}, generatePresentation);
router.get('/generate/:jobId', getPresentationStatus);
router.post('/preview-pdf', generatePreviewPdf);
router.get('/download/:filename', downloadGeneratedFile);
router.delete('/:id', deleteOption);

export default router;
