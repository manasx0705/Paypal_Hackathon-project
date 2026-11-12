import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

let memServer = null;

/** Connect to MONGODB_URI, or start an in-memory MongoDB so the app runs with zero setup. */
export async function connectDb(uri = env.mongoUri) {
  let target = uri;
  if (!target) {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    memServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    target = memServer.getUri();
    logger.warn('MONGODB_URI not set: using an in-memory MongoDB (data resets on restart)');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(target, { dbName: process.env.MONGODB_DB || 'palprocure' });
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memServer) await memServer.stop();
  memServer = null;
}
