import { Router, Request, Response } from 'express';
import { getAllSets, getSet } from '../data/databaseAdapter.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
	try {
		const sets = await getAllSets();
		res.json(sets);
	} catch (error) {
		console.error('List sets error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

router.get('/:setId', async (req: Request, res: Response) => {
	try {
		const { setId } = req.params;
		const set = await getSet(setId);
		if (!set) {
			return res.status(404).json({ error: 'Set not found' });
		}
		res.json(set);
	} catch (error) {
		console.error('Get set error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;

