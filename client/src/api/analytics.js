import { api, data } from './client';
export const getOverview = () => data(api.get('/analytics/overview'));
export const getCategorySales = (params) => data(api.get('/analytics/category-sales', { params }));
export const getGrowth = (params) => data(api.get('/analytics/growth', { params }));
export const getTopProducts = (params) => data(api.get('/analytics/top-products', { params }));
export const getDeadStock = (params) => data(api.get('/analytics/dead-stock', { params }));
export const getForecastAccuracy = () => data(api.get('/analytics/forecast-accuracy'));
export const getInventoryValue = () => data(api.get('/analytics/inventory-value'));
