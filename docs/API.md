# API contract (v1)

Base: `/api/v1`. JSON, camelCase. Errors: `{ error: { code, message, details } }`.
Auth: `Authorization: Bearer <accessToken>` (15 min). Refresh token in httpOnly cookie `rt` (path `/api/v1/auth`).
Lists: `?page&limit` → `{ items, page, limit, total }` unless noted. Money = INR numbers. Dates ISO UTC.

## Auth
| Method | Path | Body | Response |
|---|---|---|---|
| POST | /auth/register | `{name,email,password(>=10),shopName,shopType,location:{state,district,city,pincode}}` | `{accessToken, vendor}` |
| POST | /auth/login | `{email,password}` | `{accessToken, vendor}` |
| POST | /auth/demo | `{shop?: 'grocery'|'sports'|'furniture'}` | `{accessToken, vendor}` — logs into a seeded demo vendor |
| POST | /auth/refresh | – (cookie) | `{accessToken, vendor}` |
| POST | /auth/logout | – | `{ok:true}` |
| GET/PATCH/DELETE | /me | PATCH `{name,shopName,location,settings}`; DELETE `{password}` | vendor |

`vendor = {_id,name,email,shopName,shopType,location:{state,district,city,pincode},settings:{autoOrderEnabled,weeklySpendCapINR,maxQtyMultiplier,trendMinScore,lowStockNotify,deadStockMonths,emailDigest}}`
shopType ∈ grocery, sports, furniture, electronics, general.

## System
- `GET /system/status` (no auth) → `{fixtureMode, agentMode:'llm'|'rules', paymentsMode:'paypal'|'simulated', lastJobs:[{name,status,finishedAt}]}`
- `GET /health`, `GET /health/deep`

## Products & suppliers
- `GET /products?search&category&status=ok|low|out&active=true&page&limit` → list of product
- `product = {_id,sku,name,category,unit,perishable,shelfLifeDays,costPrice,sellPrice,currentStock,leadTimeDays,packSize,supplierId,isRegularStock,isActive,reorderPoint,safetyStock,status:'ok'|'low'|'out'}`
- `POST /products`, `PATCH /products/:id`, `DELETE /products/:id` (deactivates), `POST /products/bulk-deactivate {ids}`
- `GET /products/categories` → `[string]`
- `GET/POST /suppliers`, `PATCH/DELETE /suppliers/:id`; `supplier = {_id,name,phone,email,defaultLeadTimeDays,channel:'email'|'log',paypalEmail}` (GET returns plain array)

## Sales & purchases
- `GET /sales?productId&from&to&page&limit` → items `{_id,productId,product:{name,sku,unit},qty,unitPrice,unitCostAtSale,date}`
- `POST /sales {productId,qty,unitPrice,date}`, `PATCH /sales/:id`, `DELETE /sales/:id`, `POST /sales/bulk {rows:[...]}` (≤500)
- `/purchases` identical, with `unitCost` instead of `unitPrice`.
- Stock side effects are server-side; a sale that would make stock negative → 409 `INSUFFICIENT_STOCK`.

## Import
- `GET /import/templates/:type` (type = products|sales|purchases) → text/csv
- `POST /import/:type/dry-run` multipart field `file` → `{importId,type,counts:{total,valid,errors,duplicates},errors:[{row,field,message}],preview:[row],categorySuggestions:[{row,sku,name,suggested}]}`
- `POST /import/:importId/commit` → `{type,inserted,skipped}`
- `GET /data-quality` → `{score(0-100), issues:[{type,message,count,productIds}]}`

## Analytics
- `GET /analytics/overview` → `{inventoryValue,revenue30d,profit30d,units30d,lowStockCount,outOfStockCount,deadStockValue,openCartItems,productCount}`
- `GET /analytics/category-sales?from&to` → `[{category,month,units,revenue,profit}]`
- `GET /analytics/growth?level=category|product&months=3` → `[{key,name,lastMonth,prevMonth,momGrowth,avgGrowth3}]` (growth as fraction, e.g. 0.12)
- `GET /analytics/top-products?metric=revenue|units|profit&order=desc|asc&limit=5` → `[{productId,name,category,value}]`
- `GET /analytics/dead-stock?months=3` → `[{productId,name,category,currentStock,value,lastSaleDate}]`
- `GET /analytics/forecast-accuracy` → `{count,modelMape,naiveMape,beatNaivePct,byConfidence:{high,medium,low}}`
- `GET /analytics/inventory-value` → `[{category,value}]`

## Forecasts
- `GET /forecasts/:productId` → `{productId,method,confidence,months:[{month,predictedQty,lower,upper}],history:[{month,qty,gap}],orderQty,reorderPoint,safetyStock,growthRate,mape,naiveMape,explain:{dailyDemand,leadTimeDays,sigmaDaily,z,coverDays,currentStock,packSize,steps:[string]}}` or `{method:'insufficient_data', history}`

## Cart (three carts)
- `GET /cart?type=main|social|price` → `{items:[cartItem], meta:{autoOrderEnabled,weeklySpendCapINR,weeklySpentINR,maxQtyMultiplier}}`
- `GET /cart/counts` → `{main,social,price}` (open = status suggested|approved)
- `PATCH /cart/:id {status:'approved'|'dismissed', suggestedQty?}` → `{item, order?}` (approving a main or price item creates/merges a draft order per supplier; approving a social item records the outcome and creates a trial product draft order only if `productId` exists)
- `cartItem = {_id,cartType,productId,product:{_id,name,sku,unit,currentStock,perishable,category,costPrice},keyword,trendId,alertId,label:'Expected'|'Already happened'|null,suggestedQty,minQty,maxQty,reason,evidenceIds,confidence,kind:'suggestion'|'info',status:'suggested'|'approved'|'ordered'|'dismissed',explain:{...free-form numbers used},score,trendStatus,createdAt}`

## Agent
- `POST /agent/run` → `{runId,status}` (rate limited 5/h; if a run is active returns its id)
- `GET /agent/runs` → `[run]`; `GET /agent/runs/:id` → `run = {_id,trigger,mode:'llm'|'rules',status:'running'|'done'|'failed',steps:[{tool,input,output,ok,ms}],summary,tokensIn,tokensOut,startedAt,finishedAt,error}`

## Orders & PayPal
- `GET /orders?status` → `[order]`; `GET /orders/:id` → order
- `order = {_id,supplier:{_id,name,email,paypalEmail},items:[{productId,name,unit,qty,unitCost,receivedQty}],totalINR,status:'draft'|'sent'|'received'|'cancelled',origin:'agent'|'vendor',payment:{status:'unpaid'|'paid',provider,paypalOrderId,captureId,amount,currency,paidAt},sentAt,receivedAt,createdAt}`
- `POST /orders/:id/send`, `POST /orders/:id/receive {lines:[{productId,qty}]}` (partial allowed), `POST /orders/:id/cancel`
- `GET /payments/config` → `{mode:'paypal'|'simulated',clientId,currency,fxInrToCurrency}`
- `POST /payments/orders/:orderId/create` → `{paypalOrderId,amount,currency}`
- `POST /payments/orders/:orderId/capture {paypalOrderId}` → order

## Trends
- `GET /trends?fit=true&minScore&status` → `[{_id,keyword,score,status,flags,categoryTags,fits,components:{distinctPeople,searchGrowth,sourceCount},peopleCount,evidenceCount,sparkline:[number],lastSeen}]`
- `GET /trends/:id` → above + `{searchSeries:[{date,value}],people:[{name,role,mentions}],evidence:[{articleId,url,title,source,publishedAt,people,summary}],breakdown:{people:{value,cap,weight,points},search:{...},sources:{...},sponsoredMultiplier,total}}`
- `GET /trends/stats` → `{rate,evaluated,crossed,pending,perTrend:[{keyword,action,soldQty30d,crossedOver,evaluatedAt}]}`

## Price alerts
- `GET /alerts?state=active|dismissed|expired` → `[{_id,label:'Expected'|'Already happened',state,commodity,direction,scope,regions,severity,verified,sourceCount,matchedProducts:[{_id,name,perishable}],suggestedQtyByProduct:{[productId]:number},message,createdAt}]`
- `GET /alerts/:id` → above + `{signal:{driver,confidence,status,verifiedDetail:{market,recentAvg,prevAvg,changePct},chainInference:{label:'inferred',confidence,levels:[{level,articleIds,note}]}},articles:[{_id,url,title,source,publishedAt,summary}]}`
- `PATCH /alerts/:id {state:'dismissed'}`

## Notifications
- `GET /notifications?unread=true` → `{items:[{_id,type,message,refType,refId,readAt,createdAt}],unreadCount}`
- `PATCH /notifications/:id/read`, `POST /notifications/read-all`

## Admin
- `POST /admin/jobs/:name/run` (ADMIN_EMAILS only; in FIXTURE_MODE any demo vendor) — names: ingest, forecasts, agents, maintenance, weekly
