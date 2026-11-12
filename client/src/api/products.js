import { api, data } from './client';
export const listProducts = (params) => data(api.get('/products', { params }));
export const createProduct = (body) => data(api.post('/products', body));
export const updateProduct = (id, body) => data(api.patch(`/products/${id}`, body));
export const deleteProduct = (id) => data(api.delete(`/products/${id}`));
export const bulkDeactivate = (ids) => data(api.post('/products/bulk-deactivate', { ids }));
export const getCategories = () => data(api.get('/products/categories'));
