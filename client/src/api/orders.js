import { api, data } from './client';
export const listOrders = (params) => data(api.get('/orders', { params }));
export const getOrder = (id) => data(api.get(`/orders/${id}`));
export const sendOrder = (id) => data(api.post(`/orders/${id}/send`));
export const receiveOrder = (id, lines) => data(api.post(`/orders/${id}/receive`, { lines }));
export const cancelOrder = (id) => data(api.post(`/orders/${id}/cancel`));
