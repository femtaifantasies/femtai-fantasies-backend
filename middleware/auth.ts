import { Request, Response, NextFunction } from 'express';
import { getUser } from '../data/databaseAdapter.js';
import { verifyToken } from '../utils/jwt.js';
import { isUserAdmin } from '../utils/userHelpers.js';

// Extend Express Request to include userId
declare global {
	namespace Express {
		interface Request {
			userId?: string;
		}
	}
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
	// Try to get token from cookie first (preferred method)
	let token = req.cookies?.authToken;
	
	// Fallback to header for backward compatibility
	if (!token) {
		token = req.headers['x-auth-token'] as string;
	}
	
	// Legacy support: check for userId in header
	if (!token) {
		const userId = req.headers['x-user-id'] as string;
		if (userId) {
			req.userId = userId;
			return next();
		}
	}
	
	if (!token) {
		return res.status(401).json({ error: 'Authentication required' });
	}

	// Verify token
	const payload = verifyToken(token);
	if (!payload) {
		return res.status(401).json({ error: 'Invalid or expired token' });
	}

	req.userId = payload.userId;
	next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
	// Try to get token from cookie first
	let token = req.cookies?.authToken;
	
	// Fallback to header
	if (!token) {
		token = req.headers['x-auth-token'] as string;
	}
	
	// Legacy support
	if (!token) {
		const userId = req.headers['x-user-id'] as string;
		if (userId) {
			try {
				const user = await getUser(userId);
				if (!user) {
					return res.status(404).json({ error: 'User not found' });
				}
				if (!isUserAdmin(user)) {
					return res.status(403).json({ error: 'Admin access required' });
				}
				req.userId = userId;
				return next();
			} catch (error) {
				console.error('Error fetching user in requireAdmin (legacy):', error);
				return res.status(500).json({ error: 'Internal server error' });
			}
		}
	}
	
	if (!token) {
		return res.status(401).json({ error: 'Authentication required' });
	}

	// Verify token
	const payload = verifyToken(token);
	if (!payload) {
		return res.status(401).json({ error: 'Invalid or expired token' });
	}

	try {
		const user = await getUser(payload.userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}
		
		if (!isUserAdmin(user)) {
			return res.status(403).json({ error: 'Admin access required' });
		}
		
		req.userId = payload.userId;
		next();
	} catch (error) {
		console.error('Error fetching user in requireAdmin:', error);
		return res.status(500).json({ error: 'Internal server error' });
	}
}

