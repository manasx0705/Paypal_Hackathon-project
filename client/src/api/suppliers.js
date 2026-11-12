import { api, data } from './client';
export const listSuppliers = () => data(api.get('/suppliers'));
export const createSupplier = (body) => data(api.post('/suppliers', body));
export const updateSupplier = (id, body) => data(api.patch(`/suppliers/${id}`, body));
export const deleteSupplier = (id) => data(api.delete(`/suppliers/${id}`));
