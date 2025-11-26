/**
 * Database Adapter
 * Provides unified interface for both Prisma (PostgreSQL) and JSON file storage
 * Automatically falls back to JSON if DATABASE_URL is not set
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { getPrismaClient } from './prismaClient.js';
import { getDatabase as getJsonDatabase, saveDatabase as saveJsonDatabase, loadDatabase as loadJsonDatabase } from './database.js';
import type { Card, CardSet, UserProfile, TradeProposal, Character, Message, UserReport, Notification, SavedChat, FriendRequest } from '../types.js';

export type DatabaseMode = 'prisma' | 'json';

let currentMode: DatabaseMode | null = null;

export function getDatabaseMode(): DatabaseMode {
	if (currentMode) {
		return currentMode;
	}

	const prisma = getPrismaClient();
	currentMode = prisma ? 'prisma' : 'json';
	console.log(`📦 Database mode: ${currentMode.toUpperCase()}`);
	return currentMode;
}

// Card operations
export async function getCard(id: string): Promise<Card | null> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const card = await prisma.card.findUnique({
			where: { id },
		});
		if (!card) return null;
		return {
			...card,
			attributes: card.attributes as Card['attributes'],
		};
	}
	const db = getJsonDatabase();
	return db.cards.get(id) || null;
}

export async function getAllCards(): Promise<Card[]> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const cards = await prisma.card.findMany({
			orderBy: { createdAt: 'desc' },
		});
		return cards.map(card => ({
			...card,
			attributes: card.attributes as Card['attributes'],
		}));
	}
	const db = getJsonDatabase();
	return Array.from(db.cards.values());
}

export async function createCard(card: Card): Promise<Card> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const created = await prisma.card.create({
			data: {
				...card,
				attributes: card.attributes as any,
			},
		});
		return {
			...created,
			attributes: created.attributes as Card['attributes'],
		};
	}
	const db = getJsonDatabase();
	db.cards.set(card.id, card);
	await saveJsonDatabase();
	return card;
}

export async function updateCard(id: string, updates: Partial<Card>): Promise<Card> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const updated = await prisma.card.update({
			where: { id },
			data: {
				...updates,
				attributes: updates.attributes as any,
			},
		});
		return {
			...updated,
			attributes: updated.attributes as Card['attributes'],
		};
	}
	const db = getJsonDatabase();
	const card = db.cards.get(id);
	if (!card) throw new Error('Card not found');
	const updated = { ...card, ...updates };
	db.cards.set(id, updated);
	await saveJsonDatabase();
	return updated;
}

export async function deleteCard(id: string): Promise<void> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		await prisma.card.delete({ where: { id } });
		return;
	}
	const db = getJsonDatabase();
	db.cards.delete(id);
	await saveJsonDatabase();
}

// Set operations
export async function getSet(id: string): Promise<CardSet | null> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const set = await prisma.cardSet.findUnique({
			where: { id },
			include: {
				setCards: {
					include: { card: true },
				},
			},
		});
		if (!set) return null;
		return {
			...set,
			cardIds: set.setCards.map(sc => sc.cardId),
		};
	}
	const db = getJsonDatabase();
	return db.sets.get(id) || null;
}

export async function getAllSets(): Promise<CardSet[]> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const sets = await prisma.cardSet.findMany({
			include: {
				setCards: {
					include: { card: true },
				},
			},
			orderBy: { createdAt: 'desc' },
		});
		return sets.map(set => ({
			...set,
			cardIds: set.setCards.map(sc => sc.cardId),
		}));
	}
	const db = getJsonDatabase();
	return Array.from(db.sets.values());
}

export async function createSet(set: CardSet): Promise<CardSet> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const { cardIds, ...setData } = set;
		const created = await prisma.cardSet.create({
			data: {
				...setData,
				setCards: {
					create: cardIds.map(cardId => ({
						cardId,
					})),
				},
			},
			include: {
				setCards: true,
			},
		});
		return {
			...created,
			cardIds: created.setCards.map(sc => sc.cardId),
		};
	}
	const db = getJsonDatabase();
	db.sets.set(set.id, set);
	await saveJsonDatabase();
	return set;
}

export async function updateSet(id: string, updates: Partial<CardSet>): Promise<CardSet> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const { cardIds, ...setData } = updates;
		const updateData: any = { ...setData };
		
		if (cardIds !== undefined) {
			// Update card relationships
			await prisma.setCard.deleteMany({ where: { setId: id } });
			updateData.setCards = {
				create: cardIds.map(cardId => ({ cardId })),
			};
		}
		
		const updated = await prisma.cardSet.update({
			where: { id },
			data: updateData,
			include: {
				setCards: true,
			},
		});
		return {
			...updated,
			cardIds: updated.setCards.map(sc => sc.cardId),
		};
	}
	const db = getJsonDatabase();
	const set = db.sets.get(id);
	if (!set) throw new Error('Set not found');
	const updated = { ...set, ...updates };
	db.sets.set(id, updated);
	await saveJsonDatabase();
	return updated;
}

export async function deleteSet(id: string): Promise<void> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		await prisma.cardSet.delete({ where: { id } });
		return;
	}
	const db = getJsonDatabase();
	db.sets.delete(id);
	await saveJsonDatabase();
}

// User operations
export async function getUser(id: string): Promise<UserProfile | null> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const user = await prisma.user.findUnique({
			where: { id },
			include: {
				collectionCards: true,
				collectionSets: true,
			},
		});
		if (!user) return null;
		return {
			...user,
			collectionCardIds: user.collectionCards.map(uc => uc.cardId),
			collectionSetIds: user.collectionSets.map(us => us.setId),
		};
	}
	const db = getJsonDatabase();
	return db.users.get(id) || null;
}

export async function getUserByEmail(email: string): Promise<UserProfile | null> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		// Note: Email is encrypted, so we need to search all users
		// This is a limitation - in production, consider adding a searchable hash
		const users = await prisma.user.findMany({
			include: {
				collectionCards: true,
				collectionSets: true,
			},
		});
		// Decrypt and compare (would need encryption utils)
		// For now, return null and let the auth route handle it
		return null;
	}
	const db = getJsonDatabase();
	// JSON mode uses existing decryption logic in auth routes
	return null;
}

export async function getAllUsers(): Promise<UserProfile[]> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const users = await prisma.user.findMany({
			include: {
				collectionCards: true,
				collectionSets: true,
			},
		});
		return users.map(user => ({
			...user,
			collectionCardIds: user.collectionCards.map(uc => uc.cardId),
			collectionSetIds: user.collectionSets.map(us => us.setId),
		}));
	}
	const db = getJsonDatabase();
	return Array.from(db.users.values());
}

export async function createUser(user: UserProfile): Promise<UserProfile> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const { collectionCardIds, collectionSetIds, ageVerifiedAt, ...userData } = user;
		
		// Prepare data for Prisma (handle date conversion)
		const prismaData: any = {
			...userData,
			ageVerifiedAt: ageVerifiedAt ? new Date(ageVerifiedAt) : null,
			collectionCards: {
				create: (collectionCardIds || []).map(cardId => ({ cardId })),
			},
			collectionSets: {
				create: (collectionSetIds || []).map(setId => ({ setId })),
			},
		};
		
		console.log('📝 Creating user in PostgreSQL:', user.id);
		const created = await prisma.user.create({
			data: prismaData,
			include: {
				collectionCards: true,
				collectionSets: true,
			},
		});
		console.log('✅ User created in PostgreSQL:', created.id);
		
		return {
			...created,
			ageVerifiedAt: created.ageVerifiedAt ? created.ageVerifiedAt.toISOString() : undefined,
			collectionCardIds: created.collectionCards.map(uc => uc.cardId),
			collectionSetIds: created.collectionSets.map(us => us.setId),
		};
	}
	
	console.log('📝 Creating user in JSON file:', user.id);
	const db = getJsonDatabase();
	db.users.set(user.id, user);
	await saveJsonDatabase();
	console.log('✅ User created in JSON file:', user.id);
	return user;
}

export async function updateUser(id: string, updates: Partial<UserProfile>): Promise<UserProfile> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const { collectionCardIds, collectionSetIds, ...userData } = updates;
		const updateData: any = { ...userData };
		
		if (collectionCardIds !== undefined) {
			await prisma.userCard.deleteMany({ where: { userId: id } });
			updateData.collectionCards = {
				create: collectionCardIds.map(cardId => ({ cardId })),
			};
		}
		
		if (collectionSetIds !== undefined) {
			await prisma.userSet.deleteMany({ where: { userId: id } });
			updateData.collectionSets = {
				create: collectionSetIds.map(setId => ({ setId })),
			};
		}
		
		const updated = await prisma.user.update({
			where: { id },
			data: updateData,
			include: {
				collectionCards: true,
				collectionSets: true,
			},
		});
		return {
			...updated,
			collectionCardIds: updated.collectionCards.map(uc => uc.cardId),
			collectionSetIds: updated.collectionSets.map(us => us.setId),
		};
	}
	const db = getJsonDatabase();
	const user = db.users.get(id);
	if (!user) throw new Error('User not found');
	const updated = { ...user, ...updates };
	db.users.set(id, updated);
	await saveJsonDatabase();
	return updated;
}

// Password Reset Token operations
interface PasswordResetToken {
	id: string;
	userId: string;
	token: string;
	expiresAt: string;
	createdAt: string;
}

export async function createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<PasswordResetToken> {
	const tokenId = uuid();
	const tokenRecord: PasswordResetToken = {
		id: tokenId,
		userId,
		token,
		expiresAt: expiresAt.toISOString(),
		createdAt: new Date().toISOString(),
	};

	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		// Delete existing tokens for this user
		await prisma.passwordResetToken.deleteMany({ where: { userId } });
		// Create new token
		await prisma.passwordResetToken.create({
			data: {
				id: tokenId,
				userId,
				token,
				expiresAt,
			},
		});
	} else {
		const db = getJsonDatabase();
		// Remove existing tokens for this user
		for (const [id, existingToken] of db.passwordResetTokens.entries()) {
			if (existingToken.userId === userId) {
				db.passwordResetTokens.delete(id);
			}
		}
		db.passwordResetTokens.set(tokenId, tokenRecord);
		await saveJsonDatabase();
	}

	return tokenRecord;
}

export async function findPasswordResetToken(token: string): Promise<PasswordResetToken | null> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const tokenRecord = await prisma.passwordResetToken.findUnique({
			where: { token },
		});
		if (!tokenRecord) return null;
		return {
			id: tokenRecord.id,
			userId: tokenRecord.userId,
			token: tokenRecord.token,
			expiresAt: tokenRecord.expiresAt.toISOString(),
			createdAt: tokenRecord.createdAt.toISOString(),
		};
	} else {
		const db = getJsonDatabase();
		for (const t of db.passwordResetTokens.values()) {
			if (t.token === token) {
				return t;
			}
		}
		return null;
	}
}

export async function deletePasswordResetToken(tokenId: string): Promise<void> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		await prisma.passwordResetToken.delete({ where: { id: tokenId } }).catch(() => {
			// Token might not exist, ignore
		});
	} else {
		const db = getJsonDatabase();
		db.passwordResetTokens.delete(tokenId);
		await saveJsonDatabase();
	}
}

export async function deletePasswordResetTokenByToken(token: string): Promise<void> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		await prisma.passwordResetToken.deleteMany({ where: { token } });
	} else {
		const db = getJsonDatabase();
		for (const [id, t] of db.passwordResetTokens.entries()) {
			if (t.token === token) {
				db.passwordResetTokens.delete(id);
				break;
			}
		}
		await saveJsonDatabase();
	}
}

// Character operations
export async function getCharacter(id: string): Promise<Character | null> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const character = await prisma.character.findUnique({ where: { id } });
		return character;
	}
	const db = getJsonDatabase();
	return db.characters.get(id) || null;
}

export async function getAllCharacters(): Promise<Character[]> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		return await prisma.character.findMany();
	}
	const db = getJsonDatabase();
	return Array.from(db.characters.values());
}

export async function createCharacter(character: Character): Promise<Character> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		return await prisma.character.create({ data: character });
	}
	const db = getJsonDatabase();
	db.characters.set(character.id, character);
	await saveJsonDatabase();
	return character;
}

export async function updateCharacter(id: string, updates: Partial<Character>): Promise<Character> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		return await prisma.character.update({ where: { id }, data: updates });
	}
	const db = getJsonDatabase();
	const character = db.characters.get(id);
	if (!character) throw new Error('Character not found');
	const updated = { ...character, ...updates };
	db.characters.set(id, updated);
	await saveJsonDatabase();
	return updated;
}

// Trade operations
export async function getTrade(id: string): Promise<TradeProposal | null> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const trade = await prisma.tradeProposal.findUnique({ where: { id } });
		if (!trade) return null;
		return {
			...trade,
			createdAt: trade.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	return db.trades.get(id) || null;
}

export async function getAllTrades(): Promise<TradeProposal[]> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const trades = await prisma.tradeProposal.findMany({
			orderBy: { createdAt: 'desc' },
		});
		return trades.map(t => ({
			...t,
			createdAt: t.createdAt.toISOString(),
		}));
	}
	const db = getJsonDatabase();
	return Array.from(db.trades.values());
}

export async function createTrade(trade: TradeProposal): Promise<TradeProposal> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const created = await prisma.tradeProposal.create({
			data: {
				...trade,
				createdAt: new Date(trade.createdAt),
			},
		});
		return {
			...created,
			createdAt: created.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	db.trades.set(trade.id, trade);
	await saveJsonDatabase();
	return trade;
}

export async function updateTrade(id: string, updates: Partial<TradeProposal>): Promise<TradeProposal> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const updateData: any = { ...updates };
		if (updates.createdAt) {
			updateData.createdAt = new Date(updates.createdAt);
		}
		const updated = await prisma.tradeProposal.update({
			where: { id },
			data: updateData,
		});
		return {
			...updated,
			createdAt: updated.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	const trade = db.trades.get(id);
	if (!trade) throw new Error('Trade not found');
	const updated = { ...trade, ...updates };
	db.trades.set(id, updated);
	await saveJsonDatabase();
	return updated;
}

// Message operations
export async function getMessage(id: string): Promise<Message | null> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const message = await prisma.message.findUnique({ where: { id } });
		if (!message) return null;
		return {
			...message,
			createdAt: message.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	return db.messages.get(id) || null;
}

export async function getAllMessages(): Promise<Message[]> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const messages = await prisma.message.findMany({
			orderBy: { createdAt: 'desc' },
		});
		return messages.map(m => ({
			...m,
			createdAt: m.createdAt.toISOString(),
		}));
	}
	const db = getJsonDatabase();
	return Array.from(db.messages.values());
}

export async function createMessage(message: Message): Promise<Message> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const created = await prisma.message.create({
			data: {
				...message,
				createdAt: new Date(message.createdAt),
			},
		});
		return {
			...created,
			createdAt: created.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	db.messages.set(message.id, message);
	await saveJsonDatabase();
	return message;
}

export async function updateMessage(id: string, updates: Partial<Message>): Promise<Message> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const updateData: any = { ...updates };
		if (updates.createdAt) {
			updateData.createdAt = new Date(updates.createdAt);
		}
		const updated = await prisma.message.update({
			where: { id },
			data: updateData,
		});
		return {
			...updated,
			createdAt: updated.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	const message = db.messages.get(id);
	if (!message) throw new Error('Message not found');
	const updated = { ...message, ...updates };
	db.messages.set(id, updated);
	await saveJsonDatabase();
	return updated;
}

// Notification operations
export async function getNotification(id: string): Promise<Notification | null> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const notification = await prisma.notification.findUnique({ where: { id } });
		if (!notification) return null;
		return {
			...notification,
			createdAt: notification.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	return db.notifications.get(id) || null;
}

export async function getAllNotifications(): Promise<Notification[]> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const notifications = await prisma.notification.findMany({
			orderBy: { createdAt: 'desc' },
		});
		return notifications.map(n => ({
			...n,
			createdAt: n.createdAt.toISOString(),
		}));
	}
	const db = getJsonDatabase();
	return Array.from(db.notifications.values());
}

export async function createNotification(notification: Notification): Promise<Notification> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const created = await prisma.notification.create({
			data: {
				...notification,
				createdAt: new Date(notification.createdAt),
			},
		});
		return {
			...created,
			createdAt: created.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	db.notifications.set(notification.id, notification);
	await saveJsonDatabase();
	return notification;
}

export async function updateNotification(id: string, updates: Partial<Notification>): Promise<Notification> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const updateData: any = { ...updates };
		if (updates.createdAt) {
			updateData.createdAt = new Date(updates.createdAt);
		}
		const updated = await prisma.notification.update({
			where: { id },
			data: updateData,
		});
		return {
			...updated,
			createdAt: updated.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	const notification = db.notifications.get(id);
	if (!notification) throw new Error('Notification not found');
	const updated = { ...notification, ...updates };
	db.notifications.set(id, updated);
	await saveJsonDatabase();
	return updated;
}

export async function deleteNotification(id: string): Promise<void> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		await prisma.notification.delete({ where: { id } });
		return;
	}
	const db = getJsonDatabase();
	db.notifications.delete(id);
	await saveJsonDatabase();
}

// SavedChat operations
export async function getSavedChat(id: string): Promise<SavedChat | null> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const chat = await prisma.savedChat.findUnique({ where: { id } });
		if (!chat) return null;
		return {
			...chat,
			createdAt: chat.createdAt.toISOString(),
			updatedAt: chat.updatedAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	return db.savedChats.get(id) || null;
}

export async function getAllSavedChats(): Promise<SavedChat[]> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const chats = await prisma.savedChat.findMany({
			orderBy: { updatedAt: 'desc' },
		});
		return chats.map(c => ({
			...c,
			createdAt: c.createdAt.toISOString(),
			updatedAt: c.updatedAt.toISOString(),
		}));
	}
	const db = getJsonDatabase();
	return Array.from(db.savedChats.values());
}

export async function createSavedChat(chat: SavedChat): Promise<SavedChat> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const created = await prisma.savedChat.create({
			data: {
				...chat,
				createdAt: new Date(chat.createdAt),
				updatedAt: new Date(chat.updatedAt),
			},
		});
		return {
			...created,
			createdAt: created.createdAt.toISOString(),
			updatedAt: created.updatedAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	db.savedChats.set(chat.id, chat);
	await saveJsonDatabase();
	return chat;
}

export async function updateSavedChat(id: string, updates: Partial<SavedChat>): Promise<SavedChat> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const updateData: any = { ...updates };
		if (updates.createdAt) {
			updateData.createdAt = new Date(updates.createdAt);
		}
		if (updates.updatedAt) {
			updateData.updatedAt = new Date(updates.updatedAt);
		}
		const updated = await prisma.savedChat.update({
			where: { id },
			data: updateData,
		});
		return {
			...updated,
			createdAt: updated.createdAt.toISOString(),
			updatedAt: updated.updatedAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	const chat = db.savedChats.get(id);
	if (!chat) throw new Error('Saved chat not found');
	const updated = { ...chat, ...updates };
	db.savedChats.set(id, updated);
	await saveJsonDatabase();
	return updated;
}

export async function deleteSavedChat(id: string): Promise<void> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		await prisma.savedChat.delete({ where: { id } });
		return;
	}
	const db = getJsonDatabase();
	db.savedChats.delete(id);
	await saveJsonDatabase();
}

// FriendRequest operations
export async function getFriendRequest(id: string): Promise<FriendRequest | null> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const request = await prisma.friendRequest.findUnique({ where: { id } });
		if (!request) return null;
		return {
			...request,
			createdAt: request.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	return db.friendRequests.get(id) || null;
}

export async function getAllFriendRequests(): Promise<FriendRequest[]> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const requests = await prisma.friendRequest.findMany({
			orderBy: { createdAt: 'desc' },
		});
		return requests.map(r => ({
			...r,
			createdAt: r.createdAt.toISOString(),
		}));
	}
	const db = getJsonDatabase();
	return Array.from(db.friendRequests.values());
}

export async function createFriendRequest(request: FriendRequest): Promise<FriendRequest> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const created = await prisma.friendRequest.create({
			data: {
				...request,
				createdAt: new Date(request.createdAt),
			},
		});
		return {
			...created,
			createdAt: created.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	db.friendRequests.set(request.id, request);
	await saveJsonDatabase();
	return request;
}

export async function updateFriendRequest(id: string, updates: Partial<FriendRequest>): Promise<FriendRequest> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const updateData: any = { ...updates };
		if (updates.createdAt) {
			updateData.createdAt = new Date(updates.createdAt);
		}
		const updated = await prisma.friendRequest.update({
			where: { id },
			data: updateData,
		});
		return {
			...updated,
			createdAt: updated.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	const request = db.friendRequests.get(id);
	if (!request) throw new Error('Friend request not found');
	const updated = { ...request, ...updates };
	db.friendRequests.set(id, updated);
	await saveJsonDatabase();
	return updated;
}

export async function deleteFriendRequest(id: string): Promise<void> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		await prisma.friendRequest.delete({ where: { id } });
		return;
	}
	const db = getJsonDatabase();
	db.friendRequests.delete(id);
	await saveJsonDatabase();
}

// UserReport operations
export async function getUserReport(id: string): Promise<UserReport | null> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const report = await prisma.userReport.findUnique({ where: { id } });
		if (!report) return null;
		return {
			...report,
			createdAt: report.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	return db.reports.get(id) || null;
}

export async function getAllUserReports(): Promise<UserReport[]> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const reports = await prisma.userReport.findMany({
			orderBy: { createdAt: 'desc' },
		});
		return reports.map(r => ({
			...r,
			createdAt: r.createdAt.toISOString(),
		}));
	}
	const db = getJsonDatabase();
	return Array.from(db.reports.values());
}

export async function createUserReport(report: UserReport): Promise<UserReport> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const created = await prisma.userReport.create({
			data: {
				...report,
				createdAt: new Date(report.createdAt),
			},
		});
		return {
			...created,
			createdAt: created.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	db.reports.set(report.id, report);
	await saveJsonDatabase();
	return report;
}

export async function updateUserReport(id: string, updates: Partial<UserReport>): Promise<UserReport> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		const updateData: any = { ...updates };
		if (updates.createdAt) {
			updateData.createdAt = new Date(updates.createdAt);
		}
		const updated = await prisma.userReport.update({
			where: { id },
			data: updateData,
		});
		return {
			...updated,
			createdAt: updated.createdAt.toISOString(),
		};
	}
	const db = getJsonDatabase();
	const report = db.reports.get(id);
	if (!report) throw new Error('User report not found');
	const updated = { ...report, ...updates };
	db.reports.set(id, updated);
	await saveJsonDatabase();
	return updated;
}

// Initialize database (loads JSON or connects to Prisma)
export async function initializeDatabase(): Promise<void> {
	if (getDatabaseMode() === 'prisma') {
		const prisma = getPrismaClient()!;
		// Test connection
		await prisma.$connect();
		console.log('✅ Connected to PostgreSQL database');
	} else {
		await loadJsonDatabase();
		console.log('✅ Loaded JSON file database');
	}
}

