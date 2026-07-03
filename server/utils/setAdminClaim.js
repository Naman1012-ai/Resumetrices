const { getAuth } = require('firebase-admin/auth');

async function setAdminClaim(uid) {
  await getAuth().setCustomUserClaims(uid, { admin: true });
  console.log(`Admin claim set for UID: ${uid}`);
}

// Run once: node -e "require('./server/utils/setAdminClaim').setAdminClaim('YOUR_ADMIN_UID')"
module.exports = { setAdminClaim };
