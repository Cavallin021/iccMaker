import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Conexão com o MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/iccmaker');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`Falha ao conectar no MongoDB: ${error.message}`);
    console.error(`Certifique-se de que o MongoDB está rodando localmente na porta 27017.`);
    // Removido process.exit(1) para não derrubar o npm run dev
  }
};

import optionRoutes from './routes/optionRoutes';
import selectionRoutes from './routes/selectionRoutes';
import path from 'path';

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'iccMaker API is running' });
});

// Servir os arquivos de imagens para o frontend fazer o Preview
app.use('/static', express.static(path.join(__dirname, '../../canticos')));

// Servir as imagens fixas do molde da apresentação
app.use('/template', express.static(path.join(__dirname, '../public/template')));

app.post('/api/auth/verify', (req, res) => {
  const { password, role } = req.body;
  if (role === 'admin' && password === process.env.STUDIO_PASSWORD) {
    return res.json({ valid: true });
  }
  if (role === 'canticos' && password === process.env.CANTICOS_PASSWORD) {
    return res.json({ valid: true });
  }
  return res.status(401).json({ valid: false, message: 'Senha incorreta' });
});
app.use('/api/options', optionRoutes);
app.use('/api/selections', selectionRoutes);

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
