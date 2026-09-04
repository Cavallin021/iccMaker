import express from 'express';
import { createSelection, getPendingSelections, markAsProcessed, deleteSelection } from '../controllers/selectionController';

const router = express.Router();

router.post('/', createSelection);
router.get('/pending', getPendingSelections);
router.patch('/:id/processed', markAsProcessed);
router.delete('/:id', deleteSelection);

export default router;
