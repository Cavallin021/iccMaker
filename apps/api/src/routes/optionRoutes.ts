import express from 'express';
import multer from 'multer';
import { getOptions, createOption, generatePresentation, getBirthdaysList, downloadGeneratedFile, deleteOption } from '../controllers/optionController';

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

router.get('/', getOptions);
router.get('/birthdays', getBirthdaysList);
router.post('/', upload.array('images', 50), createOption);
router.post('/generate', upload.array('extraImages', 20), generatePresentation);
router.get('/download/:filename', downloadGeneratedFile);
router.delete('/:id', deleteOption);

export default router;
