import { Router, Request, Response } from 'express';
import { getAllSavedChats, getSavedChat, createSavedChat, updateSavedChat, deleteSavedChat, getCard, updateCard, getAllCards, getAllSets, getUser, updateUser } from '../data/databaseAdapter.js';
import { SavedChat } from '../types.js';
import { encryptMessage, decryptMessage } from '../utils/encryption.js';
import { v4 as uuid } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { depleteMana } from '../utils/manaManager.js';

// Helper function to detect if a conversation contains a complete sensual interaction
// This should trigger as soon as a roleplayed intimate experience concludes
function hasCompleteSensualInteraction(messages: any[]): boolean {
	if (!messages || messages.length < 2) return false; // Need at least some interaction
	
	// Check the most recent messages for completion indicators
	// Look at last 4-8 messages (2-4 exchanges) to catch the end of an experience
	const recentMessages = messages.slice(-8);
	const combinedText = recentMessages
		.map(msg => msg.content?.toLowerCase() || '')
		.join(' ');
	
	// Primary indicators: phrases that explicitly indicate the END of an intimate experience
	const completionIndicators = [
		'after we', 'when we finished', 'after we came', 'after we climaxed',
		'when we were done', 'after we were done', 'once we finished',
		'after that', 'when it was over', 'after it was over',
		'we both came', 'we both finished', 'we both climaxed',
		'as we came', 'as we finished', 'as we climaxed',
		'together we came', 'together we finished', 'together we climaxed',
		'after climaxing', 'after coming', 'after finishing',
		'when we climaxed', 'when we came', 'when we finished',
		'post-orgasm', 'after orgasm', 'after the orgasm',
		'lay together', 'laid together', 'lying together',
		'collapsed', 'collapsed together', 'fell back', 'fell back together',
		'catching our breath', 'catching breath', 'catching my breath',
		'afterward', 'afterwards', 'after everything'
	];
	
	// Secondary indicators: sensual keywords that suggest intimate activity occurred
	const sensualKeywords = [
		'climax', 'orgasm', 'release', 'came', 'cum', 'ejaculate',
		'penetrate', 'penetrated', 'entered', 'inside',
		'intimate', 'passionate', 'intense', 'overwhelming'
	];
	
	// Check for explicit completion phrases (strongest indicator)
	const hasCompletionPhrase = completionIndicators.some(phrase => combinedText.includes(phrase));
	
	// Check for sensual keywords
	const keywordCount = sensualKeywords.filter(keyword => combinedText.includes(keyword)).length;
	
	// Trigger devotion increment if:
	// 1. Has explicit completion phrase (indicates experience just ended), OR
	// 2. Has multiple sensual keywords (at least 2) suggesting intimate activity occurred
	// This allows for immediate detection when an experience concludes
	return hasCompletionPhrase || keywordCount >= 2;
}

const router = Router();

// Get all saved chats for the current user
router.get('/', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.userId || (req.headers['x-user-id'] as string);
		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		// Get all saved chats (works with both JSON and Prisma)
		const allChats = await getAllSavedChats();
		const userChats = allChats
			.filter(chat => chat.userId === userId)
			.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

		// Return chats without decrypted messages (for list view), including card image
		const chatsList = await Promise.all(userChats.map(async (chat) => {
			const card = await getCard(chat.cardId);
			return {
				id: chat.id,
				userId: chat.userId,
				cardId: chat.cardId,
				characterName: chat.characterName,
				cardTitle: chat.cardTitle,
				cardImageUrl: card?.imageUrl || '',
				createdAt: chat.createdAt,
				updatedAt: chat.updatedAt,
			};
		}));

		res.json(chatsList);
	} catch (error) {
		console.error('Get saved chats error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Get a specific saved chat with decrypted messages
router.get('/:chatId', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.userId || (req.headers['x-user-id'] as string);
		const { chatId } = req.params;

		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		// Get saved chat (works with both JSON and Prisma)
		const chat = await getSavedChat(chatId);

		if (!chat) {
			return res.status(404).json({ error: 'Chat not found' });
		}

		if (chat.userId !== userId) {
			return res.status(403).json({ error: 'Forbidden' });
		}

		// Decrypt messages
		let messages;
		try {
			const decrypted = decryptMessage(chat.encryptedMessages);
			messages = JSON.parse(decrypted);
		} catch (error) {
			console.error('Failed to decrypt chat messages:', error);
			return res.status(500).json({ error: 'Failed to decrypt chat messages' });
		}

		res.json({
			...chat,
			messages,
		});
	} catch (error) {
		console.error('Get saved chat error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Save a new chat or update existing
router.post('/', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.userId || (req.headers['x-user-id'] as string);
		const { cardId, characterName, cardTitle, messages } = req.body;

		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		if (!cardId || !characterName || !cardTitle || !messages || !Array.isArray(messages)) {
			return res.status(400).json({ error: 'Missing required fields' });
		}

		// Get all saved chats to check for existing chat (works with both JSON and Prisma)
		const allSavedChats = await getAllSavedChats();
		const existingChat = allSavedChats
			.find(chat => chat.userId === userId && chat.cardId === cardId);

		let chat: SavedChat;
		const now = new Date().toISOString();

		if (existingChat) {
			// Update existing chat
			chat = {
				...existingChat,
				encryptedMessages: encryptMessage(JSON.stringify(messages)),
				updatedAt: now,
			};
		} else {
			// Create new chat
			chat = {
				id: uuid(),
				userId,
				cardId,
				characterName,
				cardTitle,
				encryptedMessages: encryptMessage(JSON.stringify(messages)),
				createdAt: now,
				updatedAt: now,
			};
		}

		// Check if this conversation contains a complete sensual interaction
		// If so, increment the card's devotion attribute
		// We only check the NEW messages since last save to avoid duplicate increments
		let shouldIncrementDevotion = false;
		if (existingChat) {
			// For existing chats, only check new messages
			try {
				const previousMessages = JSON.parse(decryptMessage(existingChat.encryptedMessages));
				const newMessages = messages.slice(previousMessages.length);
				if (newMessages.length > 0 && hasCompleteSensualInteraction(newMessages)) {
					shouldIncrementDevotion = true;
				}
			} catch (error) {
				// If we can't decrypt previous messages, check all messages
				if (hasCompleteSensualInteraction(messages)) {
					shouldIncrementDevotion = true;
				}
			}
		} else {
			// For new chats, check all messages
			if (hasCompleteSensualInteraction(messages)) {
				shouldIncrementDevotion = true;
			}
		}
		
		if (shouldIncrementDevotion) {
			// Get and update card (works with both JSON and Prisma)
			const card = await getCard(cardId);
			if (card && card.attributes) {
				const previousDevotion = card.attributes.devotion || 1;
				const newDevotion = (card.attributes.devotion || 1) + 1;
				await updateCard(cardId, {
					attributes: {
						...card.attributes,
						devotion: newDevotion,
					},
				});
				console.log(`📈 Incremented devotion for card ${cardId} from ${previousDevotion} to ${newDevotion}`);
				
				// Deplete mana when an intimate interaction completes
				try {
					const newMana = await depleteMana(cardId);
					console.log(`⚡ Depleted mana for card ${cardId}, current mana: ${newMana}`);
				} catch (error) {
					console.error('Failed to deplete mana:', error);
				}
			}
		}
		
		// Create or update saved chat (works with both JSON and Prisma)
		if (existingChat) {
			await updateSavedChat(chat.id, {
				encryptedMessages: chat.encryptedMessages,
				updatedAt: chat.updatedAt,
			});
		} else {
			await createSavedChat(chat);
		}

		res.json({
			id: chat.id,
			userId: chat.userId,
			cardId: chat.cardId,
			characterName: chat.characterName,
			cardTitle: chat.cardTitle,
			createdAt: chat.createdAt,
			updatedAt: chat.updatedAt,
		});
	} catch (error) {
		console.error('Save chat error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Get current mana for a card
router.get('/card/:cardId/mana', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.userId || (req.headers['x-user-id'] as string);
		const { cardId } = req.params;

		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		// Get card and user (works with both JSON and Prisma)
		const card = await getCard(cardId);

		if (!card) {
			return res.status(404).json({ error: 'Card not found' });
		}

		// Check if user owns the card
		const user = await getUser(userId);
		if (!user || !user.collectionCardIds.includes(cardId)) {
			return res.status(403).json({ error: 'You do not own this card' });
		}

		const { getCurrentMana } = await import('../utils/manaManager.js');

		// Collection bonus: +1 base mana for each owned collection of this card's character
		let baseMana = card.attributes.mana || 5;
		if (card.character) {
			const allSets = await getAllSets();
			const ownedSetsForCharacter = allSets
				.filter(s => s.character === card.character && user.collectionSetIds.includes(s.id)).length;
			baseMana += ownedSetsForCharacter;
		}

		const currentMana = await getCurrentMana(cardId, baseMana);

		res.json({
			currentMana,
			baseMana,
		});
	} catch (error) {
		console.error('Get mana error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Deplete mana by 1 when sending a message
router.post('/card/:cardId/deplete', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.userId || (req.headers['x-user-id'] as string);
		const { cardId } = req.params;

		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		// Get card and user (works with both JSON and Prisma)
		const card = await getCard(cardId);

		if (!card) {
			return res.status(404).json({ error: 'Card not found' });
		}

		// Check if user owns the card
		const user = await getUser(userId);
		if (!user || !user.collectionCardIds.includes(cardId)) {
			return res.status(403).json({ error: 'You do not own this card' });
		}

		const { getCurrentMana, depleteMana } = await import('../utils/manaManager.js');

		// Collection bonus: +1 base mana for each owned collection of this card's character
		let baseMana = card.attributes.mana || 5;
		if (card.character) {
			const allSets = await getAllSets();
			const ownedSetsForCharacter = allSets
				.filter(s => s.character === card.character && user.collectionSetIds.includes(s.id)).length;
			baseMana += ownedSetsForCharacter;
		}

		// Check current mana before depleting
		const currentMana = await getCurrentMana(cardId, baseMana);
		
		if (currentMana <= 0) {
			return res.status(400).json({ error: 'No mana available', currentMana: 0, baseMana });
		}

		// Deplete mana
		const newMana = await depleteMana(cardId);

		res.json({
			success: true,
			currentMana: newMana,
			baseMana,
		});
	} catch (error) {
		console.error('Deplete mana error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Apply a mana reload token to restore a card to base mana
router.post('/card/:cardId/reload', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.userId || (req.headers['x-user-id'] as string);
		const { cardId } = req.params;
		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}
		// Get user and card (works with both JSON and Prisma)
		const user = await getUser(userId);
		const card = await getCard(cardId);
		if (!user || !card) {
			return res.status(404).json({ error: 'Not found' });
		}
		if (!user.collectionCardIds.includes(cardId)) {
			return res.status(403).json({ error: 'You do not own this card' });
		}
		if (!user.manaReloadTokens || user.manaReloadTokens <= 0) {
			return res.status(400).json({ error: 'No mana reloads available' });
		}

		// Compute base mana with collection bonus
		let baseMana = card.attributes.mana || 5;
		if (card.character) {
			const allSets = await getAllSets();
			const ownedSetsForCharacter = allSets
				.filter(s => s.character === card.character && user.collectionSetIds.includes(s.id)).length;
			baseMana += ownedSetsForCharacter;
		}

		// Force set current mana to base using setCurrentMana
		const { setCurrentMana } = await import('../utils/manaManager.js');
		const newMana = await setCurrentMana(cardId, baseMana);

		// Deduct token (cap remains at 10 for stacking)
		const updatedTokens = Math.max(0, (user.manaReloadTokens || 0) - 1);
		await updateUser(userId, { manaReloadTokens: updatedTokens });

		return res.json({ success: true, currentMana: newMana, baseMana, tokensRemaining: updatedTokens });
	} catch (error) {
		console.error('Apply mana reload error:', error);
		return res.status(500).json({ error: 'Internal server error' });
	}
});

// Apply a mana increase token to add +1 current mana (up to base)
router.post('/card/:cardId/increase', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.userId || (req.headers['x-user-id'] as string);
		const { cardId } = req.params;
		if (!userId) return res.status(401).json({ error: 'Unauthorized' });
		// Get user and card (works with both JSON and Prisma)
		const user = await getUser(userId);
		const card = await getCard(cardId);
		if (!user || !card) return res.status(404).json({ error: 'Not found' });
		if (!user.collectionCardIds.includes(cardId)) {
			return res.status(403).json({ error: 'You do not own this card' });
		}
		if (!user.manaIncreaseTokens || user.manaIncreaseTokens <= 0) {
			return res.status(400).json({ error: 'No mana increase tokens available' });
		}
		// Compute base mana with collection bonus
		let baseMana = card.attributes.mana || 5;
		if (card.character) {
			const allSets = await getAllSets();
			const ownedSetsForCharacter = allSets
				.filter(s => s.character === card.character && user.collectionSetIds.includes(s.id)).length;
			baseMana += ownedSetsForCharacter;
		}
		const { getCurrentMana, setCurrentMana } = await import('../utils/manaManager.js');
		const current = await getCurrentMana(cardId, baseMana);
		const newCurrent = Math.min(baseMana, current + 1);
		await setCurrentMana(cardId, newCurrent);
		const updatedTokens = Math.max(0, (user.manaIncreaseTokens || 0) - 1);
		await updateUser(userId, { manaIncreaseTokens: updatedTokens });
		return res.json({ success: true, currentMana: newCurrent, baseMana, tokensRemaining: updatedTokens });
	} catch (error) {
		console.error('Apply mana increase error:', error);
		return res.status(500).json({ error: 'Internal server error' });
	}
});

// Delete a saved chat
router.delete('/:chatId', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.userId || (req.headers['x-user-id'] as string);
		const { chatId } = req.params;

		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		// Get saved chat (works with both JSON and Prisma)
		const chat = await getSavedChat(chatId);

		if (!chat) {
			return res.status(404).json({ error: 'Chat not found' });
		}

		if (chat.userId !== userId) {
			return res.status(403).json({ error: 'Forbidden' });
		}

		// Delete saved chat (works with both JSON and Prisma)
		await deleteSavedChat(chatId);

		res.json({ success: true });
	} catch (error) {
		console.error('Delete chat error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;

