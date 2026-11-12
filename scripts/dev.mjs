// Starts the API (port 4000) and the web app (port 5173) together. Ctrl+C stops both.
import { spawn } from 'node:child_process';

const run = (name, cwd, args) => {
  const p = spawn('npm', args, { cwd, stdio: 'pipe', shell: true });
  const tag = (s) => s.toString().split('\n').filter(Boolean).map((l) => `[${name}] ${l}`).join('\n');
  p.stdout.on('data', (d) => console.log(tag(d)));
  p.stderr.on('data', (d) => console.error(tag(d)));
  return p;
};
const procs = [run('api', 'server', ['start']), run('web', 'client', ['run', 'dev'])];
console.log('\nPalProcure starting… open http://localhost:5173 (demo data seeds in ~60 s on first start)\n');
const stop = () => {
  procs.forEach((p) => p.kill());
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
