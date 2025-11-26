import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Card, CardSet, UserProfile, TradeProposal, Character, Message, UserReport, Notification, SavedChat, FriendRequest } from '../types.js';
import { v4 as uuid } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use data directory relative to project root (one level up from server/)
const DATA_DIR = path.join(__dirname, '../../data');
const CARDS_FILE = path.join(DATA_DIR, 'cards.json');
const SETS_FILE = path.join(DATA_DIR, 'sets.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TRADES_FILE = path.join(DATA_DIR, 'trades.json');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');
const SAVED_CHATS_FILE = path.join(DATA_DIR, 'savedChats.json');
const PASSWORD_RESET_TOKENS_FILE = path.join(DATA_DIR, 'passwordResetTokens.json');
const FRIEND_REQUESTS_FILE = path.join(DATA_DIR, 'friendRequests.json');

interface PasswordResetToken {
	id: string;
	userId: string;
	token: string;
	expiresAt: string;
	createdAt: string;
}

interface Database {
	cards: Map<string, Card>;
	sets: Map<string, CardSet>;
	users: Map<string, UserProfile>;
	trades: Map<string, TradeProposal>;
	characters: Map<string, Character>;
	messages: Map<string, Message>;
	reports: Map<string, UserReport>;
	notifications: Map<string, Notification>;
	savedChats: Map<string, SavedChat>;
	passwordResetTokens: Map<string, PasswordResetToken>;
	friendRequests: Map<string, FriendRequest>;
}

let db: Database = {
	cards: new Map(),
	sets: new Map(),
	users: new Map(),
	trades: new Map(),
	characters: new Map(),
	messages: new Map(),
	reports: new Map(),
	notifications: new Map(),
	savedChats: new Map(),
	passwordResetTokens: new Map(),
	friendRequests: new Map(),
};

async function ensureDataDir() {
	try {
		await fs.mkdir(DATA_DIR, { recursive: true });
	} catch (err) {
		// Directory already exists
	}
}

async function loadFile<T extends { id: string }>(filePath: string, defaultValue: T[]): Promise<Map<string, T>> {
	try {
		const data = await fs.readFile(filePath, 'utf-8');
		const items = JSON.parse(data) as T[];
		const map = new Map<string, T>();
		for (const item of items) {
			if (item && typeof item === 'object' && 'id' in item) {
				map.set(item.id, item);
			}
		}
		return map;
	} catch (err) {
		return new Map();
	}
}

async function saveFile<T>(filePath: string, map: Map<string, T>): Promise<void> {
	const items = Array.from(map.values());
	await fs.writeFile(filePath, JSON.stringify(items, null, 2), 'utf-8');
}

export async function loadDatabase() {
	await ensureDataDir();
	db.cards = await loadFile<Card>(CARDS_FILE, []);
	db.sets = await loadFile<CardSet>(SETS_FILE, []);
	db.users = await loadFile<UserProfile>(USERS_FILE, []);
	db.trades = await loadFile<TradeProposal>(TRADES_FILE, []);
	db.characters = await loadFile<Character>(CHARACTERS_FILE, []);
	db.messages = await loadFile<Message>(MESSAGES_FILE, []);
	db.reports = await loadFile<UserReport>(REPORTS_FILE, []);
	db.notifications = await loadFile<Notification>(NOTIFICATIONS_FILE, []);
	db.savedChats = await loadFile<SavedChat>(SAVED_CHATS_FILE, []);
	db.passwordResetTokens = await loadFile<PasswordResetToken>(PASSWORD_RESET_TOKENS_FILE, []);
	db.friendRequests = await loadFile<FriendRequest>(FRIEND_REQUESTS_FILE, []);
	
	console.log(`📦 Loaded ${db.cards.size} cards, ${db.sets.size} sets, ${db.users.size} users, ${db.trades.size} trades, ${db.characters.size} characters, ${db.messages.size} messages, ${db.reports.size} reports, ${db.notifications.size} notifications, ${db.savedChats.size} saved chats, ${db.friendRequests.size} friend requests`);
	if (db.cards.size > 0) {
		const sampleCard = Array.from(db.cards.values())[0];
		console.log(`📸 Sample card URL format: ${sampleCard.imageUrl.substring(0, 60)}...`);
	}
	if (db.sets.size > 0) {
		const sampleSet = Array.from(db.sets.values())[0];
		console.log(`📸 Sample set URL format: ${sampleSet.imageUrl.substring(0, 60)}...`);
	}

	// Migrate existing users to add followingIds, friendIds, and friendRequestIds if missing
	let migratedUsers = 0;
	for (const [userId, user] of db.users.entries()) {
		let updated = false;
		if (!user.followingIds) {
			user.followingIds = [];
			updated = true;
		}
		if (!user.friendIds) {
			user.friendIds = [];
			updated = true;
		}
		if (!user.friendRequestIds) {
			user.friendRequestIds = [];
			updated = true;
		}
		if (updated) {
			db.users.set(userId, user);
			migratedUsers++;
		}
	}
	if (migratedUsers > 0) {
		console.log(`🔄 Migrated ${migratedUsers} user(s) to include followingIds, friendIds, and friendRequestIds`);
		await saveDatabase();
	}

	// Migrate existing cards to $3 minimum if they're less than $3
	let migratedPrices = 0;
	for (const [cardId, card] of db.cards.entries()) {
		if (card.cost < 3) {
			card.cost = 3;
			db.cards.set(cardId, card);
			migratedPrices++;
		}
	}
	if (migratedPrices > 0) {
		console.log(`🔄 Migrated ${migratedPrices} card(s) to minimum $3 price`);
		await saveDatabase();
	}

	// Set cover images for specific collections
	let coverImagesSet = 0;
	for (const [setId, set] of db.sets.entries()) {
		// Alerra collection: use "Alerra - 2" as cover
		if (set.character === 'Alerra' && !set.coverImageUrl) {
			const alerraCard2 = Array.from(db.cards.values()).find(
				c => c.character === 'Alerra' && c.title === 'Alerra - 2'
			);
			if (alerraCard2) {
				set.coverImageUrl = alerraCard2.imageUrl;
				db.sets.set(setId, set);
				coverImagesSet++;
			}
		}
		// Elonna collection: use "Elonna - 3" as cover
		if (set.character === 'Elonna' && !set.coverImageUrl) {
			const elonnaCard3 = Array.from(db.cards.values()).find(
				c => c.character === 'Elonna' && c.title === 'Elonna - 3'
			);
			if (elonnaCard3) {
				set.coverImageUrl = elonnaCard3.imageUrl;
				db.sets.set(setId, set);
				coverImagesSet++;
			}
		}
	}
	if (coverImagesSet > 0) {
		console.log(`🖼️  Set cover images for ${coverImagesSet} collection(s)`);
		await saveDatabase();
	}

	// Grant admin access to user with email "cappellacoding@gmail.com"
	let adminGranted = 0;
	for (const [userId, user] of db.users.entries()) {
		try {
			const { decryptMessage } = await import('../utils/encryption.js');
			const { isUserAdmin, encryptIsAdmin } = await import('../utils/userHelpers.js');
			const decryptedEmail = decryptMessage(user.email);
			if (decryptedEmail.toLowerCase() === 'cappellacoding@gmail.com' && !isUserAdmin(user)) {
				user.isAdmin = encryptIsAdmin(true);
				db.users.set(userId, user);
				adminGranted++;
			}
		} catch {
			// If decryption fails, try IV-based comparison
			try {
				const { encryptMessageWithIV } = await import('../utils/encryption.js');
				const { isUserAdmin, encryptIsAdmin } = await import('../utils/userHelpers.js');
				if (user.email.includes(':')) {
					const [ivHex] = user.email.split(':');
					const iv = Buffer.from(ivHex, 'hex');
					const encryptedInput = encryptMessageWithIV('cappellacoding@gmail.com', iv);
					if (encryptedInput === user.email && !isUserAdmin(user)) {
						user.isAdmin = encryptIsAdmin(true);
						db.users.set(userId, user);
						adminGranted++;
					}
				}
			} catch {}
		}
	}
	if (adminGranted > 0) {
		console.log(`👑 Granted admin access to ${adminGranted} user(s) with email cappellacoding@gmail.com`);
		await saveDatabase();
	}

	// Initialize characters from cards and sets
	const characterNames = new Set<string>();
	for (const card of db.cards.values()) {
		if (card.character) {
			characterNames.add(card.character);
		}
	}
	for (const set of db.sets.values()) {
		if (set.character) {
			characterNames.add(set.character);
		}
	}

	// Create character entries for any missing characters
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
		}
	}
	if (charactersCreated > 0) {
		console.log(`👤 Created ${charactersCreated} character(s) from cards and sets`);
		await saveDatabase();
	}
}

export async function saveDatabase() {
	await Promise.all([
		saveFile(CARDS_FILE, db.cards),
		saveFile(SETS_FILE, db.sets),
		saveFile(USERS_FILE, db.users),
		saveFile(TRADES_FILE, db.trades),
		saveFile(CHARACTERS_FILE, db.characters),
		saveFile(MESSAGES_FILE, db.messages),
		saveFile(REPORTS_FILE, db.reports),
		saveFile(NOTIFICATIONS_FILE, db.notifications),
		saveFile(SAVED_CHATS_FILE, db.savedChats),
		saveFile(PASSWORD_RESET_TOKENS_FILE, db.passwordResetTokens),
		saveFile(FRIEND_REQUESTS_FILE, db.friendRequests),
	]);
}

export function getDatabase(): Database {
	return db;
}

