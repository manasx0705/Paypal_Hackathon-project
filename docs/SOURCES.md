# External sources: verified state

Checked on **2026-11-12** from India (Windows dev machine) using `curl` with the User-Agent `PalProcureBot/1.0`.

## RSS feeds (`server/src/config/feeds.json`)

| Source | URL | Result | Items |
|---|---|---|---|
| Economic Times | https://economictimes.indiatimes.com/rssfeedsdefault.cms | 200 ✅ | 76 |
| ET Agriculture | https://economictimes.indiatimes.com/news/economy/agriculture/rssfeeds/1202099874.cms | 200 ✅ | 50 |
| Mint | https://www.livemint.com/rss/news | 200 ✅ | 35 |
| Hindustan Times Lifestyle | https://www.hindustantimes.com/feeds/rss/lifestyle/rssfeed.xml | 200 ✅ | 67 |
| Inc42 | https://inc42.com/feed/ | 200 ✅ | 24 |
| YourStory | https://yourstory.com/feed | 200 ✅ | 20 |
| The Hindu Food | https://www.thehindu.com/life-and-style/food/feeder/default.rss | 200 ✅ | 60 |
| The Hindu Sport | https://www.thehindu.com/sport/feeder/default.rss | 200 ✅ | 60 |
| Indian Express Fitness | https://indianexpress.com/section/lifestyle/fitness/feed/ | 200 ✅ | 200 |
| Indian Express Food & Wine | https://indianexpress.com/section/lifestyle/food-wine/feed/ | 200 ✅ | 200 |
| Times of India Life & Style | https://timesofindia.indiatimes.com/rssfeeds/2886704.cms | 200 ✅ | 20 |
| Moneycontrol | https://www.moneycontrol.com/rss/latestnews.xml | **403 ❌, dropped** | – |
| Business Standard | https://www.business-standard.com/rss/latest.rss | **403 ❌, dropped** | – |

Only RSS metadata is used: title, link, date and a snippet held in memory for extraction. No article pages are fetched, and no body text is stored or displayed.

## Mandi prices (data.gov.in)

- Dataset: *Current Daily Price of Various Commodities from Various Markets (Mandi)*. The resource id `9ef84268-d588-465a-a308-a864a43d0070` responds at `https://api.data.gov.in/resource/<id>` and asks for an API key (`"Authorization field missing"`), so the endpoint is live. The dataset page returned 503 at check time.
- **Limitation:** this resource publishes *current-day* prices. The 7-day vs 30-day comparison needs history, so in real mode the adapter caches daily pulls (6 h TTL) and verification improves as history accumulates. Set `MANDI_RESOURCE_ID` to a historical variety-wise dataset if one is available to you.
- Free API key from data.gov.in. Limits are not published per key. We paginate 100 rows per call and cache for 6 hours.

## Google Trends

- No official API. pytrends (unofficial) is rate-limited (HTTP 429) and breaks without notice. It is isolated behind `TRENDS_PROXY_URL`, cached for 24 h, backs off on 429 and allows partial results. Offline fixtures: `server/fixtures/searchSeries.json` (10 keywords + anchor `chai`).

## News APIs (optional)

- `NEWS_API_PROVIDER=gnews`: free tier is 100 requests/day. `newsdata`: free tier is 200 credits/day. Both are counted daily, and the adapter stops at 80 % of quota. Limits were taken from the providers' public pricing pages and are not verified with a live key.

## PayPal

- Sandbox REST base `https://api-m.sandbox.paypal.com` was reachable (`/v1/oauth2/token` → 401 without credentials, as expected). Uses OAuth2 client credentials → `POST /v2/checkout/orders` (intent CAPTURE) → `POST /v2/checkout/orders/{id}/capture`. Client side: `@paypal/react-paypal-js` 8.7.0 buttons.

## Groq (LLM)

- Endpoint `https://api.groq.com/openai/v1/chat/completions` (OpenAI-compatible). Free tier with per-model request/token-per-minute limits shown at console.groq.com → Settings → Limits. Not verified with a live key at build time; the loop is tested against a stubbed endpoint (`server/tests/llm-agent.test.js`).
- Verified live on 2026-11-12 with the project key: `openai/gpt-oss-120b` (agent, function calling), `openai/gpt-oss-20b` (extraction, JSON mode), `meta-llama/llama-prompt-guard-2-86m` (injection screen). `llama-3.1-8b-instant` / `llama-3.3-70b-versatile` returned `model_not_found`. Check availability with `GET /openai/v1/models`. Override via `LLM_MODEL_AGENT` / `LLM_MODEL_EXTRACT` if Groq retires a model.
- A daily token budget is enforced in code (`LLM_DAILY_TOKEN_BUDGET`).
