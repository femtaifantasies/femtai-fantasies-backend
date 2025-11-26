/**
 * Email utility for password reset
 * Supports SMTP configuration via environment variables
 */

import nodemailer from 'nodemailer';

interface EmailConfig {
	host: string;
	port: number;
	secure: boolean;
	auth: {
		user: string;
		pass: string;
	};
}

function getEmailConfig(): EmailConfig | null {
	// Check if SMTP is configured
	if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
		console.log('⚠️  SMTP not fully configured:');
		console.log(`   SMTP_HOST: ${process.env.SMTP_HOST || 'NOT SET'}`);
		console.log(`   SMTP_USER: ${process.env.SMTP_USER ? 'SET' : 'NOT SET'}`);
		console.log(`   SMTP_PASS: ${process.env.SMTP_PASS ? 'SET' : 'NOT SET'}`);
		return null;
	}

	const port = parseInt(process.env.SMTP_PORT || '587');
	const secure = port === 465;

	return {
		host: process.env.SMTP_HOST,
		port: port,
		secure: secure,
		auth: {
			user: process.env.SMTP_USER,
			pass: process.env.SMTP_PASS,
		},
	};
}

export async function sendPasswordResetEmail(email: string, resetToken: string, resetUrl: string): Promise<void> {
	const emailConfig = getEmailConfig();
	const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@femtaifantasies.com';

	// HTML email template
	const htmlMessage = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Password Reset Request</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
	<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
		<h1 style="color: white; margin: 0; font-size: 28px;">Femtai Fantasies</h1>
	</div>
	<div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
		<h2 style="color: #667eea; margin-top: 0;">Password Reset Request</h2>
		<p>You requested to reset your password for your Femtai Fantasies account.</p>
		<p>Click the button below to reset your password:</p>
		<div style="text-align: center; margin: 30px 0;">
			<a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">Reset Password</a>
		</div>
		<p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
		<p style="font-size: 12px; color: #999; word-break: break-all; background: #fff; padding: 10px; border-radius: 5px; border: 1px solid #e0e0e0;">${resetUrl}</p>
		<p style="font-size: 14px; color: #666;"><strong>This link will expire in 1 hour.</strong></p>
		<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
		<p style="font-size: 12px; color: #999; margin: 0;">If you did not request this password reset, please ignore this email. Your password will remain unchanged.</p>
	</div>
	<div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
		<p>© ${new Date().getFullYear()} Femtai Fantasies. All rights reserved.</p>
	</div>
</body>
</html>
	`.trim();

	// Plain text version
	const textMessage = `
Password Reset Request

You requested to reset your password for your Femtai Fantasies account.

Click the following link to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you did not request this password reset, please ignore this email. Your password will remain unchanged.

---
Femtai Fantasies
	`.trim();

	// If SMTP is configured, send actual email
	if (emailConfig) {
		try {
			console.log('📧 Attempting to send password reset email...');
			console.log(`   SMTP Host: ${emailConfig.host}`);
			console.log(`   SMTP Port: ${emailConfig.port}`);
			console.log(`   SMTP User: ${emailConfig.auth.user}`);
			console.log(`   From: ${fromEmail}`);
			console.log(`   To: ${email}`);

			const transporter = nodemailer.createTransport(emailConfig);

			// Verify SMTP connection before sending
			await transporter.verify();
			console.log('✅ SMTP connection verified');

			const info = await transporter.sendMail({
				from: fromEmail,
				to: email,
				subject: 'Password Reset Request - Femtai Fantasies',
				text: textMessage,
				html: htmlMessage,
			});

			console.log(`✅ Password reset email sent successfully!`);
			console.log(`   Message ID: ${info.messageId}`);
			console.log(`   Response: ${info.response}`);
		} catch (error: any) {
			console.error('❌ Failed to send password reset email:');
			console.error(`   Error Code: ${error.code}`);
			console.error(`   Error Message: ${error.message}`);
			if (error.response) {
				console.error(`   SMTP Response: ${error.response}`);
			}
			if (error.responseCode) {
				console.error(`   Response Code: ${error.responseCode}`);
			}
			
			// Log to console as fallback
			console.log('='.repeat(60));
			console.log('📧 PASSWORD RESET EMAIL (FALLBACK - SMTP FAILED)');
			console.log('='.repeat(60));
			console.log(`To: ${email}`);
			console.log(`Subject: Password Reset Request`);
			console.log(`Reset URL: ${resetUrl}`);
			console.log('='.repeat(60));
			
			// Don't throw error - allow the request to succeed even if email fails
			// This prevents email issues from blocking password reset requests
			console.warn('⚠️  Email sending failed, but password reset token was created. Check SMTP configuration.');
		}
	} else {
		// Development mode: log to console
		console.log('='.repeat(60));
		console.log('📧 PASSWORD RESET EMAIL (DEVELOPMENT MODE)');
		console.log('='.repeat(60));
		console.log(`To: ${email}`);
		console.log(`Subject: Password Reset Request`);
		console.log(`Reset Token: ${resetToken}`);
		console.log(`Reset URL: ${resetUrl}`);
		console.log('='.repeat(60));
		console.log(textMessage);
		console.log('='.repeat(60));
		console.log('⚠️  SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS to send actual emails.');
	}
}
