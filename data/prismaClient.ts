/**
 * Prisma Client Singleton
 * Provides database access via Prisma ORM
 */

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient | null {
	if (prisma) {
		return prisma;
	}

	// Only initialize if DATABASE_URL is set
	if (!process.env.DATABASE_URL) {
		console.log('📝 DATABASE_URL not set - using JSON file storage (fallback mode)');
		return null;
	}

	try {
		prisma = new PrismaClient({
			log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
		});
		console.log('✅ Prisma Client initialized with PostgreSQL');
		return prisma;
	} catch (error) {
		console.error('❌ Failed to initialize Prisma Client:', error);
		console.warn('⚠️  Falling back to JSON file storage');
		return null;
	}
}

export async function disconnectPrisma(): Promise<void> {
	if (prisma) {
		await prisma.$disconnect();
		prisma = null;
	}
}

// Graceful shutdown
process.on('beforeExit', async () => {
	await disconnectPrisma();
});

