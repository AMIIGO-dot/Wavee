import dotenv from 'dotenv';
import path from 'path';
import app from './app';
import { getDatabase } from './db/database';

// Load environment variables from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Validate required environment variables
const requiredEnvVars = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'OPENAI_API_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`ERROR: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Validate that at least one Twilio phone number is configured
if (!process.env.TWILIO_PHONE_NUMBER_SE && !process.env.TWILIO_PHONE_NUMBER_US && !process.env.TWILIO_PHONE_NUMBER) {
  console.error('ERROR: At least one Twilio phone number must be configured (TWILIO_PHONE_NUMBER_SE, TWILIO_PHONE_NUMBER_US, or TWILIO_PHONE_NUMBER)');
  process.exit(1);
}

// Initialize database
const db = getDatabase();
console.log('[DATABASE] Initialized');

// Get port from environment or use default
const PORT = process.env.PORT || 3000;

// Start server
const server = app.listen(PORT, () => {
  console.log('=================================================');
  console.log('  Outdoor SMS Assistant - Server Started');
  console.log('=================================================');
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
  console.log(`  SMS webhook: http://localhost:${PORT}/sms/incoming`);
  console.log('=================================================');
  console.log('');
  console.log('Ready to receive SMS messages!');
  console.log('');
  console.log('To expose this server for Twilio webhooks:');
  console.log(`  ngrok http ${PORT}`);
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received, closing server...');
  server.close(() => {
    console.log('[SERVER] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[SERVER] SIGINT received, closing server...');
  server.close(() => {
    console.log('[SERVER] Server closed');
    process.exit(0);
  });
});
