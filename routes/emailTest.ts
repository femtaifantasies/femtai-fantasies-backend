/**
 * Email Test Route
 * Use this to test SMTP configuration
 */

import { Router, Request, Response } from 'express';
import { sendPasswordResetEmail } from '../utils/email.js';

const router = Router();

// Test email endpoint (for debugging)
router.post('/test-email', async (req: Request, res: Response) => {
	try {
		const { email } = req.body;

		if (!email || typeof email !== 'string') {
			return res.status(400).json({ error: 'Email is required' });
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email.trim())) {
			return res.status(400).json({ error: 'Invalid email format' });
		}

		console.log('🧪 Testing email configuration...');
		console.log(`   SMTP_HOST: ${process.env.SMTP_HOST || 'NOT SET'}`);
		console.log(`   SMTP_PORT: ${process.env.SMTP_PORT || 'NOT SET'}`);
		console.log(`   SMTP_USER: ${process.env.SMTP_USER ? 'SET' : 'NOT SET'}`);
		console.log(`   SMTP_PASS: ${process.env.SMTP_PASS ? 'SET' : 'NOT SET'}`);
		console.log(`   SMTP_FROM: ${process.env.SMTP_FROM || 'NOT SET'}`);

		// Send test email
		const testToken = 'test-token-12345';
		const testUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${testToken}`;

		await sendPasswordResetEmail(email.trim(), testToken, testUrl);

		res.json({
			success: true,
			message: 'Test email sent! Check your inbox and server logs for details.',
		});
	} catch (error: any) {
		console.error('Test email error:', error);
		res.status(500).json({
			error: 'Failed to send test email',
			details: error.message,
		});
	}
});

export default router;

