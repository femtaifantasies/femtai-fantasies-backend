export type CardType = 'attack' | 'defense' | 'spell' | 'artifact' | string;

export interface Card {
	id: string;
	imageUrl: string;
	title: string;
	description: string;
	type: CardType;
	cost: number;
	attributes: {
		mana: number;
		resistance: number;
		charm: number;
		devotion: number;
	};
	character?: string;
}

export interface CardSet {
	id: string;
	name: string;
	description: string;
	imageUrl: string;
	coverImageUrl?: string;
	cardIds: string[];
	cost: number;
	costPerCard: number;
	type?: string;
	mana?: number;
	character?: string;
}

export interface Character {
	id: string;
	name: string;
	coverImageUrl?: string;
	description?: string;
}

export interface UserProfile {
	id: string; // UUID v4 - unique identifier for backend operations
	email: string; // Encrypted email - primary identifier for authentication
	username?: string; // Optional display name (encrypted if present)
	passwordHash: string;
	// Mana reload tokens: granted daily on login (max stack: 5) and via purchases
	manaReloadTokens?: number;
	// Mana increase tokens: +1 current mana (up to base) per token
	manaIncreaseTokens?: number;
	// Track last login date to grant daily mana reload (YYYY-MM-DD)
	lastLoginDate?: string;
	profileImageUrl?: string;
	bio?: string;
	interests?: string; // Comma-separated or JSON string of interests
	location?: string;
	website?: string;
	collectionCardIds: string[];
	collectionSetIds: string[];
	followingIds: string[]; // Legacy - kept for backward compatibility
	friendIds: string[]; // Mutual friend connections (both users must be friends)
	friendRequestIds: string[]; // Outgoing friend requests (requests sent by this user)
	ageVerifiedAt?: string;
	isAdmin?: string; // Encrypted boolean value ("true" or "false")
}

export interface FriendRequest {
	id: string;
	fromUserId: string;
	toUserId: string;
	status: 'pending' | 'accepted' | 'declined';
	createdAt: string;
}

export interface TradeProposal {
	id: string;
	fromUserId: string;
	toUserId: string;
	cardOfferedId: string;
	cardRequestedId: string;
	status: 'pending' | 'accepted' | 'declined' | 'cancelled';
	createdAt: string;
}

export interface Message {
	id: string;
	fromUserId: string;
	toUserId: string;
	encryptedContent: string; // Encrypted message content
	createdAt: string;
	read: boolean;
}

export interface UserReport {
	id: string;
	reportedUserId: string;
	reporterUserId: string;
	reason: string;
	createdAt: string;
	status: 'pending' | 'reviewed' | 'resolved';
	adminNotes?: string;
}

export interface Notification {
	id: string;
	userId: string;
	type: 'trade' | 'message' | 'new_card' | 'new_collection' | 'admin_alert' | 'friend_request';
	title: string;
	message: string;
	read: boolean;
	createdAt: string;
	// Optional metadata for linking to specific items
	relatedId?: string; // trade ID, message ID, card ID, collection ID, friend request ID, etc.
	fromUserId?: string; // For trade/message/friend_request notifications
}

export interface SavedChat {
	id: string;
	userId: string;
	cardId: string;
	characterName: string;
	cardTitle: string;
	encryptedMessages: string; // Encrypted JSON string of messages
	createdAt: string;
	updatedAt: string;
}
