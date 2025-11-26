/**
 * Environment Variable Validation
 * Ensures all required environment variables are set before server starts
 */

interface EnvConfig {
	required: string[];
	optional: string[];
	warnings: { [key: string]: string };
}

const envConfig: EnvConfig = {
	required: [
		'JWT_SECRET',
		'ENCRYPTION_KEY',
	],
	optional: [
		'STRIPE_SECRET_KEY',
		'STRIPE_WEBHOOK_SECRET',
		'FRONTEND_URL',
		'PORT',
		'NODE_ENV',
		'SMTP_HOST',
		'SMTP_PORT',
		'SMTP_USER',
		'SMTP_PASS',
		'SMTP_FROM',
	],
	warnings: {
		'STRIPE_SECRET_KEY': 'Stripe payments will not work without this',
		'STRIPE_WEBHOOK_SECRET': 'Stripe webhook verification will not work without this',
		'FRONTEND_URL': 'Using default localhost URL - may cause issues in production',
	}
};

export function validateEnvironment(): { valid: boolean; errors: string[]; warnings: string[] } {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Check required variables
	for (const key of envConfig.required) {
		if (!process.env[key]) {
			errors.push(`Missing required environment variable: ${key}`);
		} else if (key === 'JWT_SECRET' && process.env[key] === 'your-secret-key-change-in-production') {
			errors.push('JWT_SECRET is set to default value - must be changed for production');
		}
	}

	// Check optional but recommended variables
	for (const key of envConfig.optional) {
		if (!process.env[key] && envConfig.warnings[key]) {
			warnings.push(`${envConfig.warnings[key]} (${key} not set)`);
		}
	}

	// Production-specific checks
	if (process.env.NODE_ENV === 'production') {
		if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('test')) {
			warnings.push('STRIPE_SECRET_KEY appears to be a test key - ensure production key is set');
		}
		if (!process.env.FRONTEND_URL || process.env.FRONTEND_URL.includes('localhost')) {
			warnings.push('FRONTEND_URL should be set to production domain in production mode');
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

export function printEnvironmentStatus(): void {
	const { valid, errors, warnings } = validateEnvironment();

	if (!valid) {
		console.error('\n❌ ENVIRONMENT VALIDATION FAILED:');
		errors.forEach(error => console.error(`   - ${error}`));
		console.error('\nPlease set the required environment variables before starting the server.\n');
		process.exit(1);
	}

	if (warnings.length > 0) {
		console.warn('\n⚠️  ENVIRONMENT WARNINGS:');
		warnings.forEach(warning => console.warn(`   - ${warning}`));
		console.warn('');
	}

	if (valid && warnings.length === 0) {
		console.log('✅ Environment variables validated successfully\n');
	}
}

