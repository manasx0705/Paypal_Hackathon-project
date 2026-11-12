/** External data adapters: RSS feeds, search interest, mandi prices, news API. Each has a fixture twin. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Parser from 'rss-parser';
import { env } from '../config/env.js';
import feeds from '../config/feeds.json' with { type: 'json' };
import { logger } from '../utils/logger.js';
import { CircuitBreaker, addUsage, cached, fetchJson, getUsage, quotaAllows, withRetry } from './core.js';
import { registerLlmFixture } from './llm.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const readFixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));
const DAY = 86400000;
const UA = 'PalProcureBot/1.0 (+https://github.com/manasx0705/Paypal_Hackathon-project)';

// ---------------------------------------------------------------- FeedReader
const feedBreaker = new CircuitBreaker('rss');
export const FeedReader = {
  /** Returns [{url,title,source,publishedAt,snippet}] — snippet is used for extraction only and never stored. */
  async fetchAll() {
    if (env.fixtureMode) {
      const { articles } = readFixture('articles.json');
      return articles.map((a) => {
        registerLlmFixture(`extract:${a.url}`, a.llm);
        return { url: a.url, title: a.title, source: a.source, snippet: a.snippet, publishedAt: new Date(Date.now() - a.daysAgo * DAY), fixture: true };
      });
    }
    const parser = new Parser({ timeout: 20000, headers: { 'User-Agent': UA } });
    const out = [];
    for (const f of feeds) {
      try {
        const feed = await feedBreaker.exec(() => withRetry(() => parser.parseURL(f.url), { retries: 1 }));
        for (const it of feed.items.slice(0, 30)) {
          if (!it.link) continue;
          out.push({ url: it.link, title: it.title || '', source: f.name, snippet: (it.contentSnippet || it.content || '').slice(0, 600), publishedAt: new Date(it.isoDate || it.pubDate || Date.now()) });
        }
      } catch (e) {
        logger.warn({ feed: f.name, err: e.message }, 'feed failed');
      }
    }
    return out;
  },
};

// ---------------------------------------------------------------- TrendsClient
const trendsBreaker = new CircuitBreaker('google_trends');
export const TrendsClient = {
  /**
   * Interest over time for ≤4 keywords + the anchor, geo IN, last 3 months, weekly. Cached 24h.
   * Returns { reference: number[], series: { [kw]: { values: number[], anchor: number[] } } } (anchor = anchor series in the same request).
   */
  async interestOverTime(keywords, anchor) {
    if (env.fixtureMode) {
      const fx = readFixture('searchSeries.json');
      const series = {};
      for (const k of keywords) {
        const b = fx.batches.find((x) => x.series[k]);
        if (b) series[k] = { values: b.series[k], anchor: b.anchor };
      }
      return { reference: fx.reference, series };
    }
    // Google Trends has no official public API; the unofficial endpoint (pytrends) breaks often.
    // A TRENDS_PROXY_URL may point at a pytrends sidecar returning {anchor, reference, series}.
    if (!process.env.TRENDS_PROXY_URL) return null;
    const url = `${process.env.TRENDS_PROXY_URL}/interest?kw=${encodeURIComponent([...keywords, anchor].join(','))}&geo=IN&timeframe=${encodeURIComponent('today 3-m')}`;
    return cached(`trends:${keywords.join('|')}`, DAY, () =>
      trendsBreaker.exec(() => withRetry(() => fetchJson(url), { retries: 3, baseMs: 2000, isRetryable: (e) => e.status === 429 || !e.status })),
    );
  },
  async relatedRising(term) {
    if (env.fixtureMode) return readFixture('rising.json')[term] || [];
    if (!process.env.TRENDS_PROXY_URL) return [];
    return cached(`rising:${term}`, DAY, () => trendsBreaker.exec(() => fetchJson(`${process.env.TRENDS_PROXY_URL}/rising?term=${encodeURIComponent(term)}&geo=IN`)));
  },
};

// ---------------------------------------------------------------- MandiClient
const mandiBreaker = new CircuitBreaker('mandi');
export const MandiClient = {
  /** Daily mandi rows → [{date, modalPrice, market}] for state/district/commodity. Cached 6h. */
  async getPrices({ state, district, commodity }) {
    if (env.fixtureMode) {
      return readFixture('mandi.json')
        .rows.filter((r) => r.commodity.toLowerCase() === String(commodity).toLowerCase() && r.state === state && (!district || r.district === district))
        .map((r) => ({ date: new Date(Date.now() - r.daysAgo * DAY), modalPrice: r.modalPrice, market: r.market }));
    }
    if (!env.mandiApiKey || !env.mandiResourceId) return [];
    const key = `mandi:${state}:${district}:${commodity}`;
    return cached(key, 6 * 3600 * 1000, async () => {
      const rows = [];
      for (let offset = 0; offset < 1000; offset += 100) {
        const q = new URLSearchParams({ 'api-key': env.mandiApiKey, format: 'json', limit: '100', offset: String(offset), 'filters[state]': state, 'filters[commodity]': commodity });
        if (district) q.set('filters[district]', district);
        const page = await mandiBreaker.exec(() => withRetry(() => fetchJson(`https://api.data.gov.in/resource/${env.mandiResourceId}?${q}`)));
        const recs = page.records || [];
        for (const r of recs) {
          const [d, m, y] = String(r.arrival_date).split('/');
          rows.push({ date: new Date(`${y}-${m}-${d}T00:00:00+05:30`), modalPrice: Number(r.modal_price), market: r.market });
        }
        if (recs.length < 100) break;
      }
      return rows;
    });
  },
};

// ---------------------------------------------------------------- NewsApiClient
const newsBreaker = new CircuitBreaker('news_api');
const NEWS_LIMITS = { gnews: 100, newsdata: 200 };
export const NewsApiClient = {
  async search(query) {
    if (env.fixtureMode || !env.newsApiKey || !env.newsApiProvider) return [];
    const limit = NEWS_LIMITS[env.newsApiProvider] || 100;
    if (!quotaAllows(await getUsage(`news:${env.newsApiProvider}`), limit)) {
      logger.warn('news API quota at 80%, skipping');
      return [];
    }
    await addUsage(`news:${env.newsApiProvider}`);
    if (env.newsApiProvider === 'gnews') {
      const r = await newsBreaker.exec(() => fetchJson(`https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&country=in&max=10&apikey=${env.newsApiKey}`));
      return (r.articles || []).map((a) => ({ url: a.url, title: a.title, source: a.source?.name || 'GNews', snippet: a.description || '', publishedAt: new Date(a.publishedAt) }));
    }
    const r = await newsBreaker.exec(() => fetchJson(`https://newsdata.io/api/1/news?apikey=${env.newsApiKey}&country=in&language=en&q=${encodeURIComponent(query)}`));
    return (r.results || []).map((a) => ({ url: a.link, title: a.title, source: a.source_id || 'newsdata', snippet: a.description || '', publishedAt: new Date(a.pubDate) }));
  },
};
