import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { getUser, getCard, getSet, updateUser, updateCard } from '../data/databaseAdapter.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Initialize Stripe with secret key from environment variable
let stripe: Stripe | null = null;

if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_your_secret_key_here') {
	stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
		apiVersion: '2024-11-20.acacia',
	});
	console.log('✅ Stripe initialized successfully');
} else {
	console.warn('⚠️  STRIPE_SECRET_KEY not set or using placeholder. Stripe checkout will not work.');
	console.warn('⚠️  Please set STRIPE_SECRET_KEY in server/.env file');
}

// Create checkout session for a card
router.post('/checkout/card/:cardId', requireAuth, async (req: Request, res: Response) => {
	try {
		// Check if Stripe is configured
		if (!stripe) {
			console.error('❌ Stripe not initialized. STRIPE_SECRET_KEY is missing or invalid.');
			return res.status(500).json({ 
				error: 'Payment service not configured. Please contact support.',
				details: 'STRIPE_SECRET_KEY not set in server/.env'
			});
		}

		const { cardId } = req.params;
		const userId = req.userId!;
		const { returnUrl } = req.body as { returnUrl?: string };

		// Get card and user (works with both JSON and Prisma)
		const card = await getCard(cardId);
		if (!card) {
			return res.status(404).json({ error: 'Card not found' });
		}

		const user = await getUser(userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Check if user already owns the card
		if (user.collectionCardIds.includes(cardId)) {
			return res.status(400).json({ error: 'Card already owned' });
		}

		// Build cancel URL with return path
		const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
		const cancelUrl = returnUrl 
			? `${frontendUrl}/checkout/cancel?returnUrl=${encodeURIComponent(returnUrl)}`
			: `${frontendUrl}/checkout/cancel`;

		// Create checkout session
		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			mode: 'payment',
			allow_promotion_codes: true,
			line_items: [
				{
					price_data: {
						currency: 'usd',
						product_data: {
							name: card.title,
							description: card.description,
							images: [card.imageUrl],
						},
						unit_amount: Math.round(card.cost * 100), // Convert to cents
					},
					quantity: 1,
				},
			],
			metadata: {
				userId,
				cardId,
				type: 'card',
			},
			success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: cancelUrl,
		});

		res.json({ sessionId: session.id, url: session.url });
	} catch (error: any) {
		console.error('❌ Stripe checkout error:', error);
		console.error('Error details:', {
			message: error.message,
			type: error.type,
			code: error.code,
			param: error.param,
			declineCode: error.decline_code,
			stack: error.stack
		});
		
		// Provide more helpful error messages
		let errorMessage = 'Failed to create checkout session';
		if (error.type === 'StripeInvalidRequestError') {
			if (error.message.includes('Invalid API Key')) {
				errorMessage = 'Invalid Stripe API key. Please check your STRIPE_SECRET_KEY in server/.env';
			} else {
				errorMessage = `Stripe API error: ${error.message}`;
			}
		}
		
		res.status(500).json({ 
			error: errorMessage,
			details: error.message || 'Unknown error',
			...(process.env.NODE_ENV === 'development' && { 
				type: error.type,
				code: error.code,
				stack: error.stack 
			})
		});
	}
});

// Create checkout session for a set
router.post('/checkout/set/:setId', requireAuth, async (req: Request, res: Response) => {
	try {
		// Check if Stripe is configured
		if (!stripe) {
			console.error('❌ Stripe not initialized. STRIPE_SECRET_KEY is missing or invalid.');
			return res.status(500).json({ 
				error: 'Payment service not configured. Please contact support.',
				details: 'STRIPE_SECRET_KEY not set in server/.env'
			});
		}

		const { setId } = req.params;
		const userId = req.userId!;
		const { returnUrl } = req.body as { returnUrl?: string };

		// Get set and user (works with both JSON and Prisma)
		const set = await getSet(setId);
		if (!set) {
			return res.status(404).json({ error: 'Set not found' });
		}

		const user = await getUser(userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Check if user already owns the set
		if (user.collectionSetIds.includes(setId)) {
			return res.status(400).json({ error: 'Set already owned' });
		}

		// Build cancel URL with return path
		const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
		const cancelUrl = returnUrl 
			? `${frontendUrl}/checkout/cancel?returnUrl=${encodeURIComponent(returnUrl)}`
			: `${frontendUrl}/checkout/cancel`;

		// Create checkout session
		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			mode: 'payment',
			allow_promotion_codes: true,
			line_items: [
				{
					price_data: {
						currency: 'usd',
						product_data: {
							name: set.name,
							description: set.description,
							images: [set.coverImageUrl || set.imageUrl],
						},
						unit_amount: Math.round(set.cost * 100), // Convert to cents
					},
					quantity: 1,
				},
			],
			metadata: {
				userId,
				setId,
				type: 'set',
			},
			success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: cancelUrl,
		});

		res.json({ sessionId: session.id, url: session.url });
	} catch (error: any) {
		console.error('❌ Stripe checkout error:', error);
		console.error('Error details:', {
			message: error.message,
			type: error.type,
			code: error.code,
			param: error.param,
			declineCode: error.decline_code,
			stack: error.stack
		});
		
		// Provide more helpful error messages
		let errorMessage = 'Failed to create checkout session';
		if (error.type === 'StripeInvalidRequestError') {
			if (error.message.includes('Invalid API Key')) {
				errorMessage = 'Invalid Stripe API key. Please check your STRIPE_SECRET_KEY in server/.env';
			} else {
				errorMessage = `Stripe API error: ${error.message}`;
			}
		}
		
		res.status(500).json({ 
			error: errorMessage,
			details: error.message || 'Unknown error',
			...(process.env.NODE_ENV === 'development' && { 
				type: error.type,
				code: error.code,
				stack: error.stack 
			})
		});
	}
});

// Purchase mana increase tokens ($2.00 each)
router.post('/checkout/mana-increase', requireAuth, async (req: Request, res: Response) => {
	try {
		if (!stripe) {
			return res.status(500).json({ error: 'Payment service not configured' });
		}
		const userId = req.userId!;
		const { quantity, returnUrl } = req.body as { quantity?: number; returnUrl?: string };
		const qty = Math.max(1, Math.min(20, quantity || 1)); // limit 1-20 per checkout

		// Build cancel URL with return path
		const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
		const cancelUrl = returnUrl 
			? `${frontendUrl}/checkout/cancel?returnUrl=${encodeURIComponent(returnUrl)}`
			: `${frontendUrl}/checkout/cancel`;

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			mode: 'payment',
			allow_promotion_codes: true,
			line_items: [
				{
					price_data: {
						currency: 'usd',
						product_data: {
							name: 'Mana Increase Token',
							description: 'Redeem to add +1 current mana (up to base) for a selected card.',
						},
						unit_amount: 200, // $2.00
					},
					quantity: qty,
				},
			],
			metadata: {
				userId,
				type: 'mana_increase',
				quantity: String(qty),
			},
			success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: cancelUrl,
		});

		res.json({ sessionId: session.id, url: session.url });
	} catch (error: any) {
		console.error('❌ Stripe mana increase checkout error:', error);
		res.status(500).json({ error: 'Failed to create checkout session' });
	}
});

// Purchase +1 mana directly for a specific card (applied on confirmation)
router.post('/checkout/mana-increase/card/:cardId', requireAuth, async (req: Request, res: Response) => {
	try {
		if (!stripe) {
			return res.status(500).json({ error: 'Payment service not configured' });
		}
		const userId = req.userId!;
		const { cardId } = req.params;
		const { quantity, returnUrl } = req.body as { quantity?: number; returnUrl?: string };
		const qty = Math.max(1, Math.min(20, quantity || 1)); // limit 1-20 per checkout

		// Get card (works with both JSON and Prisma)
		const card = await getCard(cardId);
		if (!card) {
			return res.status(404).json({ error: 'Card not found' });
		}

		// Build cancel URL with return path
		const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
		const cancelUrl = returnUrl 
			? `${frontendUrl}/checkout/cancel?returnUrl=${encodeURIComponent(returnUrl)}`
			: `${frontendUrl}/checkout/cancel`;

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			mode: 'payment',
			allow_promotion_codes: true,
			line_items: [
				{
					price_data: {
						currency: 'usd',
						product_data: {
							name: `+1 Mana for ${card.title}`,
							description: 'Immediately adds +1 current mana (up to base) to this card.',
						},
						unit_amount: 200, // $2.00
					},
					quantity: qty,
				},
			],
			metadata: {
				userId,
				cardId,
				type: 'mana_increase_card',
				quantity: String(qty),
			},
			success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&ptype=mana_increase_card&cardId=${encodeURIComponent(cardId)}`,
			cancel_url: cancelUrl,
		});

		res.json({ sessionId: session.id, url: session.url });
	} catch (error: any) {
		console.error('❌ Stripe mana increase (card) checkout error:', error);
		res.status(500).json({ error: 'Failed to create checkout session' });
	}
});

// Purchase mana reload tokens ($5.00 each)
router.post('/checkout/mana-reload', requireAuth, async (req: Request, res: Response) => {
	try {
		if (!stripe) {
			return res.status(500).json({ error: 'Payment service not configured' });
		}
		const userId = req.userId!;
		const { quantity, returnUrl } = req.body as { quantity?: number; returnUrl?: string };
		const qty = Math.max(1, Math.min(20, quantity || 1));

		// Build cancel URL with return path
		const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
		const cancelUrl = returnUrl 
			? `${frontendUrl}/checkout/cancel?returnUrl=${encodeURIComponent(returnUrl)}`
			: `${frontendUrl}/checkout/cancel`;

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			mode: 'payment',
			allow_promotion_codes: true,
			line_items: [
				{
					price_data: {
						currency: 'usd',
						product_data: {
							name: 'Mana Reload Token',
							description: 'Redeem to fully restore a card\'s mana to its base (with collection bonus).',
						},
						unit_amount: 500, // $5.00
					},
					quantity: qty,
				},
			],
			metadata: {
				userId,
				type: 'mana_reload',
				quantity: String(qty),
			},
			success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: cancelUrl,
		});

		res.json({ sessionId: session.id, url: session.url });
	} catch (error: any) {
		console.error('❌ Stripe mana reload checkout error:', error);
		res.status(500).json({ error: 'Failed to create checkout session' });
	}
});

// Webhook handler for Stripe events
// Note: This route uses raw body parser for signature verification
router.post('/webhook', async (req: Request, res: Response) => {
	if (!stripe) {
		console.error('❌ Stripe not initialized. Cannot process webhook.');
		return res.status(500).send('Payment service not configured');
	}

	const sig = req.headers['stripe-signature'];
	const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

	if (!webhookSecret) {
		console.error('Webhook secret not configured');
		return res.status(500).send('Webhook secret not configured');
	}

	let event: Stripe.Event;

	try {
		// req.body should be Buffer from raw body parser
		event = stripe.webhooks.constructEvent(req.body as Buffer, sig!, webhookSecret);
	} catch (err: any) {
		console.error('Webhook signature verification failed:', err.message);
		return res.status(400).send(`Webhook Error: ${err.message}`);
	}

	// Handle the event
	if (event.type === 'checkout.session.completed') {
		const session = event.data.object as Stripe.Checkout.Session;
		
		try {
			const userId = session.metadata?.userId;
			const cardId = session.metadata?.cardId;
			const setId = session.metadata?.setId;
			const type = session.metadata?.type;

			if (!userId) {
				console.error('No userId in session metadata');
				return res.status(400).json({ error: 'Missing userId' });
			}

			// Get user (works with both JSON and Prisma)
			const user = await getUser(userId);
			if (!user) {
				console.error('User not found:', userId);
				return res.status(404).json({ error: 'User not found' });
			}

			// Update user collection
			const updatedCollectionCardIds = [...user.collectionCardIds];
			const updatedCollectionSetIds = [...user.collectionSetIds];

			if (type === 'card' && cardId) {
				if (!updatedCollectionCardIds.includes(cardId)) {
					updatedCollectionCardIds.push(cardId);
				}
			} else if (type === 'set' && setId) {
				if (!updatedCollectionSetIds.includes(setId)) {
					updatedCollectionSetIds.push(setId);
				}
				// Add all cards from the set
				const set = await getSet(setId);
				if (set) {
					for (const cardIdFromSet of set.cardIds) {
						if (!updatedCollectionCardIds.includes(cardIdFromSet)) {
							updatedCollectionCardIds.push(cardIdFromSet);
						}
					}
				}
			}

			// Update user (works with both JSON and Prisma)
			await updateUser(userId, {
				collectionCardIds: updatedCollectionCardIds,
				collectionSetIds: updatedCollectionSetIds,
			});

			console.log(`✅ Payment successful: ${type} ${cardId || setId} for user ${userId}`);
		} catch (error) {
			console.error('Error processing webhook:', error);
			return res.status(500).json({ error: 'Failed to process webhook' });
		}
	}

	res.json({ received: true });
});

// Confirm checkout completion (fallback when webhooks aren't available)
router.post('/confirm', requireAuth, async (req: Request, res: Response) => {
	try {
		if (!stripe) {
			return res.status(500).json({ error: 'Payment service not configured' });
		}
		const { sessionId } = req.body as { sessionId?: string };
		const userId = req.userId!;
		if (!sessionId) {
			return res.status(400).json({ error: 'sessionId is required' });
		}

		// Retrieve the session from Stripe
		const session = await stripe.checkout.sessions.retrieve(sessionId, {
			expand: ['payment_intent']
		});

		if (session.payment_status !== 'paid') {
			return res.status(400).json({ error: 'Payment not completed' });
		}

		const meta = session.metadata || {} as any;
		const type = meta.type as 'card' | 'set' | 'mana_increase' | 'mana_reload' | undefined;
		const cardId = meta.cardId as string | undefined;
		const setId = meta.setId as string | undefined;
		// Sanitize quantity from metadata (defensive against malformed values)
		const quantity = (() => {
			const q = meta.quantity ? parseInt(meta.quantity, 10) : 1;
			if (Number.isNaN(q) || q <= 0) return 1;
			return Math.min(20, Math.max(1, q));
		})();
		const metaUserId = meta.userId as string | undefined;

		// Ensure the session belongs to the same user
		if (!type || !metaUserId || metaUserId !== userId) {
			return res.status(400).json({ error: 'Invalid session metadata' });
		}

		// Get user (works with both JSON and Prisma)
		const user = await getUser(userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Prepare updates
		const updates: any = {};
		let cardUpdated = false;

		if (type === 'card' && cardId) {
			const updatedCollectionCardIds = [...user.collectionCardIds];
			if (!updatedCollectionCardIds.includes(cardId)) {
				updatedCollectionCardIds.push(cardId);
			}
			updates.collectionCardIds = updatedCollectionCardIds;
		} else if (type === 'set' && setId) {
			const updatedCollectionSetIds = [...user.collectionSetIds];
			const updatedCollectionCardIds = [...user.collectionCardIds];
			if (!updatedCollectionSetIds.includes(setId)) {
				updatedCollectionSetIds.push(setId);
			}
			// Add all cards from the set
			const set = await getSet(setId);
			if (set) {
				for (const cid of set.cardIds) {
					if (!updatedCollectionCardIds.includes(cid)) {
						updatedCollectionCardIds.push(cid);
					}
				}
			}
			updates.collectionSetIds = updatedCollectionSetIds;
			updates.collectionCardIds = updatedCollectionCardIds;
		} else if (type === 'mana_increase' && quantity > 0) {
			// No explicit cap defined for increase tokens
			updates.manaIncreaseTokens = (user.manaIncreaseTokens || 0) + quantity;
		} else if (type === 'mana_increase_card' && cardId && quantity > 0) {
			// Immediately apply +1 (per quantity) to the selected card, up to base
			try {
				const { getCurrentMana, setCurrentMana } = await import('../utils/manaManager.js');
				const card = await getCard(cardId);
				if (card) {
					// 1) Update persisted card attribute (base mana) by +quantity
					const prevBase = typeof card.attributes?.mana === 'number' ? card.attributes.mana : 5;
					const newBase = prevBase + quantity;
					await updateCard(cardId, {
						attributes: {
							...card.attributes,
							mana: newBase,
						},
					});

					// 2) Update the current mana state file to reflect the new base, adding +quantity
					//    We treat current as min(newBase, current + quantity)
					let current = await getCurrentMana(cardId, newBase);
					const target = Math.min(newBase, current + quantity);
					await setCurrentMana(cardId, target);
					cardUpdated = true;
				}
			} catch (e) {
				console.error('Failed to apply mana increase to card:', e);
			}
		} else if (type === 'mana_reload' && quantity > 0) {
			// Cap reload tokens at 10
			const current = user.manaReloadTokens || 0;
			updates.manaReloadTokens = Math.min(10, current + quantity);
		}

		// Update user (works with both JSON and Prisma)
		if (Object.keys(updates).length > 0) {
			await updateUser(userId, updates);
		}
		
		// Get updated user to return (works with both JSON and Prisma)
		const updatedUser = await getUser(userId);
		if (!updatedUser) {
			return res.status(404).json({ error: 'User not found after update' });
		}
		
		// Return updated user (without sensitive fields)
		const { passwordHash, ...userResponse } = updatedUser as any;
		return res.json(userResponse);
	} catch (error: any) {
		console.error('Checkout confirm error:', error);
		return res.status(500).json({ error: 'Failed to confirm checkout', details: error.message });
	}
});

export default router;

