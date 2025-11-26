# Fix Your Email Configuration

## Issue Found

Your `.env` file has:
1. **Spaces in the app password** - Gmail app passwords should NOT have spaces
2. **Duplicate SMTP entries** - This can cause confusion

## Fix Steps

### 1. Remove Spaces from App Password

Your current password: `tvar lsep wnwk ulyl`

**Should be**: `tvarlsepwnwkulyl` (remove all spaces)

### 2. Clean Up .env File

Remove duplicate entries. Your `.env` should have **only one set** of SMTP variables:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=femtaifantasies@gmail.com
SMTP_PASS=tvarlsepwnwkulyl
SMTP_FROM=femtaifantasies@gmail.com
FRONTEND_URL=http://localhost:5173
```

### 3. Important Notes

- **SMTP_PASS**: Remove ALL spaces from the app password
- **SMTP_FROM**: Should match your Gmail address (or be a verified sender)
- **No duplicates**: Only one set of SMTP variables

### 4. Test After Fixing

After updating your `.env` file:

1. **Restart your server** (important - env vars are loaded at startup)
2. **Test the email endpoint**:
   ```bash
   curl -X POST http://localhost:3001/api/email/test-email \
     -H "Content-Type: application/json" \
     -d '{"email": "your-test-email@gmail.com"}'
   ```
3. **Check server logs** for detailed error messages

### 5. If Still Not Working

Check the server logs for:
- `✅ SMTP connection verified` = Good!
- `❌ Failed to send` = Check error message

Common issues:
- **EAUTH error** = Wrong password (make sure no spaces)
- **ETIMEDOUT** = Firewall blocking port 587
- **ECONNREFUSED** = Wrong host/port

See `EMAIL_TROUBLESHOOTING.md` for more help.

