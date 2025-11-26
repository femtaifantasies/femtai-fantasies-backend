# Database Integration Fix

## Problem
User registration and login were only saving to JSON files, not PostgreSQL database.

## Solution
Updated all authentication routes to use the database adapter, which automatically works with both JSON (fallback) and PostgreSQL (Prisma).

## Changes Made

### 1. Registration Route (`/api/auth/register`)
- ✅ Now uses `findUserByEmail()` instead of manual JSON search
- ✅ Now uses `createUser()` instead of `db.users.set()`
- ✅ Works with both JSON and PostgreSQL automatically

### 2. Login Route (`/api/auth/login`)
- ✅ Now uses `findUserByEmail()` instead of manual JSON search
- ✅ Now uses `updateUser()` instead of `db.users.set()`
- ✅ Daily mana reload token grant now uses database adapter

### 3. Server Startup
- ✅ Initializes database adapter on startup
- ✅ Verifies Prisma connection if DATABASE_URL is set
- ✅ Falls back to JSON if DATABASE_URL is not set

## How to Verify

### 1. Check Database Mode
When you start the server, you should see:
```
📦 Database mode: PRISMA
✅ Connected to PostgreSQL database
✅ Database initialized successfully
```

Or if DATABASE_URL is not set:
```
📦 Database mode: JSON
✅ Loaded JSON file database
✅ Database initialized successfully
```

### 2. Test Registration
1. Register a new user via the frontend or API
2. Check server logs for:
   ```
   📝 Creating user in PostgreSQL: <user-id>
   ✅ User created in PostgreSQL: <user-id>
   ```

3. Verify in PostgreSQL:
   ```sql
   SELECT id, email, "manaReloadTokens", "createdAt" FROM users ORDER BY "createdAt" DESC LIMIT 5;
   ```

### 3. Test Login
1. Login with the new user
2. Check that user data is retrieved from PostgreSQL
3. Verify daily token grant works

## Database Adapter Behavior

The database adapter automatically:
- **Detects** if `DATABASE_URL` is set
- **Uses Prisma** if DATABASE_URL is set
- **Falls back to JSON** if DATABASE_URL is not set
- **No code changes needed** - it's transparent

## Troubleshooting

### Users Not Appearing in PostgreSQL

1. **Check DATABASE_URL**:
   ```bash
   cd server
   node -e "require('dotenv').config(); console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');"
   ```

2. **Check Server Logs**:
   - Look for "Database mode: PRISMA" or "Database mode: JSON"
   - Look for "Creating user in PostgreSQL" messages

3. **Verify Prisma Connection**:
   ```bash
   cd server
   npx prisma studio
   ```
   This opens a GUI to view your database.

4. **Check Database Directly**:
   ```sql
   -- Connect to your PostgreSQL database
   SELECT COUNT(*) FROM users;
   SELECT id, email, "createdAt" FROM users ORDER BY "createdAt" DESC LIMIT 10;
   ```

### Still Using JSON Files?

If you see "Database mode: JSON" in logs:
- Check that `DATABASE_URL` is set in `.env`
- Restart the server (env vars load at startup)
- Verify DATABASE_URL format: `postgresql://user:password@host:port/database`

## Next Steps

All authentication operations now work with PostgreSQL:
- ✅ User registration
- ✅ User login
- ✅ Password reset
- ✅ User updates

Other routes may still need updating. Check each route to ensure it uses the database adapter functions instead of direct JSON file access.

