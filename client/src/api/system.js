import { api, data } from './client';
export const getStatus = () => data(api.get('/system/status'));
export const runJob = (name) => data(api.post(`/admin/jobs/${name}/run`));
