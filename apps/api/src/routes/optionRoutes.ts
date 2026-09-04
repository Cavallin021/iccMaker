import express from 'express';
import multer from 'multer';
import path from 'path';
import { getOptions, createOption, generatePresentation, getBirthdaysList } from '../controllers/optionController';

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
router.post('/', upload.single('file'), createOption);
router.post('/generate', upload.array('extraImages', 20), generatePresentation);

export default router;
