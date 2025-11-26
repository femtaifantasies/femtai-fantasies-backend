/**
 * Helper functions for finding users by email
 * Works with both JSON and Prisma databases
 * Handles encrypted email decryption
 */

import { getDatabaseMode, getAllUsers } from '../data/databaseAdapter.js';
import { getPrismaClient } from '../data/prismaClient.js';
import { getDatabase } from '../data/database.js';
import { decryptMessage, encryptMessageWithIV } from './encryption.js';
import type { UserProfile } from '../types.js';

/**
 * Find a user by email address
 * Works with both JSON and Prisma databases
 * Handles encrypted email decryption
 */
export async function findUserByEmail(email: string): Promise<UserProfile | null> {
	const normalizedEmail = email.trim().toLowerCase();

	if (getDatabaseMode() === 'prisma') {
		// For Prisma, we need to get all users and decrypt emails
		// This is a limitation of encrypted emails - we can't query by encrypted value
		const users = await getAllUsers();
		
		for (const user of users) {
			try {
				const decryptedEmail = decryptMessage(user.email);
				if (decryptedEmail.toLowerCase() === normalizedEmail) {
					return user;
				}
			} catch {
				// Fallback: IV-based comparison
				if (typeof user.email === 'string' && user.email.includes(':')) {
					try {
						const [ivHex] = user.email.split(':');
						const iv = Buffer.from(ivHex, 'hex');
						const encryptedInput = encryptMessageWithIV(normalizedEmail, iv);
						if (encryptedInput === user.email) {
							return user;
						}
					} catch {
						// Skip this user
					}
				}
			}
		}
		
		return null;
	} else {
		// JSON mode
		const db = getDatabase();
		
		for (const u of db.users.values()) {
			try {
				const decryptedEmail = decryptMessage(u.email);
				if (decryptedEmail.toLowerCase() === normalizedEmail) {
					return u;
				}
			} catch {
				// Fallback: IV-based comparison
				if (typeof u.email === 'string' && u.email.includes(':')) {
					try {
						const [ivHex] = u.email.split(':');
						const iv = Buffer.from(ivHex, 'hex');
						const encryptedInput = encryptMessageWithIV(normalizedEmail, iv);
						if (encryptedInput === u.email) {
							return u;
						}
					} catch {
						// Skip this user
					}
				}
			}
		}
		
		return null;
	}
}

