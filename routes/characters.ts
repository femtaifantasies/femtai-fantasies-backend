import { Router, Request, Response } from 'express';
import { getAllCards } from '../data/databaseAdapter.js';
import { getAllCharacters, getCharacter } from '../data/databaseAdapter.js';
import { Character } from '../types.js';

const router = Router();

// Helper function to get a random card image for a character
async function getRandomCharacterCoverImage(characterName: string): Promise<string | undefined> {
	const allCards = await getAllCards();
	const characterCards = allCards.filter(
		card => card.character?.toLowerCase() === characterName.toLowerCase()
	);
	
	if (characterCards.length === 0) {
		return undefined;
	}
	
	// Pick a random card
	const randomIndex = Math.floor(Math.random() * characterCards.length);
	return characterCards[randomIndex]?.imageUrl;
}

// Helper function to enrich character with cover image if missing
async function enrichCharacter(character: Character): Promise<Character> {
	if (!character.coverImageUrl) {
		const randomCover = await getRandomCharacterCoverImage(character.name);
		if (randomCover) {
			return {
				...character,
				coverImageUrl: randomCover,
			};
		}
	}
	return character;
}

// Get all characters
router.get('/', async (req: Request, res: Response) => {
	try {
		const characters = await getAllCharacters();
		const enrichedCharacters = await Promise.all(characters.map(c => enrichCharacter(c)));
		res.json(enrichedCharacters);
	} catch (error) {
		console.error('Get characters error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Get a single character by ID
router.get('/:characterId', async (req: Request, res: Response) => {
	try {
		const { characterId } = req.params;
		const character = await getCharacter(characterId);
		
		if (!character) {
			return res.status(404).json({ error: 'Character not found' });
		}
		
		res.json(await enrichCharacter(character));
	} catch (error) {
		console.error('Get character error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Get character by name
router.get('/name/:characterName', async (req: Request, res: Response) => {
	try {
		const { characterName } = req.params;
		const allCharacters = await getAllCharacters();
		const character = allCharacters.find(
			c => c.name.toLowerCase() === characterName.toLowerCase()
		);
		
		if (!character) {
			return res.status(404).json({ error: 'Character not found' });
		}
		
		res.json(await enrichCharacter(character));
	} catch (error) {
		console.error('Get character by name error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;

