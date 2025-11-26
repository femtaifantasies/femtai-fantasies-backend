# Password Reset System Setup

The password reset system has been fully implemented and works with both JSON and PostgreSQL databases.

## Features

✅ **Email Sending**: Uses nodemailer with SMTP configuration  
✅ **Database Support**: Works with both JSON files and PostgreSQL (Prisma)  
✅ **Security**: Tokens expire after 1 hour, prevents email enumeration  
✅ **HTML Emails**: Beautiful HTML email templates with reset links  
✅ **Error Handling**: Graceful fallbacks and error messages  

## Configuration

### Required Environment Variables

Add these to your `.env` file:

```env
# SMTP Configuration (for sending emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@femtaifantasies.com

# Frontend URL (for reset links)
FRONTEND_URL=http://localhost:5173
```

### Gmail Setup

If using Gmail:

1. **Enable 2-Factor Authentication** on your Google account
2. **Generate App Password**:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Copy the 16-character password
   - Use this as `SMTP_PASS` (not your regular Gmail password)

3. **Configure `.env`**:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-16-char-app-password
   SMTP_FROM=your-email@gmail.com
   ```

### Other Email Providers

**SendGrid**:
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=noreply@femtaifantasies.com
```

**Mailgun**:
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your-mailgun-password
SMTP_FROM=noreply@femtaifantasies.com
```

**Outlook/Office 365**:
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
SMTP_FROM=your-email@outlook.com
```

## Development Mode

If SMTP is not configured, the system will:
- Log email details to console
- Still create reset tokens
- Show a warning message

This allows development without email setup.

## How It Works

### 1. Forgot Password Flow

1. User enters email on `/forgot-password` page
2. System finds user by email (decrypts if needed)
3. Generates secure reset token (32 bytes, hex)
4. Stores token in database with 1-hour expiration
5. Sends HTML email with reset link
6. Always returns success (prevents email enumeration)

### 2. Reset Password Flow

1. User clicks link in email: `/reset-password?token=...`
2. Frontend extracts token from URL
3. User enters new password
4. System validates:
   - Token exists and is valid
   - Token hasn't expired
   - Password meets requirements (8+ chars, uppercase, lowercase, number)
5. Updates user password
6. Re-encrypts email/username with current key (if possible)
7. Deletes used token
8. Returns success message

## API Endpoints

### POST `/api/auth/forgot-password`

**Request**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

### POST `/api/auth/reset-password`

**Request**:
```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewSecurePassword123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Password has been reset successfully. You can now login with your new password."
}
```

## Testing

### Test Email Sending

1. Configure SMTP in `.env`
2. Start server: `npm run dev`
3. Request password reset via frontend or API
4. Check email inbox (or console logs if SMTP not configured)

### Test Without Email

1. Request password reset
2. Check server console for reset token and URL
3. Manually visit the reset URL
4. Enter new password

## Troubleshooting

### Email Not Sending

**Check**:
- SMTP credentials are correct
- SMTP_HOST and SMTP_PORT are correct
- Firewall allows outbound SMTP connections
- App password is used (for Gmail), not regular password

**Debug**:
- Check server logs for email errors
- Test SMTP connection with a simple script
- Verify email provider allows SMTP from your IP

### Token Not Working

**Check**:
- Token hasn't expired (1 hour limit)
- Token matches exactly (no extra spaces)
- Database connection is working
- Token wasn't already used

### User Not Found

**Check**:
- Email is correct (case-insensitive)
- User exists in database
- Email encryption/decryption is working

## Security Features

1. **Token Expiration**: Tokens expire after 1 hour
2. **One-Time Use**: Tokens are deleted after use
3. **Email Enumeration Prevention**: Always returns success message
4. **Secure Token Generation**: Uses crypto.randomBytes(32)
5. **Password Strength**: Requires uppercase, lowercase, and number
6. **Encrypted Storage**: User emails are encrypted in database

## Database Support

The system automatically works with:
- **JSON files** (development, fallback)
- **PostgreSQL** (production, via Prisma)

No code changes needed - the database adapter handles both automatically.

