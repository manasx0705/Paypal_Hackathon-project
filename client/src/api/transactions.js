import { api, data } from './client';
// kind = 'sales' | 'purchases'
export const listTx = (kind, params) => data(api.get(`/${kind}`, { params }));
export const createTx = (kind, body) => data(api.post(`/${kind}`, body));
export const updateTx = (kind, id, body) => data(api.patch(`/${kind}/${id}`, body));
export const deleteTx = (kind, id) => data(api.delete(`/${kind}/${id}`));
export const bulkTx = (kind, rows) => data(api.post(`/${kind}/bulk`, { rows }));
