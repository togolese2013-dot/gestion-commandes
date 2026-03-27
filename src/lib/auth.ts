import type { APIContext, AstroGlobal } from 'astro';
import { createHmac } from 'crypto';
import { getEnv } from './env';
import { getDb } from './db';

const SESSION_COOKIE = 'gestion_session';
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours in ms

export interface SessionUser {
  id: number;
  username: string;
  full_name: string;
  role: string;
}

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

export function buildSessionCookieHeader(userId: number): string {
  const expires = Date.now() + SESSION_DURATION;
  const value = sign(`user:${userId}:${expires}`);
  // SameSite=Lax allows cookie to be sent after redirect; Secure required for HTTPS
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=${SESSION_DURATION / 1000}`;
}

function parseSession(request: Request): { userId: number; expires: number } | null {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const value = verify(raw);
  if (!value) return null;
  const parts = value.split(':');
  if (parts[0] !== 'user' || parts.length < 3) return null;
  const userId = parseInt(parts[1], 10);
  const expires = parseInt(parts[2], 10);
  if (isNaN(userId) || isNaN(expires)) return null;
  return { userId, expires };
}

export function isAuthenticated(request: Request): boolean {
  const session = parseSession(request);
  if (!session) return false;
  return Date.now() < session.expires;
}

export function getCurrentUser(request: Request): SessionUser | null {
  const session = parseSession(request);
  if (!session || Date.now() >= session.expires) return null;
  const db = getDb();
  const user = db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?').get(session.userId) as SessionUser | undefined;
  return user ?? null;
}

export function checkUserCredentials(username: string, password: string): SessionUser | null {
  const db = getDb();
  const user = db.prepare('SELECT id, username, full_name, role, password FROM users WHERE username = ?').get(username) as (SessionUser & { password: string }) | undefined;
  if (!user || user.password !== password) return null;
  return { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
}

/** Redirect to login if not authenticated */
export function requireAuth(context: AstroGlobal | APIContext): Response | null {
  if (!isAuthenticated(context.request)) {
    return context.redirect('/login');
  }
  return null;
}
