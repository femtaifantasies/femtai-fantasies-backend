import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getDatabase, saveDatabase } from '../data/database.js';
import { requireAdmin } from '../middleware/auth.js';
import { parseCSV, parseStandaloneCardsCSV } from '../utils/csvParser.js';
import { Card, CardSet, Character } from '../types.js';
import { v4 as uuid } from 'uuid';
import { ensureThumbnailFormat } from '../utils/imageUrlValidator.js';
import { createNotificationForAllUsers } from '../utils/notifications.js';
import { getUser, getAllUsers, updateUser, getCard, updateCard } from '../data/databaseAdapter.js';
import { findUserByEmail } from '../utils/userEmailHelper.js';
import { encryptIsAdmin } from '../utils/userHelpers.js';
import { cleanCardTitle } from '../utils/cardTitleCleaner.js';

const router = Router();

// Configure multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// Normalize Google Drive URLs to thumbnail format
// CRITICAL: This function MUST NOT modify URLs that are already in thumbnail format
function normalizeImageUrl(url: string): string {
	return ensureThumbnailFormat(url);
}

// Get all cards and sets (admin view)
router.get('/collections', requireAdmin, async (req: Request, res: Response) => {
	try {
		const db = getDatabase();
		const cards = Array.from(db.cards.values());
		const sets = Array.from(db.sets.values());
		res.json({ cards, sets });
	} catch (error) {
		console.error('Admin get collections error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Upload CSV to add/update collections or standalone cards
router.post('/upload-csv', requireAdmin, upload.single('csv'), async (req: Request, res: Response) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: 'No CSV file provided' });
		}

		const csvContent = req.file.buffer.toString('utf-8');
		const isStandalone = req.body.standalone === 'true' || req.body.standalone === true;
		
		let cards: Card[] = [];
		let sets: CardSet[] = [];
		
		if (isStandalone) {
			// Parse as standalone cards
			const result = parseStandaloneCardsCSV(csvContent);
			cards = result.cards;
			
			if (cards.length === 0) {
				return res.status(400).json({ error: 'No valid standalone cards found in CSV' });
			}
		} else {
			// Parse as collections
			const result = parseCSV(csvContent);
			cards = result.cards;
			sets = result.sets;
			
			if (cards.length === 0 && sets.length === 0) {
				return res.status(400).json({ error: 'No valid collections found in CSV' });
			}
		}

		const db = getDatabase();
		let newCards = 0;
		let newSets = 0;
		let totalUrlsFound = 0;
		
		// Track which cards were actually added (new card IDs)
		const addedCardIds: string[] = [];
		
		// Count total URLs in CSV for logging
		for (const csvCard of cards) {
			totalUrlsFound++;
		}
		console.log(`📊 CSV Upload: Found ${totalUrlsFound} total URL(s) in CSV file`);

		// Add only new cards (skip existing ones to prevent overwrites)
		// For standalone cards, match by title only (no character requirement)
		// For collection cards, match by imageUrl to avoid duplicates
		console.log(`\n📦 Processing ${cards.length} card(s) from CSV...`);
		for (const csvCard of cards) {
			// Ensure cost is at least $3
			csvCard.cost = Math.max(csvCard.cost, 3);
			
			// Normalize image URL to ensure correct format
			// Only normalize if not already in thumbnail format (to avoid breaking correct URLs)
			const originalUrl = csvCard.imageUrl;
			if (!csvCard.imageUrl.includes('drive.google.com/thumbnail?id=')) {
				csvCard.imageUrl = normalizeImageUrl(csvCard.imageUrl);
			}

			// Find existing card by matching imageUrl (most reliable)
			// For collection cards, we match by imageUrl only to ensure each unique image becomes a card
			const existingCard = Array.from(db.cards.values()).find(
				c => c.imageUrl === csvCard.imageUrl
			);

			if (existingCard) {
				// Skip existing card - don't overwrite
				console.log(`⏭️  Skipping existing card: ${csvCard.title} (imageUrl already exists)`);
				continue;
			} else {
				// New card - add to database
				db.cards.set(csvCard.id, csvCard);
				addedCardIds.push(csvCard.id);
				newCards++;
				const fileIdMatch = csvCard.imageUrl.match(/id=([a-zA-Z0-9_-]+)/);
				const fileId = fileIdMatch ? fileIdMatch[1].substring(0, 20) : 'unknown';
				console.log(`➕ Adding new card: ${csvCard.title} (File ID: ${fileId}...)`);
			}
		}
		console.log(`\n📊 Card Processing Summary:`);
		console.log(`   Total cards from CSV: ${cards.length}`);
		console.log(`   New cards added: ${newCards}`);
		console.log(`   Cards skipped (existing): ${cards.length - newCards}`);
		console.log(`   Card IDs tracked: ${addedCardIds.length}`);

		// Add only new sets (skip existing ones to prevent overwrites)
		// Create/update characters from cards (for both standalone and collection cards)
		const characterNames = new Set<string>();
		for (const card of cards) {
			if (card.character) {
				characterNames.add(card.character);
			}
		}
		for (const set of sets) {
			if (set.character) {
				characterNames.add(set.character);
			}
		}

		// Create or update character entries
		let charactersCreated = 0;
		for (const charName of characterNames) {
			const existingChar = Array.from(db.characters.values()).find(c => c.name === charName);
			if (!existingChar) {
				const character: Character = {
					id: uuid(),
					name: charName,
				};
				db.characters.set(character.id, character);
				charactersCreated++;
				console.log(`👤 Created new character: ${charName}`);
			}
		}
		if (charactersCreated > 0) {
			console.log(`✅ Created ${charactersCreated} new character(s) from uploaded cards`);
		}

		// Only process sets if not in standalone mode
		if (!isStandalone) {
			for (const csvSet of sets) {
			// Normalize image URLs to ensure correct format (only if not already correct)
			// Skip normalization if URL is already in thumbnail format to avoid breaking correct URLs
			if (!csvSet.imageUrl.includes('drive.google.com/thumbnail?id=')) {
				csvSet.imageUrl = normalizeImageUrl(csvSet.imageUrl);
			}
			if (csvSet.coverImageUrl && !csvSet.coverImageUrl.includes('drive.google.com/thumbnail?id=')) {
				csvSet.coverImageUrl = normalizeImageUrl(csvSet.coverImageUrl);
			}
			
			const existingSet = Array.from(db.sets.values()).find(s => s.name === csvSet.name);

			if (existingSet) {
				// Skip existing set - don't overwrite
				console.log(`⏭️  Skipping existing set: ${csvSet.name} (already exists)`);
				continue;
			} else {
				// New set - ONLY include cards that were just added from this CSV
				// Filter to only include card IDs that are in the addedCardIds array
				const newCardIds = csvSet.cardIds.filter(id => addedCardIds.includes(id));
				
				if (newCardIds.length === 0) {
					console.log(`⚠️  Skipping set ${csvSet.name}: no new cards to include`);
					continue;
				}
				
				// Update set to only contain the new cards
				csvSet.cardIds = newCardIds;
				
				// Ensure new set URLs are normalized (only if not already correct)
				if (!csvSet.imageUrl.includes('drive.google.com/thumbnail?id=')) {
					csvSet.imageUrl = normalizeImageUrl(csvSet.imageUrl);
				}
				if (csvSet.coverImageUrl && !csvSet.coverImageUrl.includes('drive.google.com/thumbnail?id=')) {
					csvSet.coverImageUrl = normalizeImageUrl(csvSet.coverImageUrl);
				}
				db.sets.set(csvSet.id, csvSet);
				newSets++;
				console.log(`➕ Adding new set: ${csvSet.name} (ID: ${csvSet.id}) with ${csvSet.cardIds.length} new cards`);
			}
		}
		}

		// Save database to persist all changes (cards and sets)
		try {
			await saveDatabase();
			console.log(`💾 Database saved successfully`);
		} catch (saveError) {
			console.error('❌ Error saving database:', saveError);
			throw new Error('Failed to save database after CSV upload');
		}
		
		if (isStandalone) {
			console.log(`✅ Standalone cards upload complete: ${newCards} new cards added (existing items skipped)`);
			// Create notifications for new standalone cards
			if (newCards > 0) {
				await createNotificationForAllUsers(
					'new_card',
					'New Cards Available!',
					`${newCards} new standalone card${newCards !== 1 ? 's' : ''} ${newCards !== 1 ? 'are' : 'is'} now available in the shop!`,
					undefined
				);
			}
		} else {
			console.log(`✅ CSV upload complete: ${newCards} new cards added, ${newSets} new sets added (existing items skipped)`);
			// Create notifications for new cards and collections
			if (newCards > 0) {
				await createNotificationForAllUsers(
					'new_card',
					'New Cards Available!',
					`${newCards} new card${newCards !== 1 ? 's' : ''} ${newCards !== 1 ? 'are' : 'is'} now available!`,
					undefined
				);
			}
			if (newSets > 0) {
				await createNotificationForAllUsers(
					'new_collection',
					'New Collections Available!',
					`${newSets} new collection${newSets !== 1 ? 's' : ''} ${newSets !== 1 ? 'are' : 'is'} now available!`,
					undefined
				);
			}
		}
		console.log(`📦 Total cards in database: ${db.cards.size}, Total sets in database: ${db.sets.size}`);
		
		// Log sample URLs to verify format
		if (cards.length > 0) {
			const sampleCard = cards[0];
			console.log(`📸 Sample card URL after normalization: ${sampleCard.imageUrl.substring(0, 70)}...`);
		}
		if (sets.length > 0) {
			const sampleSet = sets[0];
			console.log(`📸 Sample set URL after normalization: ${sampleSet.imageUrl.substring(0, 70)}...`);
		}

		res.json({
			success: true,
			message: isStandalone 
				? 'Standalone cards uploaded successfully. Only new cards were added; existing cards were skipped.'
				: 'CSV uploaded successfully. Only new items were added; existing items were skipped.',
			stats: {
				newCards,
				newSets,
				totalCards: db.cards.size,
				totalSets: db.sets.size,
				isStandalone,
			},
		});
	} catch (error: any) {
		console.error('Admin upload CSV error:', error);
		res.status(500).json({ error: error.message || 'Internal server error' });
	}
});

// Delete a card
router.delete('/card/:cardId', requireAdmin, async (req: Request, res: Response) => {
	try {
		const { cardId } = req.params;
		const db = getDatabase();

		// Check if card exists
		if (!db.cards.has(cardId)) {
			return res.status(404).json({ error: 'Card not found' });
		}

		// Remove card from any sets that reference it
		for (const [setId, set] of db.sets.entries()) {
			if (set.cardIds.includes(cardId)) {
				set.cardIds = set.cardIds.filter(id => id !== cardId);
				db.sets.set(setId, set);
			}
		}

		// Remove card from users' collections
		for (const [userId, user] of db.users.entries()) {
			if (user.collectionCardIds.includes(cardId)) {
				user.collectionCardIds = user.collectionCardIds.filter(id => id !== cardId);
				db.users.set(userId, user);
			}
		}

		// Delete the card
		db.cards.delete(cardId);
		await saveDatabase();

		res.json({ success: true, message: 'Card deleted successfully' });
	} catch (error) {
		console.error('Admin delete card error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Delete a set
router.delete('/set/:setId', requireAdmin, async (req: Request, res: Response) => {
	try {
		const { setId } = req.params;
		const db = getDatabase();

		// Check if set exists
		const set = db.sets.get(setId);
		if (!set) {
			return res.status(404).json({ error: 'Set not found' });
		}

		// Delete all cards in the collection
		let deletedCards = 0;
		for (const cardId of set.cardIds) {
			// Remove card from users' collections
			for (const [userId, user] of db.users.entries()) {
				if (user.collectionCardIds.includes(cardId)) {
					user.collectionCardIds = user.collectionCardIds.filter(id => id !== cardId);
					db.users.set(userId, user);
				}
			}
			
			// Delete the card
			if (db.cards.delete(cardId)) {
				deletedCards++;
			}
		}

		// Remove set from users' collections
		for (const [userId, user] of db.users.entries()) {
			if (user.collectionSetIds.includes(setId)) {
				user.collectionSetIds = user.collectionSetIds.filter(id => id !== setId);
				db.users.set(userId, user);
			}
		}

		// Delete the set
		db.sets.delete(setId);
		await saveDatabase();

		res.json({ 
			success: true, 
			message: `Set and ${deletedCards} associated card(s) deleted successfully` 
		});
	} catch (error) {
		console.error('Admin delete set error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Update a card
router.put('/card/:cardId', requireAdmin, async (req: Request, res: Response) => {
	try {
		const { cardId } = req.params;
		
		// Use database adapter (works with both JSON and Prisma)
		const card = await getCard(cardId);
		if (!card) {
			return res.status(404).json({ error: 'Card not found' });
		}

		const updates: Partial<Card> = {};
		if (req.body.cost !== undefined) updates.cost = Math.max(req.body.cost, 3);
		if (req.body.title !== undefined) {
			// Clean the title to ensure correct format
			updates.title = cleanCardTitle(req.body.title, req.body.character || card.character);
		}
		if (req.body.description !== undefined) updates.description = req.body.description;
		if (req.body.type !== undefined) updates.type = req.body.type;
		if (req.body.mana !== undefined) {
			updates.attributes = {
				...card.attributes,
				mana: req.body.mana,
			};
		}
		if (req.body.character !== undefined) {
			updates.character = req.body.character;
			// If character changed and title exists, clean the title
			if (updates.title === undefined && card.title) {
				updates.title = cleanCardTitle(card.title, req.body.character);
			}
		}
		
		// Handle imageUrl and attributes updates
		if (req.body.imageUrl !== undefined) updates.imageUrl = req.body.imageUrl;
		if (req.body.attributes !== undefined) {
			updates.attributes = {
				...card.attributes,
				...req.body.attributes,
			};
		}
		
		// Update card using database adapter
		const updatedCard = await updateCard(cardId, updates);
		res.json(updatedCard);
	} catch (error) {
		console.error('Admin update card error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Update a set
router.put('/set/:setId', requireAdmin, async (req: Request, res: Response) => {
	try {
		const { setId } = req.params;
		const db = getDatabase();

		const set = db.sets.get(setId);
		if (!set) {
			return res.status(404).json({ error: 'Set not found' });
		}

		const updates = req.body;
		if (updates.name !== undefined) set.name = updates.name;
		if (updates.description !== undefined) set.description = updates.description;
		if (updates.imageUrl !== undefined) set.imageUrl = updates.imageUrl;
		if (updates.coverImageUrl !== undefined) set.coverImageUrl = updates.coverImageUrl;
		if (updates.cost !== undefined) set.cost = updates.cost;
		if (updates.costPerCard !== undefined) set.costPerCard = updates.costPerCard;
		if (updates.type !== undefined) set.type = updates.type;
		if (updates.mana !== undefined) set.mana = updates.mana;
		if (updates.character !== undefined) set.character = updates.character;
		if (updates.cardIds !== undefined) set.cardIds = updates.cardIds;

		db.sets.set(setId, set);
		await saveDatabase();

		res.json(set);
	} catch (error) {
		console.error('Admin update set error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Get all characters (admin view)
router.get('/characters', requireAdmin, async (req: Request, res: Response) => {
	try {
		const db = getDatabase();
		// For admin view, we also enrich with random covers if missing
		const characters = Array.from(db.characters.values()).map(character => {
			if (!character.coverImageUrl) {
				const characterCards = Array.from(db.cards.values()).filter(
					card => card.character?.toLowerCase() === character.name.toLowerCase()
				);
				if (characterCards.length > 0) {
					const randomIndex = Math.floor(Math.random() * characterCards.length);
					return {
						...character,
						coverImageUrl: characterCards[randomIndex]?.imageUrl,
					};
				}
			}
			return character;
		});
		res.json(characters);
	} catch (error) {
		console.error('Admin get characters error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Update a character
router.put('/character/:characterId', requireAdmin, async (req: Request, res: Response) => {
	try {
		const { characterId } = req.params;
		const updates: Partial<Character> = req.body;
		const db = getDatabase();
		const character = db.characters.get(characterId);

		if (!character) {
			return res.status(404).json({ error: 'Character not found' });
		}

		// Apply updates and normalize image URL
		Object.assign(character, updates);
		if (character.coverImageUrl && !character.coverImageUrl.includes('drive.google.com/thumbnail?id=')) {
			character.coverImageUrl = normalizeImageUrl(character.coverImageUrl);
		}
		
		db.characters.set(characterId, character);
		await saveDatabase();
		res.json(character);
	} catch (error) {
		console.error('Admin update character error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Set admin status for a user (admin only)
router.put('/user/:userId/admin', requireAdmin, async (req: Request, res: Response) => {
	try {
		const { userId } = req.params;
		const { isAdmin } = req.body;

		if (typeof isAdmin !== 'boolean') {
			return res.status(400).json({ error: 'isAdmin must be a boolean value' });
		}

		const user = await getUser(userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Encrypt the admin status
		const encryptedAdminStatus = encryptIsAdmin(isAdmin);

		// Update the user
		const updatedUser = await updateUser(userId, {
			isAdmin: encryptedAdminStatus,
		});

		res.json({ 
			success: true, 
			message: `Admin access ${isAdmin ? 'granted' : 'revoked'} successfully`,
			userId: updatedUser.id 
		});
	} catch (error) {
		console.error('Admin set user admin status error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Set admin status by email (admin only)
router.put('/user/email/:email/admin', requireAdmin, async (req: Request, res: Response) => {
	try {
		const email = decodeURIComponent(req.params.email);
		const { isAdmin } = req.body;

		if (typeof isAdmin !== 'boolean') {
			return res.status(400).json({ error: 'isAdmin must be a boolean value' });
		}

		const user = await findUserByEmail(email);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Encrypt the admin status
		const encryptedAdminStatus = encryptIsAdmin(isAdmin);

		// Update the user
		const updatedUser = await updateUser(user.id, {
			isAdmin: encryptedAdminStatus,
		});

		res.json({ 
			success: true, 
			message: `Admin access ${isAdmin ? 'granted' : 'revoked'} successfully`,
			userId: updatedUser.id 
		});
	} catch (error) {
		console.error('Admin set user admin status by email error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// List all users (admin only) - for finding user IDs/emails
router.get('/users', requireAdmin, async (req: Request, res: Response) => {
	try {
		const users = await getAllUsers();
		
		// Return minimal user info (no sensitive data)
		const userList = users.map(user => ({
			id: user.id,
			email: user.email, // Still encrypted, but admin can see it
			username: user.username, // Still encrypted
			isAdmin: user.isAdmin, // Still encrypted
			createdAt: (user as any).createdAt,
		}));

		res.json({ users: userList });
	} catch (error) {
		console.error('Admin get users error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;

