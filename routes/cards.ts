import { Router, Request, Response } from 'express';
import { getAllCards, getCard } from '../data/databaseAdapter.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
	try {
		const cards = await getAllCards();
		res.json(cards);
	} catch (error) {
		console.error('List cards error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

router.get('/:cardId', async (req: Request, res: Response) => {
	try {
		const { cardId } = req.params;
		const card = await getCard(cardId);
		if (!card) {
			return res.status(404).json({ error: 'Card not found' });
		}
		res.json(card);
	} catch (error) {
		console.error('Get card error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;

