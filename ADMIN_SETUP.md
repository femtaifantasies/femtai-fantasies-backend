# Admin Management System

This document explains how to set and manage admin users in the Femtai Fantasies application.

## Overview

Admin status is stored as an encrypted boolean value in the database. The system provides two methods to set admin status:

1. **Command-line script** (recommended for initial setup)
2. **Admin API endpoints** (for ongoing management)

## Method 1: Command-Line Script

### Usage

```bash
# From the server directory
npm run admin:set <email|userId> [true|false]
```

Or directly with tsx:

```bash
npx tsx server/scripts/setAdmin.ts <email|userId> [true|false]
```

### Examples

**Grant admin access by email:**
```bash
npm run admin:set user@example.com true
```

**Grant admin access by user ID:**
```bash
npm run admin:set abc123-def456-ghi789 true
```

**Revoke admin access:**
```bash
npm run admin:set user@example.com false
```

**Note:** If you omit `true|false`, it defaults to `true` (grant admin access).

### Features

- Works with both PostgreSQL and JSON database modes
- Automatically finds users by email or user ID
- Shows available users if the specified user is not found
- Encrypts admin status before storing in the database
- Provides clear success/error messages

## Method 2: Admin API Endpoints

These endpoints require admin authentication (you must be logged in as an admin).

### Set Admin by User ID

**Endpoint:** `PUT /api/admin/user/:userId/admin`

**Headers:**
- `Cookie: authToken=<your-admin-token>` OR
- `x-auth-token: <your-admin-token>`

**Body:**
```json
{
  "isAdmin": true
}
```

**Example:**
```bash
curl -X PUT http://localhost:3001/api/admin/user/abc123-def456-ghi789/admin \
  -H "Content-Type: application/json" \
  -H "Cookie: authToken=your-token-here" \
  -d '{"isAdmin": true}'
```

### Set Admin by Email

**Endpoint:** `PUT /api/admin/user/email/:email/admin`

**Headers:**
- `Cookie: authToken=<your-admin-token>` OR
- `x-auth-token: <your-admin-token>`

**Body:**
```json
{
  "isAdmin": true
}
```

**Example:**
```bash
curl -X PUT "http://localhost:3001/api/admin/user/email/user%40example.com/admin" \
  -H "Content-Type: application/json" \
  -H "Cookie: authToken=your-token-here" \
  -d '{"isAdmin": true}'
```

**Note:** Email must be URL-encoded in the path.

### List All Users

**Endpoint:** `GET /api/admin/users`

**Headers:**
- `Cookie: authToken=<your-admin-token>` OR
- `x-auth-token: <your-admin-token>`

**Response:**
```json
{
  "users": [
    {
      "id": "abc123-def456-ghi789",
      "email": "<encrypted>",
      "username": "<encrypted>",
      "isAdmin": "<encrypted>",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

This endpoint is useful for finding user IDs when you need to set admin status.

## Security Notes

1. **Admin status is encrypted** - The `isAdmin` field is stored as an encrypted string in the database, not as a plain boolean.

2. **Initial admin setup** - If you don't have any admin users yet, you'll need to:
   - Use the command-line script (Method 1) to set the first admin
   - Or manually update the database if you have direct access

3. **Database adapter** - The system automatically works with both PostgreSQL (via Prisma) and JSON file storage, depending on your `DATABASE_URL` environment variable.

## Troubleshooting

### "User not found" error

If you get a "User not found" error, the script will show you a list of available users. Make sure you're using:
- The correct email address (case-insensitive)
- The correct user ID (UUID format)

### "Admin access required" error (API)

If you get this error when using the API endpoints, make sure:
- You're logged in as an admin user
- Your auth token is valid and not expired
- You're sending the token in the correct header or cookie

### Database connection issues

Make sure:
- Your `.env` file has the correct `DATABASE_URL` (for PostgreSQL) or is empty (for JSON mode)
- The database is running and accessible
- You've run migrations if using PostgreSQL: `npm run db:migrate`

## Implementation Details

- **Encryption:** Admin status is encrypted using the same encryption system as other sensitive user data
- **Storage:** In PostgreSQL, stored as `TEXT` field. In JSON, stored as encrypted string
- **Validation:** The `isUserAdmin()` helper function decrypts and validates admin status
- **Middleware:** The `requireAdmin` middleware checks admin status before allowing access to admin routes

