/** Minimal OpenAPI 3.1 document generated from the shared Zod schemas (served at /api/v1/docs). */
import { z } from 'zod';
import { S } from './schemas.js';

const toJson = (schema) => {
  try {
    return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  } catch {
    return {};
  }
};
const body = (s) => ({ requestBody: { content: { 'application/json': { schema: toJson(s) } } } });
const ROUTES = [
  ['post', '/auth/register', S.register], ['post', '/auth/login', S.login], ['post', '/auth/demo', S.demo], ['post', '/auth/refresh'], ['post', '/auth/logout'],
  ['get', '/me'], ['patch', '/me', S.patchMe], ['delete', '/me', S.deleteMe],
  ['get', '/products'], ['post', '/products', S.product], ['patch', '/products/{id}', S.product.partial()], ['delete', '/products/{id}'],
  ['get', '/suppliers'], ['post', '/suppliers', S.supplier],
  ['get', '/sales'], ['post', '/sales', S.sale], ['post', '/sales/bulk', S.bulkSales], ['get', '/purchases'], ['post', '/purchases', S.purchase],
  ['get', '/import/templates/{type}'], ['post', '/import/{type}/dry-run'], ['post', '/import/{importId}/commit'], ['get', '/data-quality'],
  ['get', '/analytics/overview'], ['get', '/analytics/category-sales'], ['get', '/analytics/growth'], ['get', '/analytics/top-products'], ['get', '/analytics/dead-stock'], ['get', '/analytics/forecast-accuracy'], ['get', '/analytics/inventory-value'],
  ['get', '/forecasts/{id}'], ['get', '/cart'], ['get', '/cart/counts'], ['patch', '/cart/{id}', S.cartPatch],
  ['post', '/agent/run'], ['get', '/agent/runs'], ['get', '/agent/runs/{id}'],
  ['get', '/orders'], ['get', '/orders/{id}'], ['post', '/orders/{id}/send'], ['post', '/orders/{id}/receive', S.receive], ['post', '/orders/{id}/cancel'],
  ['get', '/payments/config'], ['post', '/payments/orders/{id}/create'], ['post', '/payments/orders/{id}/capture', S.capture],
  ['get', '/trends'], ['get', '/trends/stats'], ['get', '/trends/{id}'], ['get', '/alerts'], ['get', '/alerts/{id}'], ['patch', '/alerts/{id}', S.alertPatch],
  ['get', '/notifications'], ['patch', '/notifications/{id}/read'], ['post', '/notifications/read-all'], ['post', '/admin/jobs/{name}/run'],
];

let cache = null;
export function openApiDoc() {
  if (cache) return cache;
  const paths = {};
  for (const [m, p, s] of ROUTES) {
    paths[p] = paths[p] || {};
    paths[p][m] = { summary: `${m.toUpperCase()} ${p}`, ...(s ? body(s) : {}), responses: { 200: { description: 'OK' } } };
  }
  cache = { openapi: '3.1.0', info: { title: 'PalProcure API', version: '1.0.0' }, servers: [{ url: '/api/v1' }], components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } }, security: [{ bearer: [] }], paths };
  return cache;
}
