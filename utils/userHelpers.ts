import { UserProfile } from '../types.js';
import { decryptMessage, encryptMessage } from './encryption.js';

/**
 * Decrypt user data for safe return to client
 */
export function decryptUserData(user: UserProfile): Omit<UserProfile, 'passwordHash' | 'email' | 'username' | 'bio' | 'interests' | 'location' | 'isAdmin'> & { email: string; username?: string; bio?: string; interests?: string; location?: string; isAdmin?: boolean } {
	let decryptedEmail = '';
	let decryptedUsername = '';
	let decryptedBio = '';
	let decryptedInterests = '';
	let decryptedLocation = '';
	
	// Decrypt email (required)
	if (!user.email) {
		console.error('User email is missing for user:', user.id);
		// Return a placeholder instead of throwing to prevent server crash
		decryptedEmail = 'email@missing.com';
	} else {
		try {
			// Always attempt to decrypt - encrypted emails have format "iv:encrypted_data"
			if (user.email.includes(':')) {
				try {
					decryptedEmail = decryptMessage(user.email);
					// Verify it's a valid email format after decryption
					if (!decryptedEmail || !decryptedEmail.includes('@')) {
						console.error('Decrypted email does not look valid for user:', user.id);
						console.error('Decrypted value (first 30 chars):', decryptedEmail?.substring(0, 30));
						// Return encrypted value as fallback
						decryptedEmail = user.email;
					}
				} catch (decryptError: any) {
					console.error('decryptMessage failed for user:', user.id);
					console.error('Decrypt error:', decryptError?.message || decryptError);
					console.error('Encrypted email preview:', user.email.substring(0, 50) + '...');
					// Return encrypted value as fallback
					decryptedEmail = user.email;
				}
			} else {
				// If no ':' separator, it might be plain text (old format or migration)
				decryptedEmail = user.email;
			}
		} catch (error: any) {
			// Catch any other unexpected errors
			console.error('Unexpected error decrypting email for user:', user.id);
			console.error('Error:', error?.message || error);
			// Return encrypted value as fallback
			decryptedEmail = user.email;
		}
	}
	
	// Decrypt username (optional)
	if (user.username) {
		try {
			// Check if it's encrypted format (has ':')
			if (user.username.includes(':')) {
				try {
					decryptedUsername = decryptMessage(user.username);
				} catch (decryptError: any) {
					// If decryption fails, the username was encrypted with a different key
					// Return undefined so it falls back to email
					console.warn('Failed to decrypt username for user:', user.id, 'Username may need to be re-encrypted');
					decryptedUsername = undefined;
				}
			} else {
				// Plain text (old format or already decrypted)
				decryptedUsername = user.username;
			}
		} catch (error: any) {
			// If decryption fails, return undefined so it falls back to email
			console.error('Failed to decrypt username for user:', user.id, error?.message);
			decryptedUsername = undefined;
		}
	}
	
	if (user.bio) {
		try {
			decryptedBio = decryptMessage(user.bio);
		} catch {
			// If decryption fails, might be old format
			decryptedBio = user.bio as any;
		}
	}
	
	if (user.interests) {
		try {
			decryptedInterests = decryptMessage(user.interests);
		} catch {
			// If decryption fails, might be old format
			decryptedInterests = user.interests as any;
		}
	}
	
	if (user.location) {
		try {
			decryptedLocation = decryptMessage(user.location);
		} catch {
			// If decryption fails, might be old format
			decryptedLocation = user.location as any;
		}
	}
	
	// Decrypt isAdmin (optional)
	let decryptedIsAdmin: boolean | undefined;
	if (user.isAdmin) {
		try {
			const decryptedValue = decryptMessage(user.isAdmin);
			decryptedIsAdmin = decryptedValue === 'true';
		} catch {
			// If decryption fails, might be old format (boolean)
			decryptedIsAdmin = (user.isAdmin as any) === true || user.isAdmin === 'true';
		}
	}
	
	const { passwordHash: _, email: __, username: ___, bio: ____, interests: _____, location: ______, isAdmin: _______, ...userResponse } = user;
	return {
		...userResponse,
		email: decryptedEmail,
		username: decryptedUsername || undefined,
		bio: decryptedBio || undefined,
		interests: decryptedInterests || undefined,
		location: decryptedLocation || undefined,
		isAdmin: decryptedIsAdmin,
	};
}

/**
 * Check if a user is an admin by decrypting the isAdmin field
 */
export function isUserAdmin(user: UserProfile): boolean {
	if (!user.isAdmin) {
		return false;
	}
	
	try {
		const decryptedValue = decryptMessage(user.isAdmin);
		return decryptedValue === 'true';
	} catch {
		// If decryption fails, might be old format (boolean)
		return (user.isAdmin as any) === true || user.isAdmin === 'true';
	}
}

/**
 * Encrypt the isAdmin boolean value for storage
 */
export function encryptIsAdmin(isAdmin: boolean): string {
	return encryptMessage(isAdmin ? 'true' : 'false');
}

