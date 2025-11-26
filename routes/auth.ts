import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
// Note: getDatabase/saveDatabase imports removed - using databaseAdapter instead
import { getUser, updateUser, createUser, createPasswordResetToken, findPasswordResetToken, deletePasswordResetTokenByToken } from '../data/databaseAdapter.js';
import { findUserByEmail } from '../utils/userEmailHelper.js';
import { UserProfile } from '../types.js';
import { generateToken, verifyToken } from '../utils/jwt.js';
import { encryptMessage, decryptMessage, encryptMessageWithIV } from '../utils/encryption.js';
import { decryptUserData } from '../utils/userHelpers.js';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
	try {
		const { email, password, username } = req.body;
		
		if (!email || typeof email !== 'string' || email.trim().length === 0) {
			return res.status(400).json({ error: 'Email is required' });
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email.trim())) {
			return res.status(400).json({ error: 'Invalid email format' });
		}
		
		if (!password || typeof password !== 'string' || password.length < 8) {
			return res.status(400).json({ error: 'Password is required and must be at least 8 characters' });
		}

		// Validate password strength
		const hasUpperCase = /[A-Z]/.test(password);
		const hasLowerCase = /[a-z]/.test(password);
		const hasNumber = /[0-9]/.test(password);
		if (!hasUpperCase || !hasLowerCase || !hasNumber) {
			return res.status(400).json({ error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' });
		}

		// Check for existing user (works with both JSON and Prisma)
		const normalizedEmail = email.trim().toLowerCase();
		const existingUser = await findUserByEmail(normalizedEmail);
		
		if (existingUser) {
			return res.status(409).json({ error: 'Email already registered' });
		}

		// Hash password with bcrypt (best practice)
		const passwordHash = await bcrypt.hash(password, 12); // Increased salt rounds for better security

		// Encrypt email before storing (best practice for PII)
		const encryptedEmail = encryptMessage(normalizedEmail);

		// Generate UUID v4 for user ID (best practice for unique identifiers)
		const userId = uuid();

		// Encrypt username if provided (optional display name)
		const encryptedUsername = username && username.trim().length > 0 
			? encryptMessage(username.trim()) 
			: undefined;

		const user: UserProfile = {
			id: userId, // UUID v4 - unique identifier
			email: encryptedEmail, // Encrypted email - primary identifier
			username: encryptedUsername, // Optional encrypted display name
			passwordHash,
			manaReloadTokens: 1, // start with 1 token on registration
			manaIncreaseTokens: 0,
			lastLoginDate: new Date().toISOString().split('T')[0],
			collectionCardIds: [],
			collectionSetIds: [],
			followingIds: [],
			friendIds: [],
			friendRequestIds: [],
			profileImageUrl: `https://i.pravatar.cc/150?u=${normalizedEmail}`,
		};

		// Create user (works with both JSON and Prisma)
		await createUser(user);

		// Generate JWT token with encrypted email
		const token = generateToken(user.id, encryptedEmail);

		// Enforce max cap for reload tokens on registration (defensive against data drift)
		if (typeof user.manaReloadTokens === 'number') {
			user.manaReloadTokens = Math.min(10, Math.max(0, user.manaReloadTokens));
			await updateUser(user.id, { manaReloadTokens: user.manaReloadTokens });
		}

		// Set httpOnly cookie with encrypted token
		res.cookie('authToken', token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
			sameSite: 'strict',
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
			path: '/',
		});

		// Return user with decrypted data
		const userResponse = decryptUserData(user);
		res.status(201).json(userResponse);
	} catch (error) {
		console.error('Register error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

router.post('/login', async (req: Request, res: Response) => {
	try {
		const { email, password } = req.body;
		
		if (!email || typeof email !== 'string') {
			return res.status(400).json({ error: 'Email is required' });
		}
		
		if (!password || typeof password !== 'string') {
			return res.status(400).json({ error: 'Password is required' });
		}

		// Find user by email (works with both JSON and Prisma)
		const normalizedEmail = email.trim().toLowerCase();
		const user = await findUserByEmail(normalizedEmail);
		
		if (!user) {
			console.error('Login failed: No user found with email:', normalizedEmail);
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		// Check if user has passwordHash (migration support)
		if (!user.passwordHash) {
			return res.status(401).json({ error: 'Please re-register with a password. Your account needs to be migrated.' });
		}

		// Verify password using bcrypt (best practice)
		const isValidPassword = await bcrypt.compare(password, user.passwordHash);
		if (!isValidPassword) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		// Re-encrypt username with current key if it exists and can be decrypted
		if (user.username) {
			try {
				// Try to decrypt with current key
				let decryptedUsername: string;
				try {
					if (user.username.includes(':')) {
						decryptedUsername = decryptMessage(user.username);
					} else {
						// Already plain text
						decryptedUsername = user.username;
					}
					// Re-encrypt with current key to ensure consistency
					await updateUser(user.id, { username: encryptMessage(decryptedUsername) });
					console.log('✅ Re-encrypted username with current key during login');
				} catch (decryptError: any) {
					// If decryption fails, the username was encrypted with a different key
					// Clear it so user can set a new one
					console.warn('Could not decrypt username for user during login. Clearing undecryptable username.');
					await updateUser(user.id, { username: undefined });
				}
			} catch (error: any) {
				console.error('Error re-encrypting username during login:', error);
			}
		}

		// Generate JWT token with encrypted email
		const token = generateToken(user.id, user.email);

		// Daily mana reload token grant (max stack 5)
		try {
			const today = new Date().toISOString().split('T')[0];
			const currentUser = await getUser(user.id);
			if (currentUser && currentUser.lastLoginDate !== today) {
				const newTokenCount = Math.min(5, (currentUser.manaReloadTokens || 0) + 1);
				await updateUser(user.id, {
					manaReloadTokens: newTokenCount,
					lastLoginDate: today,
				});
			}
		} catch (e) {
			console.warn('Daily mana reload grant failed (non-fatal):', e);
		}

		// Set httpOnly cookie with encrypted token
		res.cookie('authToken', token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
			sameSite: 'strict',
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
			path: '/',
		});

		// Return user with decrypted data
		const userResponse = decryptUserData(user);
		res.json(userResponse);
	} catch (error) {
		console.error('Login error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Logout endpoint - clears the auth cookie
router.post('/logout', (req: Request, res: Response) => {
	res.clearCookie('authToken', {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		path: '/',
	});
	res.json({ success: true });
});

// Verify token endpoint - checks if user is authenticated
router.get('/verify', async (req: Request, res: Response) => {
	try {
		const token = req.cookies?.authToken;
		if (!token) {
			return res.status(401).json({ error: 'No token provided' });
		}

		const payload = verifyToken(token);
		if (!payload) {
			return res.status(401).json({ error: 'Invalid token' });
		}

		const user = await getUser(payload.userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Re-encrypt username with current key if it exists and can be decrypted
		if (user.username) {
			try {
				// Try to decrypt with current key
				let decryptedUsername: string;
				try {
					if (user.username.includes(':')) {
						decryptedUsername = decryptMessage(user.username);
					} else {
						// Already plain text
						decryptedUsername = user.username;
					}
					// Re-encrypt with current key to ensure consistency
					await updateUser(user.id, { username: encryptMessage(decryptedUsername) });
					console.log('✅ Re-encrypted username with current key during verify');
				} catch (decryptError: any) {
					// If decryption fails, the username was encrypted with a different key
					// Clear it so user can set a new one
					console.warn('Could not decrypt username for user during verify. Clearing undecryptable username.');
					await updateUser(user.id, { username: undefined });
				}
			} catch (error: any) {
				console.error('Error re-encrypting username during verify:', error);
			}
		}

		// Return user with decrypted data
		res.json(decryptUserData(user));
	} catch (error) {
		console.error('Verify token error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Refresh token endpoint - generates a new token
router.post('/refresh', async (req: Request, res: Response) => {
	try {
		const token = req.cookies?.authToken;
		if (!token) {
			return res.status(401).json({ error: 'No token provided' });
		}

		const payload = verifyToken(token);
		if (!payload) {
			return res.status(401).json({ error: 'Invalid token' });
		}

		const user = await getUser(payload.userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Generate new token with encrypted email
		const newToken = generateToken(user.id, user.email);

		// Set new cookie
		res.cookie('authToken', newToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict',
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
			path: '/',
		});

		res.json({ success: true });
	} catch (error) {
		console.error('Refresh token error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Forgot password endpoint - sends reset email
router.post('/forgot-password', async (req: Request, res: Response) => {
	try {
		const { email } = req.body;
		
		if (!email || typeof email !== 'string') {
			return res.status(400).json({ error: 'Email is required' });
		}

		const normalizedEmail = email.trim().toLowerCase();
		
		// Find user by email (works with both JSON and Prisma)
		const user = await findUserByEmail(normalizedEmail);
		
		// Always return success to prevent email enumeration
		// But only send email if user exists
		if (user) {
			// Generate reset token
			const resetToken = crypto.randomBytes(32).toString('hex');
			const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
			
			// Create token (this will automatically delete existing tokens for the user)
			await createPasswordResetToken(user.id, resetToken, expiresAt);
			
			// Send reset email
			const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
			const { sendPasswordResetEmail } = await import('../utils/email.js');
			
			// Send email (errors are handled inside the function)
			await sendPasswordResetEmail(normalizedEmail, resetToken, resetUrl).catch((emailError: any) => {
				// Additional error logging at route level
				console.error('Route-level email error:', emailError);
			});
		}
		
		// Always return success (security best practice)
		res.json({ 
			success: true, 
			message: 'If an account with that email exists, a password reset link has been sent.' 
		});
	} catch (error: any) {
		console.error('Forgot password error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Reset password endpoint - validates token and updates password
router.post('/reset-password', async (req: Request, res: Response) => {
	try {
		const { token, newPassword } = req.body;
		
		if (!token || typeof token !== 'string') {
			return res.status(400).json({ error: 'Reset token is required' });
		}
		
		if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
			return res.status(400).json({ error: 'Password must be at least 8 characters' });
		}

		// Validate password strength
		const hasUpperCase = /[A-Z]/.test(newPassword);
		const hasLowerCase = /[a-z]/.test(newPassword);
		const hasNumber = /[0-9]/.test(newPassword);
		if (!hasUpperCase || !hasLowerCase || !hasNumber) {
			return res.status(400).json({ error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' });
		}

		// Find valid reset token (works with both JSON and Prisma)
		const tokenRecord = await findPasswordResetToken(token);
		
		if (!tokenRecord) {
			return res.status(400).json({ error: 'Invalid or expired reset token' });
		}
		
		// Check if expired
		if (new Date(tokenRecord.expiresAt) < new Date()) {
			await deletePasswordResetTokenByToken(token);
			return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
		}
		
		// Find user (works with both JSON and Prisma)
		const user = await getUser(tokenRecord.userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}
		
		// Hash new password
		const passwordHash = await bcrypt.hash(newPassword, 12);
		
		// Re-encrypt email and username with current key (this fixes decryption issues)
		let decryptedEmail: string | null = null;
		try {
			decryptedEmail = decryptMessage(user.email);
		} catch {
			console.warn('Could not decrypt email for user during password reset. Email will not be re-encrypted.');
		}
		
		// Prepare user updates
		const updates: Partial<UserProfile> = {
			passwordHash,
		};
		
		// Only re-encrypt if we successfully decrypted
		if (decryptedEmail) {
			updates.email = encryptMessage(decryptedEmail.toLowerCase());
			console.log('✅ Re-encrypted email with current key during password reset');
		}
		
		// Re-encrypt username with current key if it exists
		if (user.username) {
			try {
				let decryptedUsername: string;
				if (user.username.includes(':')) {
					decryptedUsername = decryptMessage(user.username);
				} else {
					decryptedUsername = user.username;
				}
				updates.username = encryptMessage(decryptedUsername);
				console.log('✅ Re-encrypted username with current key during password reset');
			} catch {
				console.warn('Could not decrypt/re-encrypt username during password reset.');
			}
		}
		
		// Update user (works with both JSON and Prisma)
		await updateUser(user.id, updates);
		
		// Remove used token
		await deletePasswordResetTokenByToken(token);
		
		res.json({ success: true, message: 'Password has been reset successfully. You can now login with your new password.' });
	} catch (error: any) {
		console.error('Reset password error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Diagnostic endpoint to check encryption key (for debugging)
router.get('/debug/key', async (req: Request, res: Response) => {
	try {
		const { decryptMessage } = require('../utils/encryption.js');
		const { getAllUsers } = await import('../data/databaseAdapter.js');
		const allUsers = await getAllUsers();
		const testUser = allUsers[0];
		
		if (!testUser || !testUser.email) {
			return res.json({ 
				error: 'No test user found',
				keySource: process.env.ENCRYPTION_KEY ? 'environment' : 'file or default'
			});
		}
		
		try {
			const decrypted = decryptMessage(testUser.email);
			res.json({
				success: true,
				decryptedEmail: decrypted,
				encryptedEmailPreview: testUser.email.substring(0, 50) + '...',
				keySource: process.env.ENCRYPTION_KEY ? 'environment' : 'file or default'
			});
		} catch (error: any) {
			res.json({
				success: false,
				error: error?.message || 'Decryption failed',
				encryptedEmailPreview: testUser.email.substring(0, 50) + '...',
				keySource: process.env.ENCRYPTION_KEY ? 'environment' : 'file or default'
			});
		}
	} catch (error: any) {
		res.status(500).json({ error: error?.message || 'Internal error' });
	}
});

export default router;

