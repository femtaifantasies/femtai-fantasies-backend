import { Router, Request, Response } from 'express';
import { getUser, updateUser, getAllUsers } from '../data/databaseAdapter.js';
import { requireAuth } from '../middleware/auth.js';
import { decryptUserData } from '../utils/userHelpers.js';

const router = Router();

// Follow a user
router.post('/:userId', requireAuth, async (req: Request, res: Response) => {
	try {
		const { userId } = req.params;
		const currentUserId = req.userId!;

		if (userId === currentUserId) {
			return res.status(400).json({ error: 'Cannot follow yourself' });
		}

		// Get users (works with both JSON and Prisma)
		const currentUser = await getUser(currentUserId);
		const targetUser = await getUser(userId);

		if (!currentUser || !targetUser) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Check if already following
		if (currentUser.followingIds?.includes(userId)) {
			return res.status(400).json({ error: 'Already following this user' });
		}

		// Initialize followingIds if it doesn't exist (for backward compatibility)
		const followingIds = currentUser.followingIds || [];
		followingIds.push(userId);

		// Update user (works with both JSON and Prisma)
		const updatedUser = await updateUser(currentUserId, { followingIds });

		// Return user with decrypted data
		res.json(decryptUserData(updatedUser));
	} catch (error) {
		console.error('Follow user error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Unfollow a user
router.delete('/:userId', requireAuth, async (req: Request, res: Response) => {
	try {
		const { userId } = req.params;
		const currentUserId = req.userId!;

		// Get user (works with both JSON and Prisma)
		const currentUser = await getUser(currentUserId);

		if (!currentUser) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Initialize followingIds if it doesn't exist
		const followingIds = (currentUser.followingIds || []).filter(id => id !== userId);

		// Update user (works with both JSON and Prisma)
		const updatedUser = await updateUser(currentUserId, { followingIds });

		// Return user with decrypted data
		res.json(decryptUserData(updatedUser));
	} catch (error) {
		console.error('Unfollow user error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Get list of users (for search/follow)
router.get('/search', requireAuth, async (req: Request, res: Response) => {
	try {
		const { q } = req.query;
		const currentUserId = req.userId!;

		// Get all users (works with both JSON and Prisma)
		let users = await getAllUsers();

		// Filter out current user and filter by search query
		users = users.filter(user => user.id !== currentUserId);

		if (q && typeof q === 'string') {
			const query = q.toLowerCase();
			users = users.filter(user => {
				try {
					const decryptedUsername = decryptUserData(user).username;
					return decryptedUsername.toLowerCase().includes(query);
				} catch {
					// If decryption fails, might be old format
					return (user.username as any).toLowerCase?.().includes(query);
				}
			});
		}

		// Return users with decrypted data
		const usersResponse = users.map(user => decryptUserData(user));

		res.json(usersResponse);
	} catch (error) {
		console.error('Search users error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;

