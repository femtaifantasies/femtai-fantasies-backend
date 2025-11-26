import jwt from 'jsonwebtoken';
import { encryptMessage, decryptMessage } from './encryption.js';

// Validate JWT_SECRET is set in production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || (process.env.NODE_ENV === 'production' && JWT_SECRET === 'your-secret-key-change-in-production')) {
	if (process.env.NODE_ENV === 'production') {
		throw new Error('❌ CRITICAL: JWT_SECRET must be set in environment variables for production deployment');
	}
	console.warn('⚠️  WARNING: JWT_SECRET not set. Using default (NOT SECURE FOR PRODUCTION)');
}

const JWT_SECRET_FINAL = JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h'; // 24 hours

export interface TokenPayload {
	userId: string; // UUID v4 - unique identifier
	email: string; // Encrypted email for authentication
}

/**
 * Generate a JWT token for a user
 * Uses UUID v4 for userId (best practice) and encrypted email for authentication
 */
export function generateToken(userId: string, email: string): string {
	const payload: TokenPayload = {
		userId,
		email, // Store encrypted email in token
	};
	
	// Sign the JWT token
	const token = jwt.sign(payload, JWT_SECRET_FINAL, {
		expiresIn: JWT_EXPIRES_IN,
	});
	
	// Encrypt the token string itself for additional security
	return encryptMessage(token);
}

/**
 * Verify and decrypt a JWT token
 */
export function verifyToken(encryptedToken: string): TokenPayload | null {
	try {
		// Decrypt the token first
		const decryptedToken = decryptMessage(encryptedToken);
		
		// Verify the JWT
		const decoded = jwt.verify(decryptedToken, JWT_SECRET_FINAL) as TokenPayload;
		return decoded;
	} catch (error) {
		console.error('Token verification error:', error);
		return null;
	}
}

/**
 * Get token expiration time (24 hours from now)
 */
export function getTokenExpiration(): Date {
	const expiration = new Date();
	expiration.setHours(expiration.getHours() + 24);
	return expiration;
}

