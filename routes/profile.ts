import { Router, Request, Response } from 'express';
import { getUser, updateUser, getAllUsers } from '../data/databaseAdapter.js';
import { requireAuth } from '../middleware/auth.js';
import { encryptMessage, decryptMessage } from '../utils/encryption.js';
import { decryptUserData } from '../utils/userHelpers.js';
import { findUserByEmail } from '../utils/userEmailHelper.js';

const router = Router();

router.get('/:userId', async (req: Request, res: Response) => {
	try {
		const { userId } = req.params;
		const user = await getUser(userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}
		
		// Return user with decrypted data
		try {
			const decryptedUser = decryptUserData(user);
			res.json(decryptedUser);
		} catch (decryptError: any) {
			console.error('Error decrypting user data:', decryptError);
			// Return user with minimal data if decryption fails
			const { passwordHash, email, username, bio, interests, location, ...safeUser } = user;
			res.json({
				...safeUser,
				email: email || 'email@missing.com',
				username: username || undefined,
				bio: bio || undefined,
				interests: interests || undefined,
				location: location || undefined,
			});
		}
	} catch (error: any) {
		console.error('Get profile error:', error);
		res.status(500).json({ error: 'Internal server error', details: error?.message });
	}
});

router.put('/:userId', requireAuth, async (req: Request, res: Response) => {
	try {
		const { userId } = req.params;
		if (req.userId !== userId) {
			return res.status(403).json({ error: 'Forbidden' });
		}

		const user = await getUser(userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		const { email, username, bio, profileImageUrl, ageVerifiedAt, interests, location, website } = req.body;
		
		// Prepare updates
		const updates: any = {};
		
		// Handle email update (if provided and different from current)
		if (email !== undefined && email.trim().length > 0) {
			const normalizedEmail = email.trim().toLowerCase();
			
			// Validate email format
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(normalizedEmail)) {
				return res.status(400).json({ error: 'Invalid email format' });
			}
			
			// Check if email is different from current
			let currentEmail = '';
			try {
				currentEmail = decryptMessage(user.email).toLowerCase();
			} catch {
				currentEmail = (user.email as any)?.toLowerCase?.() || '';
			}
			
			if (normalizedEmail !== currentEmail) {
				// Check if email is already taken by another user
				const existingUser = await findUserByEmail(normalizedEmail);
				if (existingUser && existingUser.id !== userId) {
					return res.status(409).json({ error: 'Email already registered' });
				}
				
				// Encrypt and update email
				updates.email = encryptMessage(normalizedEmail);
			}
		}
		
		// Encrypt username before storing (optional display name)
		if (username !== undefined) {
			if (username && username.trim().length > 0) {
				updates.username = encryptMessage(username.trim());
			} else {
				updates.username = undefined;
			}
		}
		
		// Encrypt bio before storing
		if (bio !== undefined) {
			if (bio && bio.trim().length > 0) {
				updates.bio = encryptMessage(bio.trim());
			} else {
				updates.bio = undefined;
			}
		}
		// Encrypt interests before storing
		if (interests !== undefined) {
			if (interests && interests.trim().length > 0) {
				updates.interests = encryptMessage(interests.trim());
			} else {
				updates.interests = undefined;
			}
		}
		if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl;
		if (ageVerifiedAt !== undefined) updates.ageVerifiedAt = ageVerifiedAt;
		if (location !== undefined) {
			if (location && location.trim().length > 0) {
				updates.location = encryptMessage(location.trim());
			} else {
				updates.location = undefined;
			}
		}
		if (website !== undefined) {
			if (website && website.trim().length > 0) {
				updates.website = website.trim();
			} else {
				updates.website = undefined;
			}
		}

		// Update user (works with both JSON and Prisma)
		const updatedUser = await updateUser(userId, updates);

		// Return user with decrypted data
		res.json(decryptUserData(updatedUser));
	} catch (error) {
		console.error('Update profile error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;

