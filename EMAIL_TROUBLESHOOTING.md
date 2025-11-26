# Email Troubleshooting Guide

## Quick Test

Test your email configuration with this endpoint:

```bash
curl -X POST http://localhost:3001/api/email/test-email \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email@gmail.com"}'
```

Or use Postman/Insomnia to send a POST request to:
- **URL**: `http://localhost:3001/api/email/test-email`
- **Body**: `{"email": "your-email@gmail.com"}`

## Common Gmail Issues

### 1. Not Using App Password

**Problem**: Using your regular Gmail password won't work.

**Solution**: 
1. Enable 2-Factor Authentication on your Google account
2. Go to https://myaccount.google.com/apppasswords
3. Generate a new app password for "Mail"
4. Use the 16-character password (no spaces) as `SMTP_PASS`

### 2. Wrong Port Configuration

**For Gmail**:
- Port `587` = TLS (recommended)
- Port `465` = SSL
- Port `25` = Usually blocked

**Your `.env` should have**:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=your-email@gmail.com
```

### 3. Check Server Logs

When you request a password reset, check your server console for:

✅ **Success**:
```
📧 Attempting to send password reset email...
   SMTP Host: smtp.gmail.com
   SMTP Port: 587
   ✅ SMTP connection verified
   ✅ Password reset email sent successfully!
```

❌ **Failure**:
```
❌ Failed to send password reset email:
   Error Code: EAUTH
   Error Message: Invalid login
```

### 4. Common Error Codes

| Error Code | Meaning | Solution |
|------------|--------|----------|
| `EAUTH` | Authentication failed | Use App Password, not regular password |
| `ETIMEDOUT` | Connection timeout | Check firewall, try port 465 |
| `ECONNREFUSED` | Connection refused | Check SMTP_HOST and SMTP_PORT |
| `EENVELOPE` | Invalid recipient | Check email format |

### 5. Firewall Issues

If emails aren't sending:
- Check if your firewall allows outbound connections on port 587
- Try port 465 (SSL) instead
- Check if your ISP blocks SMTP

### 6. Gmail Security Settings

Make sure:
- ✅ 2-Factor Authentication is enabled
- ✅ App Password is generated (not regular password)
- ✅ "Less secure app access" is NOT needed (deprecated)

## Testing Steps

1. **Check Environment Variables**:
   ```bash
   cd server
   node -e "require('dotenv').config(); console.log('SMTP_HOST:', process.env.SMTP_HOST);"
   ```

2. **Test Email Endpoint**:
   ```bash
   curl -X POST http://localhost:3001/api/email/test-email \
     -H "Content-Type: application/json" \
     -d '{"email": "your-email@gmail.com"}'
   ```

3. **Check Server Logs**:
   Look for detailed error messages in your server console

4. **Check Email Inbox**:
   - Check spam/junk folder
   - Wait a few minutes (Gmail can delay)
   - Verify the "From" address matches `SMTP_FROM`

## Alternative: Use Console Logging

If SMTP isn't working, the system will:
- Still create password reset tokens
- Log the reset URL to console
- Allow you to manually copy the link

Look for this in your server logs:
```
📧 PASSWORD RESET EMAIL (DEVELOPMENT MODE)
Reset URL: http://localhost:5173/reset-password?token=...
```

## Still Not Working?

1. **Verify SMTP credentials work**:
   - Try sending from a different email client (Thunderbird, Outlook)
   - If that works, the credentials are correct

2. **Check server logs**:
   - Look for the detailed error messages
   - The error code will tell you what's wrong

3. **Try a different email provider**:
   - SendGrid (free tier available)
   - Mailgun (free tier available)
   - AWS SES (pay-as-you-go)

4. **Contact support**:
   - Share the error message from server logs
   - Include your SMTP configuration (without passwords!)

