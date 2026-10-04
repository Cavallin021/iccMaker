import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getTemplates, updateTemplate } from '../controllers/templateController';

const router = express.Router();

const tempDir = path.join(__dirname, '../../../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, 'template-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

router.get('/', getTemplates);
router.post('/upload', upload.single('image'), updateTemplate);

export default router;
