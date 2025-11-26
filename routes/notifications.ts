import { Router, Request, Response } from 'express';
import { getAllNotifications, getNotification, updateNotification } from '../data/databaseAdapter.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { Notification } from '../types.js';
import { createNotification, createNotificationForAllUsers } from '../utils/notifications.js';

const router = Router();

// Get all notifications for current user
router.get('/', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.headers['x-user-id'] as string;
		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		const allNotifications = await getAllNotifications();
		const notifications = allNotifications
			.filter(n => n.userId === userId)
			.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

		res.json(notifications);
	} catch (error) {
		console.error('Get notifications error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Get unread notification count
router.get('/unread-count', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.headers['x-user-id'] as string;
		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		const allNotifications = await getAllNotifications();
		const unreadCount = allNotifications
			.filter(n => n.userId === userId && !n.read)
			.length;

		res.json({ count: unreadCount });
	} catch (error) {
		console.error('Get unread count error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Mark notification as read
router.put('/:notificationId/read', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.headers['x-user-id'] as string;
		const { notificationId } = req.params;

		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		// Get notification (works with both JSON and Prisma)
		const notification = await getNotification(notificationId);

		if (!notification) {
			return res.status(404).json({ error: 'Notification not found' });
		}

		if (notification.userId !== userId) {
			return res.status(403).json({ error: 'Forbidden' });
		}

		// Update notification (works with both JSON and Prisma)
		const updatedNotification = await updateNotification(notificationId, { read: true });

		res.json(updatedNotification);
	} catch (error) {
		console.error('Mark notification read error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Mark all notifications as read
router.put('/read-all', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.headers['x-user-id'] as string;
		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		const allNotifications = await getAllNotifications();
		const notifications = allNotifications
			.filter(n => n.userId === userId && !n.read);

		// Update all notifications (works with both JSON and Prisma)
		await Promise.all(notifications.map(n => updateNotification(n.id, { read: true })));

		res.json({ success: true, markedRead: notifications.length });
	} catch (error) {
		console.error('Mark all notifications read error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Admin: Create notification for all users
router.post('/admin/broadcast', requireAdmin, async (req: Request, res: Response) => {
	try {
		const { title, message, relatedId } = req.body;

		if (!title || !message) {
			return res.status(400).json({ error: 'Title and message are required' });
		}

		const notifications = await createNotificationForAllUsers(
			'admin_alert',
			title,
			message,
			relatedId
		);

		res.json({ success: true, notificationsCreated: notifications.length });
	} catch (error) {
		console.error('Admin broadcast notification error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;

