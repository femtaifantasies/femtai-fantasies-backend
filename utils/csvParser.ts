import { Card, CardSet } from '../types.js';
import { v4 as uuid } from 'uuid';
import { ensureThumbnailFormat } from './imageUrlValidator.js';
import { normalizeCardTitle } from './cardTitleCleaner.js';

interface CSVRow {
	collection: string;
	description: string;
	urls: string;
	type: string;
	mana: string;
	character: string;
	cost: string;
	costPerCard: string;
}

function parseCSVLine(line: string): string[] {
	const values: string[] = [];
	let current = '';
	let inQuotes = false;
	
	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		const nextChar = i + 1 < line.length ? line[i + 1] : '';
		
		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				// Escaped quote
				current += '"';
				i++; // Skip next quote
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === ',' && !inQuotes) {
			values.push(current.trim());
			current = '';
		} else {
			current += char;
		}
	}
	values.push(current.trim());
	
	return values;
}

function parseCost(costStr: string): number {
	// Remove $ and convert to number
	const cleaned = costStr.replace(/[$,]/g, '');
	return parseFloat(cleaned) || 0;
}

function parseGoogleDriveUrl(url: string): string {
	// Use the centralized validator to ensure consistent URL formatting
	// CRITICAL: This function MUST NOT modify URLs that are already in thumbnail format
	return ensureThumbnailFormat(url);
}

// Generate random attribute value between 2-10 (inclusive)
function randomAttribute(): number {
	return Math.floor(Math.random() * 9) + 2; // 2-10 inclusive
}

export function parseCSV(csvContent: string): { cards: Card[]; sets: CardSet[] } {
	const lines = csvContent.split('\n').filter(line => line.trim());
	
	if (lines.length < 2) {
		return { cards: [], sets: [] };
	}
	
	// Find header row - look for "COLLECTION" in first column (case-insensitive)
	// Handle both quoted and unquoted headers
	let headerIndex = 0;
	for (let i = 0; i < Math.min(3, lines.length); i++) {
		const parsed = parseCSVLine(lines[i]);
		const firstCol = parsed[0]?.toUpperCase().trim().replace(/^["']|["']$/g, '');
		if (firstCol === 'COLLECTION') {
			headerIndex = i;
			break;
		}
	}
	
	// Skip header row, start from next line
	const dataLines = lines.slice(headerIndex + 1);
	
	const cards: Card[] = [];
	const sets: CardSet[] = [];
	
	for (const line of dataLines) {
		if (!line.trim()) continue;
		
		const values = parseCSVLine(line);
		
		if (values.length < 8) continue;
		
		const row: CSVRow = {
			collection: values[0] || '',
			description: values[1] || '',
			urls: values[2] || '',
			type: values[3] || '',
			mana: values[4] || '0',
			character: values[5] || '',
			cost: values[6] || '$0',
			costPerCard: values[7] || '$0',
		};
		
		if (!row.collection || !row.urls) continue;
		
		// Parse URLs - handle multiple formats:
		// 1. Line-separated URLs (each URL on a new line)
		// 2. Comma-separated URLs in a single cell (CRITICAL - this is the main use case)
		// 3. URLs with trailing commas
		// First, remove surrounding quotes if present
		let urlsString = row.urls.trim();
		if ((urlsString.startsWith('"') && urlsString.endsWith('"')) || 
		    (urlsString.startsWith("'") && urlsString.endsWith("'"))) {
			urlsString = urlsString.slice(1, -1);
		}
		
		// CRITICAL: Split comma-separated URLs in a single cell
		// Pattern explanation: Split on comma that is followed by optional whitespace and then http/https
		// This handles: "url1, url2, url3" and "url1,url2,url3"
		// Use positive lookahead to ensure we're splitting at the right place
		const urlList = urlsString
			.split(/[\n\r]+/) // First split by newlines (handles line-separated URLs)
			.flatMap(line => {
				// For each line, split by comma followed by http/https
				// This regex: comma, then optional whitespace, then http or https
				return line.split(/,(?=\s*https?:\/\/)/);
			})
			.map(url => {
				// Clean up each URL
				return url
					.trim() // Remove leading/trailing whitespace
					.replace(/^["']+|["']+$/g, '') // Remove surrounding quotes (single or double)
					.replace(/,\s*$/, '') // Remove trailing comma and whitespace
					.trim(); // Final trim
			})
			.filter(url => {
				// Filter: must be non-empty and start with http:// or https://
				const isValid = url.length > 0 && (url.startsWith('http://') || url.startsWith('https://'));
				if (!isValid && url.length > 0) {
					console.warn(`⚠️  Skipping invalid URL fragment: "${url.substring(0, 50)}..."`);
				}
				return isValid;
			})
			.map(parseGoogleDriveUrl);
		
		// Enhanced logging to verify all URLs are captured
		console.log(`🔍 URL Parsing for "${row.collection}":`);
		console.log(`   Input length: ${row.urls.length} characters`);
		console.log(`   URLs found: ${urlList.length}`);
		if (urlList.length > 0) {
			console.log(`   ✅ Successfully parsed ${urlList.length} URL(s)`);
			urlList.forEach((url, idx) => {
				const fileIdMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
				const fileId = fileIdMatch ? fileIdMatch[1] : 'unknown';
				console.log(`      ${idx + 1}. File ID: ${fileId.substring(0, 20)}...`);
			});
		} else {
			console.error(`   ❌ No URLs found! Original string: "${row.urls.substring(0, 100)}..."`);
		}
		
		if (urlList.length === 0) {
			console.log(`⚠️  Skipping row "${row.collection}": no valid URLs found`);
			continue;
		}
		
		// Log the number of URLs found for this collection
		console.log(`📋 Collection "${row.collection}": Found ${urlList.length} URL(s) to process`);
		
		// Create set
		const setId = uuid();
		const setCost = parseCost(row.cost);
		// Default to $3 if costPerCard is not provided or is 0
		let costPerCard = parseCost(row.costPerCard);
		if (costPerCard === 0) {
			costPerCard = 3;
		}
		const mana = parseInt(row.mana) || 0;
		
		// Ensure set cover image is in thumbnail format
		const setCoverUrl = urlList[0] && urlList[0].includes('drive.google.com/thumbnail?id=')
			? urlList[0]
			: parseGoogleDriveUrl(urlList[0] || '');
		
		const set: CardSet = {
			id: setId,
			name: row.collection,
			description: row.description,
			imageUrl: setCoverUrl, // Use first image as set cover (normalized)
			cardIds: [],
			cost: setCost,
			costPerCard: costPerCard,
			type: row.type,
			mana: mana,
			character: row.character,
		};
		
		// Create cards from URLs - one card per URL
		// CRITICAL: This loop MUST create one card for each URL in urlList
		let cardsCreated = 0;
		urlList.forEach((url, index) => {
			const cardId = uuid();
			// Format: "Character - Collection | Number" (character name appears once)
			// Example: "Alerra - Blossoming | 1", "Alerra - Blossoming | 2"
			// Use normalizeCardTitle to ensure correct format
			const cardTitle = normalizeCardTitle(
				row.character 
					? `${row.character} - ${row.collection} | ${index + 1}` 
					: `${row.collection} | ${index + 1}`,
				row.character || undefined,
				row.collection,
				index + 1
			);
			
			// Ensure URL is in thumbnail format (parseGoogleDriveUrl already did this, but double-check)
			const finalUrl = url.includes('drive.google.com/thumbnail?id=') 
				? url 
				: parseGoogleDriveUrl(url);
			
			const card: Card = {
				id: cardId,
				imageUrl: finalUrl, // Always use normalized thumbnail format
				title: cardTitle,
				description: row.description,
				type: row.type, // Keep original capitalization
				cost: costPerCard,
				attributes: {
					mana: randomAttribute(), // Random value 2-10
					resistance: randomAttribute(), // Random value 2-10
					charm: randomAttribute(), // Random value 2-10
					devotion: 1, // Always set to 1
				},
				character: row.character || undefined,
			};
			
			cards.push(card);
			set.cardIds.push(cardId);
			cardsCreated++;
		});
		
		// CRITICAL VERIFICATION: Ensure every URL created a card
		if (cardsCreated !== urlList.length) {
			console.error(`❌ CRITICAL ERROR: Only created ${cardsCreated} cards but had ${urlList.length} URLs for "${row.collection}"`);
			console.error(`   This should never happen - every URL must create a card!`);
		}
		if (set.cardIds.length !== urlList.length) {
			console.error(`❌ Mismatch: Set has ${set.cardIds.length} card IDs but had ${urlList.length} URLs for "${row.collection}"`);
		} else {
			console.log(`✅ Created ${set.cardIds.length} card(s) for collection "${row.collection}" (verified: ${cardsCreated} cards created from ${urlList.length} URLs)`);
		}
		
		sets.push(set);
	}
	
	return { cards, sets };
}

// Parse CSV for standalone cards (each row is one card, no collections)
export function parseStandaloneCardsCSV(csvContent: string): { cards: Card[] } {
	const lines = csvContent.split('\n').filter(line => line.trim());
	
	if (lines.length < 2) {
		return { cards: [] };
	}
	
	// Find header row - look for "TITLE" or "NAME" in first column
	let headerIndex = 0;
	for (let i = 0; i < Math.min(3, lines.length); i++) {
		const parsed = parseCSVLine(lines[i]);
		const firstCol = parsed[0]?.toUpperCase().trim().replace(/^["']|["']$/g, '');
		if (firstCol === 'TITLE' || firstCol === 'NAME' || firstCol === 'CARD') {
			headerIndex = i;
			break;
		}
	}
	
	// Skip header row, start from next line
	const dataLines = lines.slice(headerIndex + 1);
	
	const cards: Card[] = [];
	
	for (const line of dataLines) {
		if (!line.trim()) continue;
		
		const values = parseCSVLine(line);
		
		// Expected format: Title, Description, URL, Type, Mana, Character, Cost
		// For standalone cards, the Title column should contain the full formatted title
		// Example: "Character - Title | 1" or just "Title | 1" if no character
		// Minimum 7 columns, but we'll be flexible
		if (values.length < 3) continue; // At least need Title, Description, URL
		
		let title = values[0] || ''; // Use title directly from CSV (should already be formatted)
		const description = values[1] || '';
		const url = values[2] || '';
		const type = values[3] || 'Standalone';
		const mana = parseInt(values[4]) || 0;
		const character = values[5] || '';
		const cost = parseCost(values[6] || '$3');
		
		if (!title || !url) continue;
		
		// Clean the title to ensure correct format
		title = normalizeCardTitle(title, character || undefined);
		
		// Normalize URL to thumbnail format - ensure it's always correct
		let normalizedUrl = parseGoogleDriveUrl(url);
		
		// Double-check: ensure it's in thumbnail format
		if (!normalizedUrl.includes('drive.google.com/thumbnail?id=')) {
			// If parseGoogleDriveUrl didn't convert it, try again
			const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
			if (match) {
				normalizedUrl = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
			}
		}
		
		// Ensure cost is at least $3
		const finalCost = Math.max(cost, 3);
		
		const card: Card = {
			id: uuid(),
			imageUrl: normalizedUrl, // Always in thumbnail format
			title: title.trim(),
			description: description.trim(),
			type: type.trim() || 'Standalone',
			cost: finalCost,
			attributes: {
				mana: randomAttribute(), // Random value 2-10
				resistance: randomAttribute(), // Random value 2-10
				charm: randomAttribute(), // Random value 2-10
				devotion: 1, // Always set to 1
			},
			character: character.trim() || undefined,
		};
		
		cards.push(card);
	}
	
	return { cards };
}

