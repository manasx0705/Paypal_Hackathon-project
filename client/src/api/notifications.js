import { api, data } from './client';
export const listNotifications = (params) => data(api.get('/notifications', { params }));
export const markRead = (id) => data(api.patch(`/notifications/${id}/read`));
export const markAllRead = () => data(api.post('/notifications/read-all'));
