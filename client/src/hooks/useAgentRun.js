import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { runAgent, getRun } from '../api/agent';
import { errMsg } from '../api/client';
import { useToast } from './useToast';

const PHASES = ['Reading sales history', 'Forecasting demand', 'Scanning trends', 'Checking price alerts', 'Filling your carts'];

/** POST /agent/run then poll GET /agent/runs/:id every 1.5s until done; shows a progress toast. */
export function useAgentRun() {
  const qc = useQueryClient();
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const busy = useRef(false);

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    const tid = 'agent-run';
    let tick = 0;
    try {
      const { runId } = await runAgent();
      toast.push({ id: tid, type: 'loading', title: 'Agent is thinking…', body: PHASES[0], progress: 5 });
      for (;;) {
        await new Promise((r) => setTimeout(r, 1500));
        tick += 1;
        const run = await getRun(runId);
        const steps = run.steps?.length || 0;
        if (run.status === 'running') {
          toast.push({
            id: tid,
            type: 'loading',
            title: `Agent is thinking… (${run.mode === 'llm' ? 'AI on Groq' : 'rules engine'})`,
            body: steps ? `${steps} tool call${steps > 1 ? 's' : ''} · last: ${run.steps[steps - 1].tool}` : PHASES[tick % PHASES.length],
            progress: Math.min(92, 8 + tick * 9),
          });
          if (tick > 120) throw new Error('Agent run is taking too long; check the Agent page.');
          continue;
        }
        qc.invalidateQueries({ queryKey: ['cart'] });
        qc.invalidateQueries({ queryKey: ['agent-runs'] });
        qc.invalidateQueries({ queryKey: ['notifications'] });
        qc.setQueryData(['agent-run', runId], run);
        if (run.status === 'done') {
          toast.push({
            id: tid,
            type: 'success',
            title: 'Fresh suggestions are ready',
            body: run.summary || `${steps} tool calls completed.`,
            progress: 100,
            link: { to: '/cart', label: 'Open cart →' },
            duration: 8000,
          });
        } else {
          toast.push({ id: tid, type: 'error', title: 'Agent run failed', body: run.error || 'Unknown error', link: { to: '/agent', label: 'See run details' }, duration: 9000 });
        }
        break;
      }
    } catch (e) {
      toast.push({ id: tid, type: 'error', title: 'Could not run the agent', body: errMsg(e), duration: 8000 });
    } finally {
      busy.current = false;
      setRunning(false);
    }
  }, [qc, toast]);

  return { start, running };
}
