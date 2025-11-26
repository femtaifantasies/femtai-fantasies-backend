import { Router, Request, Response } from 'express';
import { getCard, getSet, getUser, updateUser } from '../data/databaseAdapter.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/card/:cardId', requireAuth, async (req: Request, res: Response) => {
	try {
		const { cardId } = req.params;
		const userId = req.userId!;

		// Get card and user (works with both JSON and Prisma)
		const card = await getCard(cardId);
		if (!card) {
			return res.status(404).json({ error: 'Card not found' });
		}

		const user = await getUser(userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		if (!user.collectionCardIds.includes(cardId)) {
			const updatedCollectionCardIds = [...user.collectionCardIds, cardId];
			await updateUser(userId, { collectionCardIds: updatedCollectionCardIds });
		}

		// Get updated user to return
		const updatedUser = await getUser(userId);
		res.json(updatedUser);
	} catch (error) {
		console.error('Purchase card error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

router.post('/set/:setId', requireAuth, async (req: Request, res: Response) => {
	try {
		const { setId } = req.params;
		const userId = req.userId!;

		// Get set and user (works with both JSON and Prisma)
		const set = await getSet(setId);
		if (!set) {
			return res.status(404).json({ error: 'Set not found' });
		}

		const user = await getUser(userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		const updatedCollectionSetIds = [...user.collectionSetIds];
		const updatedCollectionCardIds = [...user.collectionCardIds];

		if (!updatedCollectionSetIds.includes(setId)) {
			updatedCollectionSetIds.push(setId);
		}

		// Add all cards from the set to user's collection
		for (const cardId of set.cardIds) {
			if (!updatedCollectionCardIds.includes(cardId)) {
				updatedCollectionCardIds.push(cardId);
			}
		}

		// Update user (works with both JSON and Prisma)
		await updateUser(userId, {
			collectionSetIds: updatedCollectionSetIds,
			collectionCardIds: updatedCollectionCardIds,
		});

		// Get updated user to return
		const updatedUser = await getUser(userId);
		res.json(updatedUser);
	} catch (error) {
		console.error('Purchase set error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;

