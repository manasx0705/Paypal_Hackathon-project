/**
 * npm run fixtures:record — REAL mode. Pulls live RSS items, runs the real extraction (Groq, needs GROQ_API_KEY)
 * and writes them in the fixture format to fixtures/recorded/articles.json so they can replace the demo fixtures.
 * The recorded file contains short RSS snippets for offline replay only; it is git-ignored and never served.
 */
process.env.FIXTURE_MODE = 'false';
process.env.LOG_LEVEL = 'warn';
import fs from 'node:fs';
const { FeedReader } = await import('../src/adapters/data.js');
const { complete } = await import('../src/adapters/llm.js');
const { ExtractionSchema } = await import('../src/services/trends.js');
const { connectDb } = await import('../src/db.js');

if (!process.env.GROQ_API_KEY) {
  console.error('GROQ_API_KEY is required to record extraction fixtures.');
  process.exit(1);
}
await connectDb(process.env.MONGODB_URI || ''); // token budget counter lives in Mongo
const limit = Number(process.argv[2]) || 20;
const items = (await FeedReader.fetchAll()).slice(0, limit);
const out = [];
for (const [i, it] of items.entries()) {
  try {
    const llm = await complete({ key: `extract:${it.url}`, instruction: 'Extract the fields from this news item.', data: `TITLE: ${it.title}\nSOURCE: ${it.source}\nTEXT: ${it.snippet}`, schema: ExtractionSchema });
    out.push({ id: `r${i}`, daysAgo: Math.max(0, Math.round((Date.now() - it.publishedAt) / 86400000)), source: it.source, url: it.url, title: it.title, snippet: it.snippet.slice(0, 300), llm });
    console.log(`✓ ${it.title.slice(0, 70)}`);
  } catch (e) {
    console.log(`✗ ${it.title.slice(0, 70)} (${e.message})`);
  }
}
fs.mkdirSync('fixtures/recorded', { recursive: true });
fs.writeFileSync('fixtures/recorded/articles.json', JSON.stringify({ _note: 'Recorded live fixtures', articles: out }, null, 1));
console.log(`recorded ${out.length} articles`);
process.exit(0);
