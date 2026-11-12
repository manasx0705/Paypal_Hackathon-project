import { api, data } from './client';
export const getForecast = (productId) => data(api.get(`/forecasts/${productId}`));
