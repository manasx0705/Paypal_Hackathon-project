import { api, data } from './client';
export const listAlerts = (params) => data(api.get('/alerts', { params }));
export const getAlert = (id) => data(api.get(`/alerts/${id}`));
export const dismissAlert = (id) => data(api.patch(`/alerts/${id}`, { state: 'dismissed' }));
