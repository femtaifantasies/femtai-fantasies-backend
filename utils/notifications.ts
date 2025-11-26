import { createNotification as createNotificationInDb, getAllUsers } from '../data/databaseAdapter.js';
import { Notification } from '../types.js';
import { v4 as uuid } from 'uuid';

/**
 * Create a notification for a user
 * Uses the database adapter to work with both PostgreSQL and JSON
 */
export async function createNotification(
	userId: string,
	type: Notification['type'],
	title: string,
	message: string,
	relatedId?: string,
	fromUserId?: string
): Promise<Notification> {
	const notification: Notification = {
		id: uuid(),
		userId,
		type,
		title,
		message,
		read: false,
		createdAt: new Date().toISOString(),
		relatedId,
		fromUserId,
	};

	// Use database adapter (works with both JSON and Prisma)
	return await createNotificationInDb(notification);
}

/**
 * Create notifications for multiple users (e.g., for new cards/collections)
 */
export async function createNotificationsForUsers(
	userIds: string[],
	type: Notification['type'],
	title: string,
	message: string,
	relatedId?: string
): Promise<Notification[]> {
	const notifications: Notification[] = [];
	
	for (const userId of userIds) {
		const notification = await createNotification(userId, type, title, message, relatedId);
		notifications.push(notification);
	}

	return notifications;
}

/**
 * Create notification for all users (e.g., for admin alerts)
 * Uses the database adapter to work with both PostgreSQL and JSON
 */
export async function createNotificationForAllUsers(
	type: Notification['type'],
	title: string,
	message: string,
	relatedId?: string
): Promise<Notification[]> {
	// Use database adapter to get all users (works with both JSON and Prisma)
	const allUsers = await getAllUsers();
	const allUserIds = allUsers.map(user => user.id);
	return createNotificationsForUsers(allUserIds, type, title, message, relatedId);
}

