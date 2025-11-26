# Database Setup Guide

This guide covers setting up PostgreSQL with Prisma for Femtai Fantasies.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install Prisma and PostgreSQL client libraries.

### 2. Set Up Environment Variables

Copy the example env file:

```bash
cp env.example .env
```

Edit `.env` and set your `DATABASE_URL`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/femtaifantasies
```

### 3. Generate Prisma Client

```bash
npm run prisma:generate
```

This generates the TypeScript client from your Prisma schema.

### 4. Run Database Migrations

```bash
npm run prisma:migrate
```

This creates the database schema in your PostgreSQL database.

### 5. Migrate Existing Data (Optional)

If you have existing JSON data files, migrate them to PostgreSQL:

```bash
tsx scripts/migrateJsonToPostgres.ts
```

## Database Schema

The Prisma schema (`prisma/schema.prisma`) defines all database tables:

- **cards** - Individual card data
- **card_sets** - Card collections/sets
- **set_cards** - Junction table for sets and cards
- **characters** - Character information
- **users** - User accounts and profiles
- **user_cards** - User card collections (junction)
- **user_sets** - User set collections (junction)
- **trades** - Trade proposals
- **messages** - Encrypted user messages
- **reports** - User reports
- **notifications** - User notifications
- **saved_chats** - Saved chatbot conversations
- **friend_requests** - Friend request system
- **password_reset_tokens** - Password reset tokens
- **mana_states** - Card mana tracking

## Prisma Commands

```bash
# Generate Prisma Client
npm run prisma:generate

# Create a new migration
npm run prisma:migrate

# Deploy migrations (production)
npm run prisma:migrate:deploy

# Open Prisma Studio (database GUI)
npm run prisma:studio
```

## Migration from JSON Files

The migration script (`scripts/migrateJsonToPostgres.ts`) will:

1. Read all JSON files from `data/` directory
2. Import data into PostgreSQL tables
3. Preserve all relationships and IDs
4. Handle errors gracefully (continues on individual item failures)

**Important:** The migration uses `upsert` operations, so it's safe to run multiple times.

## Database Adapter

The application uses a database adapter (`data/databaseAdapter.ts`) that:

- **Automatically detects** if `DATABASE_URL` is set
- **Falls back** to JSON files if PostgreSQL is not available
- **Provides unified interface** for both storage methods

This means you can:
- Develop locally with JSON files (no database needed)
- Deploy to production with PostgreSQL
- Switch between modes by setting/unsetting `DATABASE_URL`

## Troubleshooting

### "Can't reach database server"

- Check `DATABASE_URL` is correct
- Verify PostgreSQL is running
- Check firewall/network settings
- Ensure database exists

### "Migration failed"

- Check database user has CREATE TABLE permissions
- Verify database is not locked
- Check Prisma schema is valid: `npx prisma validate`

### "Prisma Client not generated"

Run: `npm run prisma:generate`

### Connection Pool Errors

If you see "too many connections" errors:

1. Check your database connection limit
2. Ensure Prisma Client is a singleton (already handled in `prismaClient.ts`)
3. Close connections properly: `await prisma.$disconnect()`

## Production Considerations

### Connection Pooling

For production, consider using a connection pooler like PgBouncer or Supabase's built-in pooling.

### Backups

Set up automated backups for your PostgreSQL database:
- Supabase: Automatic daily backups
- Railway: Use backup feature
- Self-hosted: Use `pg_dump` in cron

### Performance

- Add indexes for frequently queried fields (already in schema)
- Monitor query performance with Prisma Studio
- Use `select` to limit fields returned
- Consider pagination for large datasets

## Next Steps

After setting up the database:

1. ✅ Run migrations
2. ✅ Migrate data (if needed)
3. ✅ Test database connection
4. ✅ Update application to use Prisma adapter
5. ✅ Deploy to production

See `DEPLOYMENT_GUIDE.md` for deployment instructions.
