import { api, data } from './client';
export const register = (body) => data(api.post('/auth/register', body));
export const login = (body) => data(api.post('/auth/login', body));
export const demo = (shop) => data(api.post('/auth/demo', { shop }));
export const logout = () => data(api.post('/auth/logout'));
export const getMe = () => data(api.get('/me'));
export const updateMe = (body) => data(api.patch('/me', body));
export const deleteMe = (password) => data(api.delete('/me', { data: { password } }));
