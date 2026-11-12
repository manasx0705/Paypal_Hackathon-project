import 'dotenv/config';

const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

process.env.TZ = process.env.TZ || 'Asia/Kolkata';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-access-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-only-refresh-secret-change-me',
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  groqKey: process.env.GROQ_API_KEY || '',
  llmModelAgent: process.env.LLM_MODEL_AGENT || 'openai/gpt-oss-120b',
  llmModelExtract: process.env.LLM_MODEL_EXTRACT || 'openai/gpt-oss-20b',
  guardModel: process.env.LLM_MODEL_GUARD ?? 'meta-llama/llama-prompt-guard-2-86m',
  llmDailyTokenBudget: num(process.env.LLM_DAILY_TOKEN_BUDGET, 200000),
  // Default ON so the project runs fully offline for judges.
  fixtureMode: bool(process.env.FIXTURE_MODE, true),
  smtpUrl: process.env.SMTP_URL || '',
  newsApiProvider: process.env.NEWS_API_PROVIDER || '',
  newsApiKey: process.env.NEWS_API_KEY || '',
  mandiApiKey: process.env.MANDI_API_KEY || '',
  mandiResourceId: process.env.MANDI_RESOURCE_ID || '',
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
  paypalEnv: process.env.PAYPAL_ENV || 'sandbox',
  paypalCurrency: process.env.PAYPAL_CURRENCY || 'USD',
  paypalFxInr: num(process.env.PAYPAL_FX_INR_TO_CURRENCY, 0.012),
  autoSeed: bool(process.env.AUTO_SEED, true),
  enableCron: bool(process.env.ENABLE_CRON, true),
};

/**
 * The LLM (Groq) plans carts whenever GROQ_API_KEY is set — also in FIXTURE_MODE, where only the external
 * DATA is replayed offline. Set AGENT_USE_LLM=false to force the zero-token rules planner.
 */
export const llmEnabled = () => Boolean(env.groqKey) && bool(process.env.AGENT_USE_LLM, true);
export const paypalEnabled = () => Boolean(env.paypalClientId && env.paypalClientSecret);
