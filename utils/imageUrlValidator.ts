/**
 * Image URL Validator and Normalizer
 * 
 * This utility ensures all Google Drive image URLs are in the correct format
 * and are NEVER modified if they're already correct.
 * 
 * CRITICAL: Once a URL is in thumbnail format, it must NEVER be changed.
 */

export function ensureThumbnailFormat(url: string): string {
	if (!url || typeof url !== 'string') {
		return url || '';
	}

	// If already in thumbnail format, return EXACTLY as-is (no modifications)
	if (url.includes('drive.google.com/thumbnail?id=')) {
		return url;
	}

	// Only convert if it's a Google Drive share link
	const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
	if (match) {
		const fileId = match[1];
		return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
	}

	// If not a Google Drive URL, return as-is
	return url;
}

/**
 * Validates that a URL is in the correct format
 */
export function isValidThumbnailUrl(url: string): boolean {
	if (!url || typeof url !== 'string') {
		return false;
	}
	return url.includes('drive.google.com/thumbnail?id=');
}

