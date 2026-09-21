// Loads the 2026-27 workload + preference spreadsheets into MongoDB.
//
//   npm run import:workload                       -> replace the data in MongoDB (needs MONGO_URI)
//   npm run import:workload -- --dry              -> build + verify in memory, write nothing
//   npm run import:workload -- --status=recommended
//                                                 -> store the sheet's assignments as "recommended"
//                                                    (HOD approves them) instead of "approved"
//
// What ends up in the database:
//   * every faculty member from BOTH files (people are matched by name, so the 28
//     whose employee number differs between the files are not duplicated);
//   * every course of the workload sheet;
//   * one allocation per "Faculty WL" row - so the assignments shown in the
//     application are exactly the ones printed in the workload sheet;
//   * preferences: from the submission form where one exists, otherwise the
//     faculty member's current assignment.
// The import then re-reads what it wrote and re-checks it against the workbook.
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';
import {buildDataset} from './services/datasetBuilder.js';
import {verifyAllocations} from './services/datasetVerifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dry = process.argv.includes('--dry');
const statusArg = (process.argv.find(a => a.startsWith('--status=')) || '--status=approved').split('=')[1];
if (!['approved', 'recommended'].includes(statusArg)) { console.error('--status must be "approved" or "recommended"'); process.exit(1); }

function findFile(re) {
  const matches = fs.readdirSync(dataDir).filter(n => re.test(n) && !n.startsWith('~$')).sort();
  if (!matches.length) throw new Error(`No file matching ${re} found in ${dataDir}`);
  if (matches.length > 1) throw new Error(`More than one file matches ${re} in ${dataDir}: ${matches.join(', ')}. Keep only one so the import is unambiguous.`);
  return path.join(dataDir, matches[0]);
}

async function main() {
  const workloadPath = findFile(/^Workload.*\.xlsx$/i);
  const submissionsPath = findFile(/^submissions.*\.xlsx$/i);
  console.log(`Workload file    : ${path.basename(workloadPath)}`);
  console.log(`Submissions file : ${path.basename(submissionsPath)}`);
  const {faculty, courses, allocations, summary, warnings} = buildDataset({workloadPath, submissionsPath, allocationStatus: statusArg});
  console.log('\nDataset summary'); console.log(JSON.stringify(summary, null, 2));
  if (warnings.length) { console.log(`\nThings to be aware of (${warnings.length}):`); warnings.forEach(w => console.log(` - ${w}`)); }

  const check = verifyAllocations({workloadPath, allocations, faculty, courses});
  console.log(`\nVerification (memory): ${check.allocations} allocations vs ${check.sheetRows} sheet rows, ${check.allocationHours} h vs ${check.sheetHours} h -> ${check.ok ? 'IDENTICAL' : 'PROBLEMS'}`);
  if (!check.ok) { check.problems.slice(0, 40).forEach(p => console.error(' ! ' + p)); throw new Error(`${check.problems.length} verification problem(s); nothing was written`); }
  if (dry) { console.log('\nDry run: nothing written to MongoDB.'); return; }

  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing from .env');
  const mongoose = (await import('mongoose')).default;
  const [{default: Faculty}, {default: Course}, {default: Allocation}, {default: Conflict}, {default: AllocationConfig}, {default: AuditLog}] = await Promise.all([
    import('./models/Faculty.js'), import('./models/Course.js'), import('./models/Allocation.js'),
    import('./models/Conflict.js'), import('./models/AllocationConfig.js'), import('./models/AuditLog.js')
  ]);
  const {seedDemoUsers} = await import('./services/seedUsers.js');

  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, {serverSelectionTimeoutMS: 15000});
  // Only imported application data is replaced. User accounts, audit history and settings are kept.
  await Promise.all([Faculty.deleteMany({}), Course.deleteMany({}), Allocation.deleteMany({}), Conflict.deleteMany({})]);
  await Faculty.insertMany(faculty, {ordered: true});
  await Course.insertMany(courses, {ordered: true});
  const now = new Date();
  await Allocation.insertMany(allocations.map(a => statusArg === 'approved' ? {...a, approvedBy: 'workload-sheet import', approvedAt: now} : a), {ordered: true});
  await AllocationConfig.updateOne({department: 'CSE'}, {$set: {maxWorkload: 18}}, {upsert: true});
  await AuditLog.create({
    actor: 'import', actorRole: 'system', action: 'DATASET_IMPORT', entityType: 'dataset', entityId: 'workload-2026-27-I',
    newValue: {workload: path.basename(workloadPath), submissions: path.basename(submissionsPath), faculty: faculty.length, courses: courses.length, allocations: allocations.length, status: statusArg},
    reason: 'Imported faculty, courses and the Faculty WL assignments from the workload and submissions spreadsheets.'
  }).catch(() => {});
  await seedDemoUsers().catch(() => {});

  // Read everything back from MongoDB and prove it still equals the workbook.
  const [dbFaculty, dbCourses, dbAllocs] = await Promise.all([Faculty.find({}).lean(), Course.find({}).lean(), Allocation.find({}).lean()]);
  const dbCheck = verifyAllocations({workloadPath, allocations: dbAllocs, faculty: dbFaculty, courses: dbCourses});
  console.log(`Verification (MongoDB): ${dbCheck.allocations} allocations vs ${dbCheck.sheetRows} sheet rows, ${dbCheck.allocationHours} h vs ${dbCheck.sheetHours} h -> ${dbCheck.ok ? 'IDENTICAL' : 'PROBLEMS'}`);
  if (!dbCheck.ok) { dbCheck.problems.slice(0, 40).forEach(p => console.error(' ! ' + p)); throw new Error('Database content does not match the workbook'); }
  console.table({faculty: dbFaculty.length, courses: dbCourses.length, allocations: dbAllocs.length, [`status ${statusArg}`]: dbAllocs.filter(a => a.status === statusArg).length});
  await mongoose.disconnect();
  console.log('IMPORT COMPLETE');
}

main().catch(e => { console.error('IMPORT FAILED:', e.message); process.exitCode = 1; });
