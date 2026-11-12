import { api, data } from './client';
export const getCart = (type) => data(api.get('/cart', { params: { type } }));
export const getCartCounts = () => data(api.get('/cart/counts'));
export const updateCartItem = (id, body) => data(api.patch(`/cart/${id}`, body));
