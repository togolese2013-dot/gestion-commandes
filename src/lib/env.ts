import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root
const __dirname = fileURLToPath(new URL('.', import.meta.url));
config({ path: resolve(__dirname, '..', '..', '..', '.env') });

export function getEnv(key: string, fallback = ''): string {
  // Try import.meta.env first (Vite), then process.env (Node)
  const viteMeta = (import.meta as any).env?.[key];
  return viteMeta ?? process.env[key] ?? fallback;
}
