/**
 * Migration Script: JSON Files → PostgreSQL
 * 
 * This script migrates all data from JSON files to PostgreSQL database.
 * Run this once after setting up your PostgreSQL database.
 * 
 * Usage:
 *   npm run db:migrate  # First, create the database schema
 *   tsx scripts/migrateJsonToPostgres.ts  # Then, migrate the data
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Card, CardSet, UserProfile, TradeProposal, Character, Message, UserReport, Notification, SavedChat, FriendRequest } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');

const prisma = new PrismaClient();

interface PasswordResetToken {
	id: string;
	userId: string;
	token: string;
	expiresAt: string;
	createdAt: string;
}

async function loadJsonFile<T>(filename: string): Promise<T[]> {
	try {
		const filePath = path.join(DATA_DIR, filename);
		const data = await fs.readFile(filePath, 'utf-8');
		return JSON.parse(data) as T[];
	} catch (error) {
		console.warn(`⚠️  Could not load ${filename}:`, error);
		return [];
	}
}

async function migrateCards() {
	console.log('📦 Migrating cards...');
	const cards = await loadJsonFile<Card>('cards.json');
	
	for (const card of cards) {
		try {
			await prisma.card.upsert({
				where: { id: card.id },
				update: {
					imageUrl: card.imageUrl,
					title: card.title,
					description: card.description,
					type: card.type,
					cost: card.cost,
					character: card.character,
					attributes: card.attributes as any,
				},
				create: {
					id: card.id,
					imageUrl: card.imageUrl,
					title: card.title,
					description: card.description,
					type: card.type,
					cost: card.cost,
					character: card.character,
					attributes: card.attributes as any,
				},
			});
		} catch (error) {
			console.error(`❌ Error migrating card ${card.id}:`, error);
		}
	}
	
	console.log(`✅ Migrated ${cards.length} cards`);
}

async function migrateSets() {
	console.log('📦 Migrating sets...');
	const sets = await loadJsonFile<CardSet>('sets.json');
	
	for (const set of sets) {
		try {
			// Filter out card IDs that don't exist
			const validCardIds = [];
			for (const cardId of set.cardIds || []) {
				const cardExists = await prisma.card.findUnique({ where: { id: cardId } });
				if (cardExists) {
					validCardIds.push(cardId);
				} else {
					console.warn(`⚠️  Set ${set.id} references non-existent card ${cardId}, skipping`);
				}
			}
			
			await prisma.cardSet.upsert({
				where: { id: set.id },
				update: {
					name: set.name,
					description: set.description,
					imageUrl: set.imageUrl,
					coverImageUrl: set.coverImageUrl,
					cost: set.cost,
					costPerCard: set.costPerCard,
					type: set.type,
					mana: set.mana,
					character: set.character,
					setCards: {
						deleteMany: {},
						create: validCardIds.map(cardId => ({ cardId })),
					},
				},
				create: {
					id: set.id,
					name: set.name,
					description: set.description,
					imageUrl: set.imageUrl,
					coverImageUrl: set.coverImageUrl,
					cost: set.cost,
					costPerCard: set.costPerCard,
					type: set.type,
					mana: set.mana,
					character: set.character,
					setCards: {
						create: validCardIds.map(cardId => ({ cardId })),
					},
				},
			});
		} catch (error) {
			console.error(`❌ Error migrating set ${set.id}:`, error);
		}
	}
	
	console.log(`✅ Migrated ${sets.length} sets`);
}

async function migrateUsers() {
	console.log('📦 Migrating users...');
	const users = await loadJsonFile<UserProfile>('users.json');
	
	for (const user of users) {
		try {
			// Filter out card IDs that don't exist
			const validCardIds = [];
			for (const cardId of user.collectionCardIds || []) {
				const cardExists = await prisma.card.findUnique({ where: { id: cardId } });
				if (cardExists) {
					validCardIds.push(cardId);
				} else {
					console.warn(`⚠️  User ${user.id} references non-existent card ${cardId}, skipping`);
				}
			}
			
			// Filter out set IDs that don't exist
			const validSetIds = [];
			for (const setId of user.collectionSetIds || []) {
				const setExists = await prisma.cardSet.findUnique({ where: { id: setId } });
				if (setExists) {
					validSetIds.push(setId);
				} else {
					console.warn(`⚠️  User ${user.id} references non-existent set ${setId}, skipping`);
				}
			}
			
			await prisma.user.upsert({
				where: { id: user.id },
				update: {
					email: user.email,
					username: user.username,
					passwordHash: user.passwordHash,
					profileImageUrl: user.profileImageUrl,
					bio: user.bio,
					interests: user.interests,
					location: user.location,
					website: user.website,
					ageVerifiedAt: user.ageVerifiedAt ? new Date(user.ageVerifiedAt) : null,
					isAdmin: user.isAdmin,
					manaReloadTokens: user.manaReloadTokens || 0,
					manaIncreaseTokens: user.manaIncreaseTokens || 0,
					lastLoginDate: user.lastLoginDate,
					followingIds: user.followingIds || [],
					friendIds: user.friendIds || [],
					friendRequestIds: user.friendRequestIds || [],
					collectionCards: {
						deleteMany: {},
						create: validCardIds.map(cardId => ({ cardId })),
					},
					collectionSets: {
						deleteMany: {},
						create: validSetIds.map(setId => ({ setId })),
					},
				},
				create: {
					id: user.id,
					email: user.email,
					username: user.username,
					passwordHash: user.passwordHash,
					profileImageUrl: user.profileImageUrl,
					bio: user.bio,
					interests: user.interests,
					location: user.location,
					website: user.website,
					ageVerifiedAt: user.ageVerifiedAt ? new Date(user.ageVerifiedAt) : null,
					isAdmin: user.isAdmin,
					manaReloadTokens: user.manaReloadTokens || 0,
					manaIncreaseTokens: user.manaIncreaseTokens || 0,
					lastLoginDate: user.lastLoginDate,
					followingIds: user.followingIds || [],
					friendIds: user.friendIds || [],
					friendRequestIds: user.friendRequestIds || [],
					collectionCards: {
						create: validCardIds.map(cardId => ({ cardId })),
					},
					collectionSets: {
						create: validSetIds.map(setId => ({ setId })),
					},
				},
			});
		} catch (error) {
			console.error(`❌ Error migrating user ${user.id}:`, error);
		}
	}
	
	console.log(`✅ Migrated ${users.length} users`);
}

async function migrateCharacters() {
	console.log('📦 Migrating characters...');
	const characters = await loadJsonFile<Character>('characters.json');
	
	for (const char of characters) {
		try {
			await prisma.character.upsert({
				where: { id: char.id },
				update: {
					name: char.name,
					coverImageUrl: char.coverImageUrl,
					description: char.description,
				},
				create: {
					id: char.id,
					name: char.name,
					coverImageUrl: char.coverImageUrl,
					description: char.description,
				},
			});
		} catch (error) {
			console.error(`❌ Error migrating character ${char.id}:`, error);
		}
	}
	
	console.log(`✅ Migrated ${characters.length} characters`);
}

async function migrateTrades() {
	console.log('📦 Migrating trades...');
	const trades = await loadJsonFile<TradeProposal>('trades.json');
	
	for (const trade of trades) {
		try {
			// Check if referenced users and cards exist
			const fromUser = await prisma.user.findUnique({ where: { id: trade.fromUserId } });
			const toUser = await prisma.user.findUnique({ where: { id: trade.toUserId } });
			const cardOffered = await prisma.card.findUnique({ where: { id: trade.cardOfferedId } });
			const cardRequested = await prisma.card.findUnique({ where: { id: trade.cardRequestedId } });
			
			if (!fromUser || !toUser || !cardOffered || !cardRequested) {
				console.warn(`⚠️  Trade ${trade.id} references non-existent entities, skipping`);
				continue;
			}
			
			await prisma.tradeProposal.upsert({
				where: { id: trade.id },
				update: {
					fromUserId: trade.fromUserId,
					toUserId: trade.toUserId,
					cardOfferedId: trade.cardOfferedId,
					cardRequestedId: trade.cardRequestedId,
					status: trade.status,
					createdAt: new Date(trade.createdAt),
				},
				create: {
					id: trade.id,
					fromUserId: trade.fromUserId,
					toUserId: trade.toUserId,
					cardOfferedId: trade.cardOfferedId,
					cardRequestedId: trade.cardRequestedId,
					status: trade.status,
					createdAt: new Date(trade.createdAt),
				},
			});
		} catch (error) {
			console.error(`❌ Error migrating trade ${trade.id}:`, error);
		}
	}
	
	console.log(`✅ Migrated ${trades.length} trades`);
}

async function migrateMessages() {
	console.log('📦 Migrating messages...');
	const messages = await loadJsonFile<Message>('messages.json');
	
	for (const message of messages) {
		try {
			// Check if referenced users exist
			const fromUser = await prisma.user.findUnique({ where: { id: message.fromUserId } });
			const toUser = await prisma.user.findUnique({ where: { id: message.toUserId } });
			
			if (!fromUser || !toUser) {
				console.warn(`⚠️  Message ${message.id} references non-existent users, skipping`);
				continue;
			}
			
			await prisma.message.upsert({
				where: { id: message.id },
				update: {
					fromUserId: message.fromUserId,
					toUserId: message.toUserId,
					encryptedContent: message.encryptedContent,
					read: message.read,
					createdAt: new Date(message.createdAt),
				},
				create: {
					id: message.id,
					fromUserId: message.fromUserId,
					toUserId: message.toUserId,
					encryptedContent: message.encryptedContent,
					read: message.read,
					createdAt: new Date(message.createdAt),
				},
			});
		} catch (error) {
			console.error(`❌ Error migrating message ${message.id}:`, error);
		}
	}
	
	console.log(`✅ Migrated ${messages.length} messages`);
}

async function migrateReports() {
	console.log('📦 Migrating reports...');
	const reports = await loadJsonFile<UserReport>('reports.json');
	
	for (const report of reports) {
		try {
			await prisma.userReport.upsert({
				where: { id: report.id },
				update: {
					reportedUserId: report.reportedUserId,
					reporterUserId: report.reporterUserId,
					reason: report.reason,
					status: report.status,
					adminNotes: report.adminNotes,
					createdAt: new Date(report.createdAt),
				},
				create: {
					id: report.id,
					reportedUserId: report.reportedUserId,
					reporterUserId: report.reporterUserId,
					reason: report.reason,
					status: report.status,
					adminNotes: report.adminNotes,
					createdAt: new Date(report.createdAt),
				},
			});
		} catch (error) {
			console.error(`❌ Error migrating report ${report.id}:`, error);
		}
	}
	
	console.log(`✅ Migrated ${reports.length} reports`);
}

async function migrateNotifications() {
	console.log('📦 Migrating notifications...');
	const notifications = await loadJsonFile<Notification>('notifications.json');
	
	for (const notification of notifications) {
		try {
			// Check if referenced user exists
			const user = await prisma.user.findUnique({ where: { id: notification.userId } });
			
			if (!user) {
				console.warn(`⚠️  Notification ${notification.id} references non-existent user, skipping`);
				continue;
			}
			
			await prisma.notification.upsert({
				where: { id: notification.id },
				update: {
					userId: notification.userId,
					type: notification.type,
					title: notification.title,
					message: notification.message,
					read: notification.read,
					relatedId: notification.relatedId,
					fromUserId: notification.fromUserId,
					createdAt: new Date(notification.createdAt),
				},
				create: {
					id: notification.id,
					userId: notification.userId,
					type: notification.type,
					title: notification.title,
					message: notification.message,
					read: notification.read,
					relatedId: notification.relatedId,
					fromUserId: notification.fromUserId,
					createdAt: new Date(notification.createdAt),
				},
			});
		} catch (error) {
			console.error(`❌ Error migrating notification ${notification.id}:`, error);
		}
	}
	
	console.log(`✅ Migrated ${notifications.length} notifications`);
}

async function migrateSavedChats() {
	console.log('📦 Migrating saved chats...');
	const savedChats = await loadJsonFile<SavedChat>('savedChats.json');
	
	for (const chat of savedChats) {
		try {
			await prisma.savedChat.upsert({
				where: { id: chat.id },
				update: {
					userId: chat.userId,
					cardId: chat.cardId,
					characterName: chat.characterName,
					cardTitle: chat.cardTitle,
					encryptedMessages: chat.encryptedMessages,
					createdAt: new Date(chat.createdAt),
					updatedAt: new Date(chat.updatedAt),
				},
				create: {
					id: chat.id,
					userId: chat.userId,
					cardId: chat.cardId,
					characterName: chat.characterName,
					cardTitle: chat.cardTitle,
					encryptedMessages: chat.encryptedMessages,
					createdAt: new Date(chat.createdAt),
					updatedAt: new Date(chat.updatedAt),
				},
			});
		} catch (error) {
			console.error(`❌ Error migrating saved chat ${chat.id}:`, error);
		}
	}
	
	console.log(`✅ Migrated ${savedChats.length} saved chats`);
}

async function migrateFriendRequests() {
	console.log('📦 Migrating friend requests...');
	const friendRequests = await loadJsonFile<FriendRequest>('friendRequests.json');
	
	for (const request of friendRequests) {
		try {
			// Check if referenced users exist
			const fromUser = await prisma.user.findUnique({ where: { id: request.fromUserId } });
			const toUser = await prisma.user.findUnique({ where: { id: request.toUserId } });
			
			if (!fromUser || !toUser) {
				console.warn(`⚠️  Friend request ${request.id} references non-existent users, skipping`);
				continue;
			}
			
			await prisma.friendRequest.upsert({
				where: { id: request.id },
				update: {
					fromUserId: request.fromUserId,
					toUserId: request.toUserId,
					status: request.status,
					createdAt: new Date(request.createdAt),
				},
				create: {
					id: request.id,
					fromUserId: request.fromUserId,
					toUserId: request.toUserId,
					status: request.status,
					createdAt: new Date(request.createdAt),
				},
			});
		} catch (error) {
			console.error(`❌ Error migrating friend request ${request.id}:`, error);
		}
	}
	
	console.log(`✅ Migrated ${friendRequests.length} friend requests`);
}

async function migratePasswordResetTokens() {
	console.log('📦 Migrating password reset tokens...');
	const tokens = await loadJsonFile<PasswordResetToken>('passwordResetTokens.json');
	
	for (const token of tokens) {
		try {
			await prisma.passwordResetToken.upsert({
				where: { id: token.id },
				update: {
					userId: token.userId,
					token: token.token,
					expiresAt: new Date(token.expiresAt),
					createdAt: new Date(token.createdAt),
				},
				create: {
					id: token.id,
					userId: token.userId,
					token: token.token,
					expiresAt: new Date(token.expiresAt),
					createdAt: new Date(token.createdAt),
				},
			});
		} catch (error) {
			console.error(`❌ Error migrating password reset token ${token.id}:`, error);
		}
	}
	
	console.log(`✅ Migrated ${tokens.length} password reset tokens`);
}

async function main() {
	console.log('🚀 Starting migration from JSON to PostgreSQL...\n');
	
	if (!process.env.DATABASE_URL) {
		console.error('❌ DATABASE_URL environment variable is not set!');
		console.error('Please set DATABASE_URL in your .env file before running migration.');
		process.exit(1);
	}
	
	try {
		// Test connection
		await prisma.$connect();
		console.log('✅ Connected to PostgreSQL database\n');
		
		// Run migrations in order
		await migrateCards();
		await migrateSets();
		await migrateCharacters();
		await migrateUsers();
		await migrateTrades();
		await migrateMessages();
		await migrateReports();
		await migrateNotifications();
		await migrateSavedChats();
		await migrateFriendRequests();
		await migratePasswordResetTokens();
		
		console.log('\n✅ Migration completed successfully!');
		console.log('📝 You can now set USE_PRISMA=true in your .env to use PostgreSQL');
	} catch (error) {
		console.error('❌ Migration failed:', error);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

main();

