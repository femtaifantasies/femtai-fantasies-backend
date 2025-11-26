import crypto from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KEY_FILE = path.join(__dirname, '../../data/.encryption_key');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

// Get or create a persistent encryption key (synchronous)
function getEncryptionKey(): string {
	// First, try environment variable
	if (process.env.ENCRYPTION_KEY) {
		console.log('🔑 Using encryption key from environment variable');
		return process.env.ENCRYPTION_KEY;
	}

	// Try to read from file
	try {
		if (existsSync(KEY_FILE)) {
			const key = readFileSync(KEY_FILE, 'utf-8');
			if (key && key.trim().length > 0) {
				console.log('🔑 Using encryption key from file:', KEY_FILE);
				return key.trim();
			}
		}
	} catch (error: any) {
		console.error('⚠️  Error reading encryption key file:', error?.message);
		// File doesn't exist or can't be read, create it
	}

	// Generate a new key and save it
	const newKey = crypto.randomBytes(32).toString('hex');
	try {
		mkdirSync(path.dirname(KEY_FILE), { recursive: true });
		writeFileSync(KEY_FILE, newKey, { mode: 0o600 }); // Read/write for owner only
		console.log('✅ Generated and saved new encryption key to:', KEY_FILE);
		console.log('⚠️  WARNING: This new key will NOT decrypt existing encrypted data!');
	} catch (error: any) {
		console.error('⚠️  Warning: Could not save encryption key to file. Using in-memory key (will be lost on restart)');
		console.error('Error:', error?.message);
	}
	
	return newKey;
}

// Initialize and cache the key at module load
const ENCRYPTION_KEY = getEncryptionKey();
console.log('🔐 Encryption module initialized');
console.log('🔑 Encryption key source:', process.env.ENCRYPTION_KEY ? 'environment variable' : (existsSync(KEY_FILE) ? 'key file' : 'generated new'));
console.log('🔑 Encryption key (first 20 chars):', ENCRYPTION_KEY.substring(0, 20));
const testKeyBuffer = getKey(ENCRYPTION_KEY);
console.log('🔑 Key buffer hash (first 20 chars):', testKeyBuffer.toString('hex').substring(0, 20));

// Ensure we have a 32-byte key
function getKey(encryptionKey: string): Buffer {
	try {
		const key = Buffer.from(encryptionKey, 'hex');
		if (key.length === 32) {
			return key;
		}
	} catch {
		// Not a valid hex string, hash it
	}
	
	// If key is not 32 bytes or not valid hex, hash it to get 32 bytes
	return crypto.createHash('sha256').update(encryptionKey).digest();
}

/**
 * Encrypts a message string
 */
export function encryptMessage(text: string): string {
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        return encryptMessageWithIV(text, iv);
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt message');
    }
}

/**
 * Encrypt with a provided IV (used to compare against previously encrypted values)
 */
export function encryptMessageWithIV(text: string, iv: Buffer): string {
    try {
        const key = getKey(ENCRYPTION_KEY);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt message');
    }
}

/**
 * Decrypts an encrypted message string
 * Tries multiple keys if decryption fails (for migration support)
 */
export function decryptMessage(encryptedText: string): string {
	if (!encryptedText || typeof encryptedText !== 'string') {
		throw new Error('Invalid encrypted message: empty or not a string');
	}

	try {
		const parts = encryptedText.split(':');
		if (parts.length !== 2) {
			throw new Error('Invalid encrypted message format - expected "iv:encrypted"');
		}
		
		const iv = Buffer.from(parts[0], 'hex');
		const encrypted = parts[1];
		
		if (iv.length !== 16) {
			throw new Error(`Invalid IV length: ${iv.length}, expected 16`);
		}
		
		// Try with current key
		const key = getKey(ENCRYPTION_KEY);
		
		try {
			const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
			let decrypted = decipher.update(encrypted, 'hex', 'utf8');
			decrypted += decipher.final('utf8');
			return decrypted;
		} catch (decryptError: any) {
			// If decryption fails, try with environment variable key (if different)
			if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY !== ENCRYPTION_KEY) {
				try {
					const envKey = getKey(process.env.ENCRYPTION_KEY);
					const decipher = crypto.createDecipheriv(ALGORITHM, envKey, iv);
					let decrypted = decipher.update(encrypted, 'hex', 'utf8');
					decrypted += decipher.final('utf8');
					return decrypted;
				} catch {
					// Fall through to error
				}
			}
			console.error('Decryption failed. Error:', decryptError?.message || decryptError);
			console.error('Key being used (first 20 chars):', ENCRYPTION_KEY.substring(0, 20));
			throw decryptError;
		}
	} catch (error: any) {
		console.error('Decryption error:', error);
		console.error('Encrypted text length:', encryptedText?.length);
		console.error('Encrypted text preview:', encryptedText?.substring(0, 50));
		throw new Error('Failed to decrypt message');
	}
}

