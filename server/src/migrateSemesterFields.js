// One-time, safe backfill for the new academicYear/semester fields on
// Course and Allocation. Existing records imported before this change have
// those fields blank ('') - which is harmless (every query treats "no
// filter passed" as "match everything", so nothing breaks without running
// this) - but running it once means semester-scoped searches, the
// optimizer, and gap analysis immediately have something meaningful to
// filter on instead of everything sitting in one undated bucket.
//
// Usage:
//   cd server
//   node src/migrateSemesterFields.js --academicYear=2026-27 --semester=I
//
// Only touches documents where academicYear/semester is missing or blank -
// safe to re-run, and never overwrites a value that's already set.
import 'dotenv/config';
import mongoose from 'mongoose';
import Course from './models/Course.js';
import Allocation from './models/Allocation.js';

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) { console.error('MONGO_URI is missing from .env'); process.exit(1); }

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v];
}));
const academicYear = args.academicYear;
const semester = args.semester;

if (!academicYear || !semester) {
  console.error('Usage: node src/migrateSemesterFields.js --academicYear=2026-27 --semester=I');
  process.exit(1);
}

async function run() {
  await mongoose.connect(mongoUri);

  const blank = { $in: [null, ''] };
  const courseResult = await Course.updateMany(
    { $or: [{ academicYear: blank }, { semester: blank }] },
    { $set: { academicYear, semester } }
  );
  const allocationResult = await Allocation.updateMany(
    { $or: [{ academicYear: blank }, { semester: blank }] },
    { $set: { academicYear, semester } }
  );

  console.log(`Backfilled ${courseResult.modifiedCount} course(s) and ${allocationResult.modifiedCount} allocation(s) to academicYear=${academicYear}, semester=${semester}.`);
  await mongoose.disconnect();
}

run().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
