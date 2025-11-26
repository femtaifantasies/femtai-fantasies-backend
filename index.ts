import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { printEnvironmentStatus } from './utils/envValidation.js';
import { loadDatabase } from './data/database.js';
import { initializeDatabase } from './data/databaseAdapter.js';

import authRoutes from './routes/auth.js';
import cardRoutes from './routes/cards.js';
import setRoutes from './routes/sets.js';
import profileRoutes from './routes/profile.js';
import purchaseRoutes from './routes/purchase.js';
import tradeRoutes from './routes/trade.js';
import stripeRoutes from './routes/stripe.js';
import followRoutes from './routes/follow.js';
import friendRequestRoutes from './routes/friendRequests.js';
import adminRoutes from './routes/admin.js';
import characterRoutes from './routes/characters.js';
import messageRoutes from './routes/messages.js';
import reportRoutes from './routes/reports.js';
import notificationRoutes from './routes/notifications.js';
import savedChatRoutes from './routes/savedChats.js';
import emailTestRoutes from './routes/emailTest.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
	origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
	credentials: true,
}));
app.use(cookieParser());

// Stripe webhook needs raw body - must be before json parser
app.post('/api/stripe/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res, next) => {
	// Let the stripe route handle it
	next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
	console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
	next();
});

// Health check
app.get('/health', (req, res) => {
	res.json({ status: 'ok' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/sets', setRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/trade', tradeRoutes);
app.use('/api/follow', followRoutes);
app.use('/api/friend-requests', friendRequestRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/saved-chats', savedChatRoutes);
// Stripe routes (webhook must be registered before stripeRoutes)
app.use('/api/stripe', stripeRoutes);
// Email test route (for debugging SMTP configuration)
app.use('/api/email', emailTestRoutes);

// 404 handler
app.use((req, res) => {
	res.status(404).json({ error: 'Route not found', path: req.path });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
	console.error('Error:', err);
	console.error('Stack:', err.stack);
	res.status(500).json({ error: 'Internal server error' });
});

async function startServer() {
	try {
		// Validate environment variables before starting
		printEnvironmentStatus();
		
		// Initialize database (Prisma or JSON)
		await initializeDatabase();
		
		// Also load JSON database for fallback compatibility
		await loadDatabase();
		console.log('✅ Database initialized successfully');

		app.listen(PORT, () => {
			console.log(`🚀 Server running on http://localhost:${PORT}`);
			console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
			console.log(`💚 Health check: http://localhost:${PORT}/health`);
		});
	} catch (error) {
		console.error('❌ Failed to start server:', error);
		process.exit(1);
	}
}

startServer();

