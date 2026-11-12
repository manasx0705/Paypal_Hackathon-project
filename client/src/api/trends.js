import { api, data } from './client';
export const listTrends = (params) => data(api.get('/trends', { params }));
export const getTrend = (id) => data(api.get(`/trends/${id}`));
export const getTrendStats = () => data(api.get('/trends/stats'));
