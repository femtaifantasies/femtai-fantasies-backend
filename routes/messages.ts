import { Router, Request, Response } from 'express';
import { getAllMessages, getUser, createMessage, updateMessage } from '../data/databaseAdapter.js';
import { requireAuth } from '../middleware/auth.js';
import { Message } from '../types.js';
import { v4 as uuid } from 'uuid';
import { encryptMessage, decryptMessage } from '../utils/encryption.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();

// Get all conversations for the current user
router.get('/conversations', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.userId || (req.headers['x-user-id'] as string);
		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		// Get all messages (works with both JSON and Prisma)
		const allMessages = await getAllMessages();
		
		// Get all unique user IDs the current user has conversations with
		const conversationUserIds = new Set<string>();
		allMessages.forEach(msg => {
			if (msg.fromUserId === userId) {
				conversationUserIds.add(msg.toUserId);
			} else if (msg.toUserId === userId) {
				conversationUserIds.add(msg.fromUserId);
			}
		});

		// Get user info for each conversation partner
		const conversationsRaw = await Promise.all(Array.from(conversationUserIds).map(async (partnerId) => {
			const partner = await getUser(partnerId);
			if (!partner) return null;

			// Get last message in this conversation
			const conversationMessages = allMessages.filter(msg =>
				(msg.fromUserId === userId && msg.toUserId === partnerId) ||
				(msg.fromUserId === partnerId && msg.toUserId === userId)
			).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

			const lastMessage = conversationMessages[0];
			const unreadCount = conversationMessages.filter(msg => 
				msg.toUserId === userId && !msg.read
			).length;

			let lastMessageContent = null;
			if (lastMessage) {
				try {
					lastMessageContent = decryptMessage(lastMessage.encryptedContent);
				} catch (error) {
					console.error(`Failed to decrypt message ${lastMessage.id}:`, error);
					lastMessageContent = '[Message could not be decrypted]';
				}
			}

			// Decrypt username
			let decryptedUsername = '';
			try {
				decryptedUsername = decryptMessage(partner.username);
			} catch {
				// If decryption fails, might be old format
				decryptedUsername = partner.username as any;
			}

			return {
				userId: partnerId,
				username: decryptedUsername,
				profileImageUrl: partner.profileImageUrl,
				lastMessage: lastMessage ? {
					content: lastMessageContent,
					createdAt: lastMessage.createdAt,
					fromUserId: lastMessage.fromUserId,
				} : null,
				unreadCount,
			};
		}));
		
		// Filter out null values
		const conversations = conversationsRaw.filter(Boolean);

		// Sort by last message time
		conversations.sort((a, b) => {
			if (!a?.lastMessage && !b?.lastMessage) return 0;
			if (!a?.lastMessage) return 1;
			if (!b?.lastMessage) return -1;
			return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime();
		});

		res.json(conversations);
	} catch (error: any) {
		console.error('Get conversations error:', error);
		console.error('Error stack:', error?.stack);
		res.status(500).json({ error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? error?.message : undefined });
	}
});

// Get messages between current user and another user
router.get('/:otherUserId', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.userId || (req.headers['x-user-id'] as string);
		const { otherUserId } = req.params;
		
		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		// Get users (works with both JSON and Prisma)
		const otherUser = await getUser(otherUserId);
		if (!otherUser) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Check if current user is following the other user, or if current user is admin
		const currentUser = await getUser(userId);
		if (!currentUser) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		// Check if users are friends (required for messaging)
		const areFriends = (currentUser.friendIds?.includes(otherUserId) || false) && 
		                   (otherUser.friendIds?.includes(userId) || false);
		
		const { isUserAdmin } = await import('../utils/userHelpers.js');
		const isAdmin = isUserAdmin(currentUser);
		
		// Allow messaging if: users are friends, OR user is admin
		if (!areFriends && !isAdmin) {
			return res.status(403).json({ error: 'You can only message users you are friends with' });
		}

		// Get all messages between these two users (works with both JSON and Prisma)
		const allMessages = await getAllMessages();
		const messages = allMessages
			.filter(msg =>
				(msg.fromUserId === userId && msg.toUserId === otherUserId) ||
				(msg.fromUserId === otherUserId && msg.toUserId === userId)
			)
			.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
		
		// Decrypt all messages
		const decryptedMessages = messages.map((msg) => {
			let content = '[Message could not be decrypted]';
			try {
				content = decryptMessage(msg.encryptedContent);
			} catch (error) {
				console.error(`Failed to decrypt message ${msg.id}:`, error);
			}
			return {
				...msg,
				content,
			};
		});

		// Mark messages as read (works with both JSON and Prisma)
		await Promise.all(decryptedMessages.map(async (msg) => {
			if (msg.toUserId === userId && !msg.read) {
				await updateMessage(msg.id, { read: true });
			}
		}));

		// Decrypt username
		let decryptedUsername = '';
		try {
			decryptedUsername = decryptMessage(otherUser.username);
		} catch {
			// If decryption fails, might be old format
			decryptedUsername = otherUser.username as any;
		}

		res.json({
			otherUser: {
				id: otherUser.id,
				username: decryptedUsername,
				profileImageUrl: otherUser.profileImageUrl,
			},
			messages: decryptedMessages,
		});
	} catch (error) {
		console.error('Get messages error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Send a message
router.post('/', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.userId || (req.headers['x-user-id'] as string);
		const { toUserId, content } = req.body;

		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		if (!toUserId || !content || typeof content !== 'string' || content.trim().length === 0) {
			return res.status(400).json({ error: 'Invalid message data' });
		}

		if (content.length > 5000) {
			return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
		}

		// Get users (works with both JSON and Prisma)
		const recipient = await getUser(toUserId);
		if (!recipient) {
			return res.status(404).json({ error: 'Recipient not found' });
		}

		// Check if current user is following the recipient, or if current user is admin
		const currentUser = await getUser(userId);
		if (!currentUser) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		// Check if users are friends (required for messaging)
		const areFriends = (currentUser.friendIds?.includes(toUserId) || false) && 
		                   (recipient.friendIds?.includes(userId) || false);
		
		const { isUserAdmin } = await import('../utils/userHelpers.js');
		const isAdmin = isUserAdmin(currentUser);
		
		// Allow messaging if: users are friends, OR user is admin
		if (!areFriends && !isAdmin) {
			return res.status(403).json({ error: 'You can only message users you are friends with' });
		}

		// Encrypt the message content
		const encryptedContent = encryptMessage(content.trim());

		// Create message
		const message: Message = {
			id: uuid(),
			fromUserId: userId,
			toUserId: toUserId,
			encryptedContent,
			createdAt: new Date().toISOString(),
			read: false,
		};

		// Create message (works with both JSON and Prisma)
		await createMessage(message);

		// Decrypt current user's username for notification
		let currentUsername = '';
		try {
			currentUsername = decryptMessage(currentUser.username);
		} catch {
			currentUsername = currentUser.username as any;
		}

		// Create notification for the recipient
		await createNotification(
			toUserId,
			'message',
			'New Message',
			`You have a new message from ${currentUsername}`,
			message.id,
			userId
		);

		// Return decrypted message for immediate display
		res.json({
			...message,
			content: decryptMessage(message.encryptedContent),
		});
	} catch (error) {
		console.error('Send message error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Mark messages as read
router.put('/:otherUserId/read', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.userId || (req.headers['x-user-id'] as string);
		const { otherUserId } = req.params;

		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		// Get and update messages (works with both JSON and Prisma)
		const allMessages = await getAllMessages();
		const messages = allMessages
			.filter(msg => msg.fromUserId === otherUserId && msg.toUserId === userId && !msg.read);

		await Promise.all(messages.map(msg => updateMessage(msg.id, { read: true })));
		res.json({ success: true, markedRead: messages.length });
	} catch (error) {
		console.error('Mark messages read error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;

