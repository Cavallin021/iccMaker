import express from 'express';
import multer from 'multer';
import { getNotices, createNotice, updateNotice, deleteNotice, generateVideo } from '../controllers/noticeController';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
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
router.use((req, res, next) => {
  if (!process.env.STUDIO_PASSWORD || req.headers['x-studio-password'] !== process.env.STUDIO_PASSWORD) {
    res.status(401).json({ message: 'Não autorizado. Senha inválida.' });
    return;
  }
  next();
});
router.post('/', upload.single('image'), createNotice);
router.patch('/:id', updateNotice);
router.delete('/:id', deleteNotice);
router.post('/generate-video', generateVideo);

export default router;
