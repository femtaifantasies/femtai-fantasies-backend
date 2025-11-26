/**
 * Script to set admin status for a user
 * Usage: 
 *   npx tsx server/scripts/setAdmin.ts <email|userId> [true|false]
 * 
 * Examples:
 *   npx tsx server/scripts/setAdmin.ts user@example.com true
 *   npx tsx server/scripts/setAdmin.ts abc123-def456-ghi789 false
 */

import { initializeDatabase } from '../data/databaseAdapter.js';
import { getUser, getAllUsers, updateUser } from '../data/databaseAdapter.js';
import { findUserByEmail } from '../utils/userEmailHelper.js';
import { encryptIsAdmin } from '../utils/userHelpers.js';

async function setAdminStatus(identifier: string, isAdmin: boolean) {
	try {
		// Initialize database connection
		await initializeDatabase();
		console.log('✅ Database initialized');

		// Try to find user by email first, then by ID
		let user = await findUserByEmail(identifier);
		
		if (!user) {
			// Try by user ID
			user = await getUser(identifier);
		}

		if (!user) {
			console.error(`❌ User not found: ${identifier}`);
			console.log('\n📋 Available users:');
			const allUsers = await getAllUsers();
			for (const u of allUsers.slice(0, 10)) {
				// Decrypt email for display (simplified - just show ID if decryption fails)
				try {
					const { decryptMessage } = await import('../utils/encryption.js');
					const email = decryptMessage(u.email);
					console.log(`  - ${u.id} (${email})`);
				} catch {
					console.log(`  - ${u.id}`);
				}
			}
			if (allUsers.length > 10) {
				console.log(`  ... and ${allUsers.length - 10} more users`);
			}
			process.exit(1);
		}

		// Encrypt the admin status
		const encryptedAdminStatus = encryptIsAdmin(isAdmin);

		// Update the user
		await updateUser(user.id, {
			isAdmin: encryptedAdminStatus,
		});

		console.log(`✅ Successfully ${isAdmin ? 'granted' : 'revoked'} admin access for user: ${user.id}`);
		
		// Try to show email for confirmation
		try {
			const { decryptMessage } = await import('../utils/encryption.js');
			const email = decryptMessage(user.email);
			console.log(`   Email: ${email}`);
		} catch {
			console.log(`   (Email decryption unavailable for confirmation)`);
		}

		process.exit(0);
	} catch (error) {
		console.error('❌ Error setting admin status:', error);
		process.exit(1);
	}
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 1 || args.length > 2) {
	console.error('Usage: npx tsx server/scripts/setAdmin.ts <email|userId> [true|false]');
	console.error('\nExamples:');
	console.error('  npx tsx server/scripts/setAdmin.ts user@example.com true');
	console.error('  npx tsx server/scripts/setAdmin.ts abc123-def456-ghi789 false');
	console.error('\nNote: If [true|false] is omitted, defaults to true');
	process.exit(1);
}

const identifier = args[0];
const isAdmin = args.length === 2 ? args[1].toLowerCase() === 'true' : true;

setAdminStatus(identifier, isAdmin);

