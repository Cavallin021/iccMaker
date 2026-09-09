import express from 'express';
import multer from 'multer';
import path from 'path';
import { getNotices, createNotice, updateNotice, deleteNotice, generateVideo } from '../controllers/noticeController';

const router = express.Router();

// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../../avisos'));
  },
  filename: (req, file, cb) => {
    // Gerar um nome único para evitar conflitos
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'aviso-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limite de 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas.'));
    }
  }
});

router.get('/', getNotices);
router.post('/', upload.single('image'), createNotice);
router.patch('/:id', updateNotice);
router.delete('/:id', deleteNotice);
router.post('/generate-video', generateVideo);

export default router;
