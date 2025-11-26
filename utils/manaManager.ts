import { getDatabase, saveDatabase } from '../data/database.js';
import { Card } from '../types.js';

// Track last mana recharge date per card
// Format: { cardId: { lastRechargeDate: 'YYYY-MM-DD', currentMana: number } }
interface ManaState {
	[cardId: string]: {
		lastRechargeDate: string;
		currentMana: number;
	};
}

// Get today's date in YYYY-MM-DD format
function getTodayDate(): string {
	const now = new Date();
	return now.toISOString().split('T')[0];
}

// Recharge mana for a card if it's a new day
export async function rechargeManaIfNeeded(cardId: string, baseOverride?: number): Promise<number> {
	const db = getDatabase();
	const card = db.cards.get(cardId);
	
	if (!card) {
		return 0;
	}
	
	const baseMana = baseOverride ?? (card.attributes.mana || 5);
	const today = getTodayDate();
	
	// Load mana state from a separate file or store in card metadata
	// For now, we'll use a simple approach: store in a JSON file
	const fs = await import('fs/promises');
	const path = await import('path');
	const { fileURLToPath } = await import('url');
	
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const dataDir = path.join(__dirname, '../../data');
	const manaStateFile = path.join(dataDir, 'manaState.json');
	
	// Ensure data directory exists
	try {
		await fs.mkdir(dataDir, { recursive: true });
	} catch {
		// Directory already exists
	}
	
	let manaState: ManaState = {};
	try {
		const data = await fs.readFile(manaStateFile, 'utf-8');
		manaState = JSON.parse(data);
	} catch {
		// File doesn't exist, start fresh
		manaState = {};
	}
	
	const cardState = manaState[cardId];
	const lastRechargeDate = cardState?.lastRechargeDate || today;
	
	// If it's a new day, recharge to base mana
	if (lastRechargeDate !== today) {
		manaState[cardId] = {
			lastRechargeDate: today,
			currentMana: baseMana,
		};
		await fs.writeFile(manaStateFile, JSON.stringify(manaState, null, 2), 'utf-8');
		return baseMana;
	}
	
	// Return current mana (or base mana if not set)
	return cardState?.currentMana ?? baseMana;
}

// Get current mana for a card
export async function getCurrentMana(cardId: string, baseOverride?: number): Promise<number> {
	return await rechargeManaIfNeeded(cardId, baseOverride);
}

// Deplete mana by 1 for a card
export async function depleteMana(cardId: string): Promise<number> {
	const db = getDatabase();
	const card = db.cards.get(cardId);
	
	if (!card) {
		return 0;
	}
	
	const baseMana = card.attributes.mana || 5;
	const today = getTodayDate();
	
	const fs = await import('fs/promises');
	const path = await import('path');
	const { fileURLToPath } = await import('url');
	
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const dataDir = path.join(__dirname, '../../data');
	const manaStateFile = path.join(dataDir, 'manaState.json');
	
	// Ensure data directory exists
	try {
		await fs.mkdir(dataDir, { recursive: true });
	} catch {
		// Directory already exists
	}
	
	let manaState: ManaState = {};
	try {
		const data = await fs.readFile(manaStateFile, 'utf-8');
		manaState = JSON.parse(data);
	} catch {
		manaState = {};
	}
	
	// Recharge if needed first
	await rechargeManaIfNeeded(cardId);
	
	const cardState = manaState[cardId];
	const currentMana = cardState?.currentMana ?? baseMana;
	
	// Deplete by 1, but don't go below 0
	const newMana = Math.max(0, currentMana - 1);
	
	manaState[cardId] = {
		lastRechargeDate: today,
		currentMana: newMana,
	};
	
	await fs.writeFile(manaStateFile, JSON.stringify(manaState, null, 2), 'utf-8');
	return newMana;
}

// Set current mana for a card explicitly (clamped to >=0)
export async function setCurrentMana(cardId: string, value: number): Promise<number> {
	const db = getDatabase();
	const card = db.cards.get(cardId);
	if (!card) return 0;
	const fs = await import('fs/promises');
	const path = await import('path');
	const { fileURLToPath } = await import('url');
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const dataDir = path.join(__dirname, '../../data');
	const manaStateFile = path.join(dataDir, 'manaState.json');
	try { await fs.mkdir(dataDir, { recursive: true }); } catch {}
	let manaState: ManaState = {};
	try {
		const data = await fs.readFile(manaStateFile, 'utf-8');
		manaState = JSON.parse(data);
	} catch { manaState = {}; }
	const today = getTodayDate();
	manaState[cardId] = {
		lastRechargeDate: manaState[cardId]?.lastRechargeDate || today,
		currentMana: Math.max(0, Math.floor(value)),
	};
	await fs.writeFile(manaStateFile, JSON.stringify(manaState, null, 2), 'utf-8');
	return manaState[cardId].currentMana;
}

// Get special interaction unlocks based on mana
export function getSpecialInteractionUnlocks(currentMana: number): string {
	if (currentMana >= 9) {
		return `- Your MANA is VERY HIGH (${currentMana}). You have access to exclusive, deeply intimate scenarios and extended roleplay sessions. You can engage in the most detailed and immersive intimate experiences. You remember past conversations with exceptional clarity and can reference shared history in great detail.`;
	} else if (currentMana >= 7) {
		return `- Your MANA is HIGH (${currentMana}). You have access to special intimate scenarios and extended conversations. You can engage in more detailed and immersive roleplay experiences. You remember past conversations well and can reference shared history.`;
	} else if (currentMana >= 5) {
		return `- Your MANA is MODERATE (${currentMana}). You can engage in intimate roleplay, but may need to be mindful of your energy. You remember past conversations and can reference shared history.`;
	} else if (currentMana >= 3) {
		return `- Your MANA is LOW (${currentMana}). You can still engage in intimate roleplay, but your energy is limited. You may need to keep interactions shorter or less intense. You remember basic details from past conversations.`;
	} else {
		return `- Your MANA is VERY LOW (${currentMana}). Your energy is nearly depleted. You can still chat, but intimate roleplay may be limited or less detailed. You may need to rest soon. Consider recharging your energy tomorrow.`;
	}
}

