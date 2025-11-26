import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getUser, getCard, getAllTrades, getTrade, createTrade, updateTrade, updateUser } from '../data/databaseAdapter.js';
import { requireAuth } from '../middleware/auth.js';
import { TradeProposal } from '../types.js';
import { createNotification } from '../utils/notifications.js';
import { decryptMessage } from '../utils/encryption.js';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.userId!;
		const allTrades = await getAllTrades();
		const trades = allTrades.filter(
			(t) => t.fromUserId === userId || t.toUserId === userId
		);
		res.json(trades);
	} catch (error) {
		console.error('List trades error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
	try {
		const { toUserId, cardOfferedId, cardRequestedId } = req.body;
		const fromUserId = req.userId!;

		if (!toUserId || !cardOfferedId || !cardRequestedId) {
			return res.status(400).json({ error: 'Missing required fields' });
		}

		// Get users (works with both JSON and Prisma)
		const fromUser = await getUser(fromUserId);
		const toUser = await getUser(toUserId);

		if (!fromUser || !toUser) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Check if users are friends (required for trading)
		const areFriends = (fromUser.friendIds?.includes(toUserId) || false) && 
		                   (toUser.friendIds?.includes(fromUserId) || false);
		
		if (!areFriends) {
			return res.status(403).json({ error: 'You can only trade with users you are friends with' });
		}

		// Verify user owns the card they're offering
		if (!fromUser.collectionCardIds.includes(cardOfferedId)) {
			return res.status(403).json({ error: 'You do not own the card you are offering' });
		}

		// Verify target user owns the card requested
		if (!toUser.collectionCardIds.includes(cardRequestedId)) {
			return res.status(403).json({ error: 'Target user does not own the requested card' });
		}

		const trade: TradeProposal = {
			id: uuid(),
			fromUserId,
			toUserId,
			cardOfferedId,
			cardRequestedId,
			status: 'pending',
			createdAt: new Date().toISOString(),
		};

		// Create trade (works with both JSON and Prisma)
		await createTrade(trade);

		// Create notification for the recipient
		const offeredCard = await getCard(cardOfferedId);
		const requestedCard = await getCard(cardRequestedId);
		const fromUsername = fromUser.username 
			? decryptMessage(fromUser.username) 
			: decryptMessage(fromUser.email).split('@')[0];
		await createNotification(
			toUserId,
			'trade',
			'New Trade Proposal',
			`${fromUsername} wants to trade ${offeredCard?.title || 'a card'} for your ${requestedCard?.title || 'card'}`,
			trade.id,
			fromUserId
		);

		res.status(201).json(trade);
	} catch (error) {
		console.error('Create trade error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

router.post('/:tradeId/respond', requireAuth, async (req: Request, res: Response) => {
	try {
		const { tradeId } = req.params;
		const { accept } = req.body;
		const userId = req.userId!;

		if (typeof accept !== 'boolean') {
			return res.status(400).json({ error: 'accept field must be boolean' });
		}

		// Get trade (works with both JSON and Prisma)
		const trade = await getTrade(tradeId);
		if (!trade) {
			return res.status(404).json({ error: 'Trade not found' });
		}

		if (trade.toUserId !== userId) {
			return res.status(403).json({ error: 'You are not the recipient of this trade' });
		}

		if (trade.status !== 'pending') {
			return res.status(400).json({ error: 'Trade is not pending' });
		}

		const newStatus = accept ? 'accepted' : 'declined';

		if (accept) {
			// Get users (works with both JSON and Prisma)
			const fromUser = await getUser(trade.fromUserId);
			const toUser = await getUser(trade.toUserId);

			if (fromUser && toUser) {
				// Update collections
				const fromUserCardIds = fromUser.collectionCardIds.filter(
					(id) => id !== trade.cardOfferedId
				);
				fromUserCardIds.push(trade.cardRequestedId);
				
				const toUserCardIds = toUser.collectionCardIds.filter(
					(id) => id !== trade.cardRequestedId
				);
				toUserCardIds.push(trade.cardOfferedId);

				// Update users (works with both JSON and Prisma)
				await updateUser(trade.fromUserId, { collectionCardIds: fromUserCardIds });
				await updateUser(trade.toUserId, { collectionCardIds: toUserCardIds });

				// Create notification for the person who proposed the trade
				try {
					const offeredCard = await getCard(trade.cardOfferedId);
					const requestedCard = await getCard(trade.cardRequestedId);
					const updatedToUser = await getUser(trade.toUserId);
					const toUsername = updatedToUser?.username 
						? decryptMessage(updatedToUser.username) 
						: decryptMessage(updatedToUser?.email || '').split('@')[0];
					
					await createNotification(
						trade.fromUserId,
						'trade',
						'Trade Accepted',
						`${toUsername} accepted your trade: ${offeredCard?.title || 'your card'} for ${requestedCard?.title || 'their card'}`,
						tradeId,
						userId
					);
				} catch (error) {
					console.error('Error creating trade acceptance notification:', error);
				}
			}
		}

		// Update trade status (works with both JSON and Prisma)
		await updateTrade(tradeId, { status: newStatus });

		// Get updated trade to return
		const updatedTrade = await getTrade(tradeId);
		res.json(updatedTrade);
	} catch (error) {
		console.error('Respond to trade error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;

