import mongoose from 'mongoose';
import Faculty from '../models/Faculty.js';
import Course from '../models/Course.js';
import Allocation from '../models/Allocation.js';
import Conflict from '../models/Conflict.js';
import { memoryFaculty, memoryCourses, memoryRequests, syntheticRequests, memory } from './store.js';

let seeded = false;

export const isMongoConnected = () => mongoose.connection.readyState === 1;

export async function connectDatabase(uri) {
  if (!uri) throw new Error('MONGODB_URI is not configured');
  if (isMongoConnected()) return mongoose.connection;

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000,
    maxPoolSize: 10,
    minPoolSize: 1,
    family: 4
  });

  await seedDatabase();
  return mongoose.connection;
}

async function seedDatabase() {
  if (seeded || !isMongoConnected()) return;
  seeded = true;

  const [facultyCount, courseCount, allocationCount] = await Promise.all([
    Faculty.countDocuments(),
    Course.countDocuments(),
    Allocation.countDocuments()
  ]);

  if (facultyCount === 0 && memoryFaculty.length) {
    await Faculty.insertMany(memoryFaculty.map(({ _id, ...f }) => f), { ordered: false });
  }

  if (courseCount === 0 && memoryCourses.length) {
    await Course.insertMany(memoryCourses.map(({ _id, ...c }) => c), { ordered: false });
  }

  // The supplied candidate dataset is used as the initial HOD review queue.
  // We intentionally omit the CSV candidate UUID as Mongo's _id because the
  // application uses Mongo ObjectIds for Allocation documents.
  if (allocationCount === 0 && memoryRequests.length) {
    await Allocation.insertMany(memoryRequests.map((r) => ({
      facultyId: r.facultyId,
      courseId: r.courseId,
      sectionId: r.sectionId || '',
      syntheticKey: r.syntheticKey,
      status: ['pending', 'recommended', 'approved', 'rejected'].includes(r.status) ? r.status : 'pending',
      recommendationScore: Number.isFinite(r.recommendationScore) ? r.recommendationScore : undefined,
      recommendationReason: r.recommendationReason || '',
      override: false
    })), { ordered: false });
  }

  for (const request of syntheticRequests) {
    await Allocation.updateOne(
      {syntheticKey:request.syntheticKey},
      {$setOnInsert:{facultyId:request.facultyId,courseId:request.courseId,sectionId:request.sectionId,status:'pending',recommendationScore:request.recommendationScore,recommendationReason:request.recommendationReason,syntheticKey:request.syntheticKey,override:false}},
      {upsert:true}
    );
  }

  const conflictCount = await Conflict.countDocuments();
  if (conflictCount === 0 && memory.conflicts.length) {
    await Conflict.insertMany(memory.conflicts.map(({ _id, ...c }) => c), { ordered: false });
  }

  console.log(`MongoDB ready. Seed status: faculty=${memoryFaculty.length}, courses=${memoryCourses.length}, allocations=${memoryRequests.length}, conflicts=${memory.conflicts.length}`);
}
