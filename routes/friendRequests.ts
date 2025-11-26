import { Router, Request, Response } from 'express';
import { getUser, updateUser, getAllFriendRequests, createFriendRequest, updateFriendRequest, getFriendRequest } from '../data/databaseAdapter.js';
import { requireAuth } from '../middleware/auth.js';
import { decryptUserData } from '../utils/userHelpers.js';
import { decryptMessage } from '../utils/encryption.js';
import { FriendRequest, Notification } from '../types.js';
import { v4 as uuid } from 'uuid';
import { createNotification } from '../utils/notifications.js';

const router = Router();

// Send a friend request
router.post('/:userId', requireAuth, async (req: Request, res: Response) => {
	try {
		const { userId } = req.params;
		const currentUserId = req.userId!;

		if (userId === currentUserId) {
			return res.status(400).json({ error: 'Cannot send friend request to yourself' });
		}

		// Get users (works with both JSON and Prisma)
		const currentUser = await getUser(currentUserId);
		const targetUser = await getUser(userId);

		if (!currentUser || !targetUser) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Initialize arrays if missing
		const currentFriendIds = currentUser.friendIds || [];
		const currentFriendRequestIds = currentUser.friendRequestIds || [];
		const targetFriendIds = targetUser.friendIds || [];

		// Check if already friends
		if (currentFriendIds.includes(userId) || targetFriendIds.includes(currentUserId)) {
			return res.status(400).json({ error: 'Already friends with this user' });
		}

		// Check if there's already a pending request from current user to target user
		const allFriendRequests = await getAllFriendRequests();
		const existingRequest = allFriendRequests.find(
			req => req.fromUserId === currentUserId && req.toUserId === userId && req.status === 'pending'
		);

		if (existingRequest) {
			return res.status(400).json({ error: 'Friend request already sent' });
		}

		// Check if there's a pending request from target user to current user
		const reverseRequest = allFriendRequests.find(
			req => req.fromUserId === userId && req.toUserId === currentUserId && req.status === 'pending'
		);

		if (reverseRequest) {
			// Auto-accept if the other user already sent a request
			await updateFriendRequest(reverseRequest.id, { status: 'accepted' });

			// Add both users to each other's friend lists
			const updatedCurrentFriendIds = currentFriendIds.includes(userId) 
				? currentFriendIds 
				: [...currentFriendIds, userId];
			const updatedTargetFriendIds = targetFriendIds.includes(currentUserId)
				? targetFriendIds
				: [...targetFriendIds, currentUserId];

			// Update users (works with both JSON and Prisma)
			await updateUser(currentUserId, { friendIds: updatedCurrentFriendIds });
			await updateUser(userId, { friendIds: updatedTargetFriendIds });

			const updatedCurrentUser = await getUser(currentUserId);
			return res.json({ 
				message: 'Friend request accepted automatically',
				friendRequest: { ...reverseRequest, status: 'accepted' },
				user: decryptUserData(updatedCurrentUser!)
			});
		}

		// Create new friend request
		const friendRequest: FriendRequest = {
			id: uuid(),
			fromUserId: currentUserId,
			toUserId: userId,
			status: 'pending',
			createdAt: new Date().toISOString(),
		};

		// Create friend request (works with both JSON and Prisma)
		await createFriendRequest(friendRequest);
		
		// Update user's friendRequestIds
		const updatedFriendRequestIds = [...currentFriendRequestIds, friendRequest.id];
		await updateUser(currentUserId, { friendRequestIds: updatedFriendRequestIds });

		// Create notification for target user
		try {
			const fromUsername = currentUser.username 
				? decryptMessage(currentUser.username) 
				: decryptMessage(currentUser.email).split('@')[0];
			
			await createNotification(
				userId,
				'friend_request',
				'New Friend Request',
				`${fromUsername} sent you a friend request`,
				friendRequest.id,
				currentUserId
			);
		} catch (error) {
			console.error('Error creating friend request notification:', error);
		}

		const updatedCurrentUser = await getUser(currentUserId);
		res.json({ friendRequest, user: decryptUserData(updatedCurrentUser!) });
	} catch (error) {
		console.error('Send friend request error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Accept a friend request
router.post('/:requestId/accept', requireAuth, async (req: Request, res: Response) => {
	try {
		const { requestId } = req.params;
		const currentUserId = req.userId!;

		// Get friend request (works with both JSON and Prisma)
		const friendRequest = await getFriendRequest(requestId);

		if (!friendRequest) {
			return res.status(404).json({ error: 'Friend request not found' });
		}

		if (friendRequest.toUserId !== currentUserId) {
			return res.status(403).json({ error: 'You can only accept requests sent to you' });
		}

		if (friendRequest.status !== 'pending') {
			return res.status(400).json({ error: 'Friend request is not pending' });
		}

		// Get users (works with both JSON and Prisma)
		const fromUser = await getUser(friendRequest.fromUserId);
		const toUser = await getUser(currentUserId);

		if (!fromUser || !toUser) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Initialize arrays if missing
		const fromFriendIds = fromUser.friendIds || [];
		const toFriendIds = toUser.friendIds || [];
		const fromFriendRequestIds = fromUser.friendRequestIds || [];

		// Update request status (works with both JSON and Prisma)
		await updateFriendRequest(requestId, { status: 'accepted' });

		// Add both users to each other's friend lists
		const updatedFromFriendIds = fromFriendIds.includes(currentUserId)
			? fromFriendIds
			: [...fromFriendIds, currentUserId];
		const updatedToFriendIds = toFriendIds.includes(friendRequest.fromUserId)
			? toFriendIds
			: [...toFriendIds, friendRequest.fromUserId];

		// Remove request ID from sender's friendRequestIds
		const updatedFromFriendRequestIds = fromFriendRequestIds.filter(id => id !== requestId);

		// Update users (works with both JSON and Prisma)
		await updateUser(friendRequest.fromUserId, {
			friendIds: updatedFromFriendIds,
			friendRequestIds: updatedFromFriendRequestIds,
		});
		await updateUser(currentUserId, { friendIds: updatedToFriendIds });

		// Create notification for the requester
		try {
			const toUsername = toUser.username 
				? decryptMessage(toUser.username) 
				: decryptMessage(toUser.email).split('@')[0];
			
			await createNotification(
				friendRequest.fromUserId,
				'friend_request',
				'Friend Request Accepted',
				`${toUsername} accepted your friend request`,
				requestId,
				currentUserId
			);
		} catch (error) {
			console.error('Error creating acceptance notification:', error);
		}

		// Get updated users to return
		const updatedToUser = await getUser(currentUserId);
		const updatedFromUser = await getUser(friendRequest.fromUserId);
		const updatedFriendRequest = await getFriendRequest(requestId);
		
		res.json({ 
			friendRequest: updatedFriendRequest!, 
			user: decryptUserData(updatedToUser!),
			fromUser: decryptUserData(updatedFromUser!)
		});
	} catch (error) {
		console.error('Accept friend request error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Decline a friend request
router.post('/:requestId/decline', requireAuth, async (req: Request, res: Response) => {
	try {
		const { requestId } = req.params;
		const currentUserId = req.userId!;

		// Get friend request (works with both JSON and Prisma)
		const friendRequest = await getFriendRequest(requestId);

		if (!friendRequest) {
			return res.status(404).json({ error: 'Friend request not found' });
		}

		if (friendRequest.toUserId !== currentUserId) {
			return res.status(403).json({ error: 'You can only decline requests sent to you' });
		}

		if (friendRequest.status !== 'pending') {
			return res.status(400).json({ error: 'Friend request is not pending' });
		}

		// Get users (works with both JSON and Prisma)
		const fromUser = await getUser(friendRequest.fromUserId);
		const toUser = await getUser(currentUserId);

		if (!fromUser || !toUser) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Initialize arrays if missing
		const fromFriendRequestIds = fromUser.friendRequestIds || [];

		// Update request status (works with both JSON and Prisma)
		await updateFriendRequest(requestId, { status: 'declined' });

		// Remove request ID from sender's friendRequestIds
		const updatedFromFriendRequestIds = fromFriendRequestIds.filter(id => id !== requestId);

		// Update user (works with both JSON and Prisma)
		await updateUser(friendRequest.fromUserId, { friendRequestIds: updatedFromFriendRequestIds });

		const updatedToUser = await getUser(currentUserId);
		const updatedFriendRequest = await getFriendRequest(requestId);
		res.json({ friendRequest: updatedFriendRequest!, user: decryptUserData(updatedToUser!) });
	} catch (error) {
		console.error('Decline friend request error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Get pending friend requests for current user
router.get('/pending', requireAuth, async (req: Request, res: Response) => {
	try {
		const currentUserId = req.userId!;

		// Get all friend requests (works with both JSON and Prisma)
		const allFriendRequests = await getAllFriendRequests();
		const pendingRequests = allFriendRequests
			.filter(req => req.toUserId === currentUserId && req.status === 'pending')
			.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

		// Include sender user data
		const requestsWithUsers = await Promise.all(pendingRequests.map(async (req) => {
			const fromUser = await getUser(req.fromUserId);
			return {
				...req,
				fromUser: fromUser ? decryptUserData(fromUser) : null,
			};
		}));

		res.json(requestsWithUsers);
	} catch (error) {
		console.error('Get pending friend requests error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Get sent friend requests for current user
router.get('/sent', requireAuth, async (req: Request, res: Response) => {
	try {
		const currentUserId = req.userId!;

		// Get all friend requests (works with both JSON and Prisma)
		const allFriendRequests = await getAllFriendRequests();
		const sentRequests = allFriendRequests
			.filter(req => req.fromUserId === currentUserId && req.status === 'pending')
			.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

		// Include recipient user data
		const requestsWithUsers = await Promise.all(sentRequests.map(async (req) => {
			const toUser = await getUser(req.toUserId);
			return {
				...req,
				toUser: toUser ? decryptUserData(toUser) : null,
			};
		}));

		res.json(requestsWithUsers);
	} catch (error) {
		console.error('Get sent friend requests error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;

