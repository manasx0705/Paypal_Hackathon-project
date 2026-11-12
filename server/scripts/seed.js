import { connectDb, disconnectDb } from '../src/db.js';
import { bootstrapDemo } from '../src/bootstrap.js';

if (!process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI to seed a persistent database. (Without it the server auto-seeds its in-memory DB on start.)');
  process.exit(1);
}
await connectDb();
await bootstrapDemo((m) => console.log(m));
await disconnectDb();
