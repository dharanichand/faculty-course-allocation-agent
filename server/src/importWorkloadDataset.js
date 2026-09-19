// Loads the 2026-27 workload + preference spreadsheets into MongoDB and runs the
// automatic allocator, so HOD Review opens with a full set of recommendations.
//
//   npm run import:workload            -> import into MongoDB (needs MONGO_URI)
//   npm run import:workload -- --dry   -> only build + allocate in memory and print a report
//
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';
import {buildDataset} from './services/datasetBuilder.js';
import {runAutoAllocation} from './services/autoAllocator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dry = process.argv.includes('--dry');

function findFile(re) {
  const f = fs.readdirSync(dataDir).filter(n => re.test(n)).sort().pop();
  if (!f) throw new Error(`No file matching ${re} found in ${dataDir}`);
  return path.join(dataDir, f);
}

async function main() {
  const workloadPath = findFile(/^Workload.*\.xlsx$/i);
  const submissionsPath = findFile(/^submissions.*\.xlsx$/i);
  console.log(`Workload file    : ${path.basename(workloadPath)}`);
  console.log(`Submissions file : ${path.basename(submissionsPath)}`);
  const {faculty, courses, summary} = buildDataset({workloadPath, submissionsPath});
  console.log('\nDataset summary'); console.log(JSON.stringify(summary, null, 2));

  if (dry) {
    const r = runAutoAllocation({faculty, courses});
    console.log('\nAuto-allocation (dry run, nothing written)'); console.log(JSON.stringify(r.stats, null, 2));
    return;
  }

  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing from .env');
  const mongoose = (await import('mongoose')).default;
  const [{default: Faculty}, {default: Course}, {default: Allocation}, {default: Conflict}, {default: AllocationConfig}] = await Promise.all([
    import('./models/Faculty.js'), import('./models/Course.js'), import('./models/Allocation.js'),
    import('./models/Conflict.js'), import('./models/AllocationConfig.js')
  ]);
  const {runAndPersistAutoAllocation} = await import('./services/allocationRunner.js');
  const {seedDemoUsers} = await import('./services/seedUsers.js');

  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, {serverSelectionTimeoutMS: 15000});
  // Only imported application data is replaced. User accounts, audit history and
  // settings are preserved.
  await Promise.all([Faculty.deleteMany({}), Course.deleteMany({}), Allocation.deleteMany({}), Conflict.deleteMany({})]);
  await Faculty.insertMany(faculty, {ordered: true});
  await Course.insertMany(courses, {ordered: true});
  await AllocationConfig.updateOne({department: 'CSE'}, {$set: {maxWorkload: 18}}, {upsert: true});
  const result = await runAndPersistAutoAllocation({actor: 'import', actorRole: 'system'});
  await seedDemoUsers().catch(() => {});
  console.log('\nAuto-allocation'); console.log(JSON.stringify(result.stats, null, 2));
  console.table({
    faculty: await Faculty.countDocuments(), courses: await Course.countDocuments(),
    allocations: await Allocation.countDocuments(), conflicts: await Conflict.countDocuments()
  });
  await mongoose.disconnect();
  console.log('IMPORT COMPLETE');
}

main().catch(e => { console.error('IMPORT FAILED:', e.message); process.exitCode = 1; });
