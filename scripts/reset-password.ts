import bcrypt from 'bcrypt';
import { getDatabase } from '../src/db/database';

async function resetPassword(phoneNumber: string, newPassword: string) {
  const db = getDatabase();
  
  // Get user
  const user: any = await db.get(
    'SELECT * FROM users WHERE phone_number = ?',
    [phoneNumber]
  );
  
  if (!user) {
    console.error(`User not found: ${phoneNumber}`);
    process.exit(1);
  }
  
  console.log('User found:', {
    phone: user.phone_number,
    status: user.status,
    credits: user.credits_remaining,
    hasPassword: !!user.password_hash,
  });
  
  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 10);
  
  // Update password
  await db.run(
    'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?',
    [passwordHash, phoneNumber]
  );
  
  console.log(`\n✅ Password updated successfully!`);
  console.log(`\nYou can now login with:`);
  console.log(`Phone: ${phoneNumber}`);
  console.log(`Password: ${newPassword}`);
  console.log(`\n⚠️  Change this password after logging in!`);
}

// Get arguments
const phoneNumber = process.argv[2];
const newPassword = process.argv[3];

if (!phoneNumber || !newPassword) {
  console.error('Usage: ts-node scripts/reset-password.ts <phone-number> <new-password>');
  console.error('Example: ts-node scripts/reset-password.ts +46793426209 NewPassword123');
  process.exit(1);
}

resetPassword(phoneNumber, newPassword)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
