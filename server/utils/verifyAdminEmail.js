// verifyAdminEmail.js — helper utility to mark the admin user's email as verified in Firebase Auth
// Run as: node server/utils/verifyAdminEmail.js

require('dotenv').config();
const firebaseService = require('../services/firebaseService');
const { getAuth } = require('firebase-admin/auth');
const env = require('../config/env');

const adminEmail = env.VITE_ADMIN_EMAIL || 'admin@resumetrices.com';

async function run() {
  console.log(`Searching for admin account with email: ${adminEmail}...`);
  try {
    const authInstance = getAuth();
    const user = await authInstance.getUserByEmail(adminEmail);
    console.log(`Found user: UID=${user.uid}, DisplayName=${user.displayName || 'none'}, EmailVerified=${user.emailVerified}`);
    
    if (user.emailVerified) {
      console.log('Admin account email is already verified.');
      return;
    }

    await authInstance.updateUser(user.uid, { emailVerified: true });
    console.log('Successfully marked admin account email as verified in Firebase Auth!');
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      console.error(`Error: No user found in Firebase Auth matching the email: ${adminEmail}`);
      console.log('Please register the admin account first on the application, then run this script again.');
    } else {
      console.error('Error updating admin account:', err);
    }
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
