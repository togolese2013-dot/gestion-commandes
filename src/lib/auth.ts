import type { APIContext, AstroGlobal } from 'astro';
import { createHmac } from 'crypto';
import { getEnv } from './env';

const SESSION_COOKIE = 'gestion_session';
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours in ms

function getSecret(): string {
  return getEnv('SESSION_SECRET', 'fallback_secret');
}

function sign(value: string): string {
  const hmac = createHmac('sha256', getSecret());
  hmac.update(value);
  return `${value}.${hmac.digest('hex')}`;
}

function verify(signed: string): string | null {
  const lastDot = signed.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  const expected = sign(value);
  return signed === expected ? value : null;
}

export function buildSessionCookieHeader(): string {
  const expires = Date.now() + SESSION_DURATION;
  const value = sign(`auth:${expires}`);
  // SameSite=Lax allows cookie to be sent after redirect; Secure required for HTTPS
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=${SESSION_DURATION / 1000}`;
}

export function isAuthenticated(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return false;
  const value = verify(raw);
  if (!value) return false;
  const expires = parseInt(value.split(':')[1], 10);
  return Date.now() < expires;
}

export function checkAdminPassword(password: string): boolean {
  return password === getEnv('ADMIN_PASSWORD');
}

/** Redirect to login if not authenticated */
export function requireAuth(context: AstroGlobal | APIContext): Response | null {
  if (!isAuthenticated(context.request)) {
    return context.redirect('/login');
  }
  return null;
}
