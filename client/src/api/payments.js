import { api, data } from './client';
export const getPaymentsConfig = () => data(api.get('/payments/config'));
export const createPayment = (orderId) => data(api.post(`/payments/orders/${orderId}/create`));
export const capturePayment = (orderId, paypalOrderId) =>
  data(api.post(`/payments/orders/${orderId}/capture`, { paypalOrderId }));
