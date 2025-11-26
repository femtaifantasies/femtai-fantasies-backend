/**
 * Script to clean all card titles in the database
 * Removes duplicate character names and extra numbers
 * 
 * Usage: npx tsx server/scripts/cleanCardTitles.ts
 */

import { initializeDatabase } from '../data/databaseAdapter.js';
import { getAllCards, updateCard } from '../data/databaseAdapter.js';
import { cleanCardTitle } from '../utils/cardTitleCleaner.js';

async function cleanAllCardTitles() {
	try {
		// Initialize database connection
		await initializeDatabase();
		console.log('✅ Database initialized');

		// Get all cards
		const cards = await getAllCards();
		console.log(`📋 Found ${cards.length} cards to process`);

		let updated = 0;
		let skipped = 0;

		for (const card of cards) {
			const originalTitle = card.title;
			const cleanedTitle = cleanCardTitle(originalTitle, card.character);

			// Only update if the title changed
			if (cleanedTitle !== originalTitle) {
				await updateCard(card.id, { title: cleanedTitle });
				console.log(`✅ Updated: "${originalTitle}" -> "${cleanedTitle}"`);
				updated++;
			} else {
				skipped++;
			}
		}

		console.log(`\n✅ Cleaning complete!`);
		console.log(`   Updated: ${updated} cards`);
		console.log(`   Skipped: ${skipped} cards (already correct)`);
		
		process.exit(0);
	} catch (error) {
		console.error('❌ Error cleaning card titles:', error);
		process.exit(1);
	}
}

cleanAllCardTitles();

