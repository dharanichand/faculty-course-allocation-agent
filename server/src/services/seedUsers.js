import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Faculty from '../models/Faculty.js';

// Placeholder accounts printed on the login screen. Passwords are reset to
// these values on every boot while SEED_DEMO_USERS is not "false", so the
// credentials shown on the login page always work.
export const DEMO_ACCOUNTS = [
  {name: 'Dr.Phani Kumar', email: 'hod@college.edu', password: 'hod12345', role: 'hod'},
  {name: 'Demo Faculty', email: 'faculty@college.edu', password: 'faculty12345', role: 'faculty'}
];

export async function seedDemoUsers() {
  if (String(process.env.SEED_DEMO_USERS ?? 'true').toLowerCase() === 'false') {
    console.log('Demo user seeding disabled (SEED_DEMO_USERS=false)');
    return;
  }
  for (const acct of DEMO_ACCOUNTS) {
    const passwordHash = await bcrypt.hash(acct.password, 10);
    const set = {name: acct.name, passwordHash, role: acct.role};
    if (acct.role === 'faculty') {
      // Link the demo faculty login to a real faculty record so dashboards have data.
      const profile = await Faculty.findOne({email: acct.email}).lean()
        || await Faculty.findOne({status: {$ne: 'inactive'}}).sort({facultyId: 1}).lean();
      if (profile?.facultyId) set.facultyId = String(profile.facultyId);
    }
    await User.updateOne({email: acct.email}, {$set: set}, {upsert: true});
  }
  console.log(`Demo users ready: ${DEMO_ACCOUNTS.map(a => a.email).join(', ')}`);
}
