import { getVibeProfile } from './src/lib/firestore.js';

async function check() {
  const profile = await getVibeProfile('vantaige-brand-001');
  console.log('Profile:', profile);
}
check();
