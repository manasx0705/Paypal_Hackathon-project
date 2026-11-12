import { api, data } from './client';
export const runAgent = () => data(api.post('/agent/run'));
export const listRuns = () => data(api.get('/agent/runs'));
export const getRun = (id) => data(api.get(`/agent/runs/${id}`));
