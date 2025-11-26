/**
 * Utility functions to clean and normalize card titles
 * Ensures format: "Character Name - Collection Name | Card Number"
 * Removes duplicate character names and extra numbers
 */

/**
 * Clean a card title to ensure it follows the correct format:
 * "Character Name - Collection Name | Card Number"
 * 
 * Examples:
 * "Alerra - Alerra - Blue Skies | 1 | 7" -> "Alerra - Blue Skies | 1"
 * "Alerra - Blue Skies | 1 | 1" -> "Alerra - Blue Skies | 1"
 * "Alerra - Alerra - Blossoming | 2" -> "Alerra - Blossoming | 2"
 */
export function cleanCardTitle(title: string, character?: string): string {
	if (!title) return title;
	
	let cleaned = title.trim();
	
	// If character is provided, use it to remove duplicates
	if (character) {
		const characterName = character.trim();
		// Remove duplicate character name at the start
		// Pattern: 'CharacterName - ' or 'CharacterName - CharacterName - '
		const escapedChar = characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const charPattern = new RegExp('^' + escapedChar + '\\s*-\\s*', 'i');
		
		// Remove first occurrence
		cleaned = cleaned.replace(charPattern, '');
		
		// If character name appears again after removal, remove it
		if (cleaned.startsWith(characterName + ' - ') || cleaned.startsWith(characterName + '-')) {
			cleaned = cleaned.replace(charPattern, '');
		}
		
		// Re-add character name at the start if it's not there
		if (!cleaned.startsWith(characterName)) {
			cleaned = `${characterName} - ${cleaned}`;
		}
	} else {
		// No character provided - try to detect and remove duplicate character names
		// Split by " - " to get parts
		const parts = cleaned.split(' - ');
		if (parts.length >= 2) {
			const firstPart = parts[0].trim();
			// If first two parts are the same, remove the duplicate
			if (parts[1] && parts[1].trim() === firstPart) {
				parts.splice(1, 1); // Remove duplicate
				cleaned = parts.join(' - ');
			}
		}
	}
	
	// Handle pipe-separated numbers at the end
	// Pattern: "Something | 1 | 7" -> "Something | 1"
	// Pattern: "Something | 1 | 1" -> "Something | 1"
	const pipeMatch = cleaned.match(/^(.+?)(\s*\|\s*\d+.*)$/);
	if (pipeMatch) {
		const titlePart = pipeMatch[1].trim();
		const numbersPart = pipeMatch[2];
		
		// Extract all numbers after pipes
		const numberMatches = numbersPart.matchAll(/\|\s*(\d+)/g);
		const numbers: number[] = [];
		for (const match of numberMatches) {
			numbers.push(parseInt(match[1]));
		}
		
		// Keep only the first number (card number)
		if (numbers.length > 0) {
			cleaned = `${titlePart} | ${numbers[0]}`;
		}
	}
	
	return cleaned.trim();
}

/**
 * Normalize a card title to the standard format
 * This is a more aggressive cleaning that ensures the format is exactly:
 * "Character Name - Collection Name | Card Number"
 */
export function normalizeCardTitle(title: string, character?: string, collection?: string, cardNumber?: number): string {
	if (!title) return title;
	
	// If we have all the components, construct the title directly
	if (character && collection && cardNumber !== undefined) {
		return `${character} - ${collection} | ${cardNumber}`;
	}
	
	// Otherwise, clean the existing title
	return cleanCardTitle(title, character);
}

