import jwt from 'jsonwebtoken';
import { config } from './config';
import type { UserSession, JWTPayload } from './types';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const COOKIE_NAME = 'sf_session';
const JWT_EXPIRY = '24h';

/**
 * Create a JWT token from the user session
 */
export function createSessionToken(session: UserSession): string {
  const payload: JWTPayload = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    instanceUrl: session.instanceUrl,
    userId: session.userId,
    organizationId: session.organizationId,
    expiresAt: session.expiresAt,
  };
  
  return jwt.sign(payload, config.jwtSecret, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify and decode a JWT token
 */
export function verifySessionToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JWTPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Extract session from request cookies
 */
export function getSessionFromRequest(req: VercelRequest): UserSession | null {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  
  if (!token) {
    return null;
  }
  
  const payload = verifySessionToken(token);
  if (!payload) {
    return null;
  }
  
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    instanceUrl: payload.instanceUrl,
    userId: payload.userId,
    organizationId: payload.organizationId,
    expiresAt: payload.expiresAt,
  };
}

/**
 * Set session cookie on response
 */
export function setSessionCookie(res: VercelResponse, session: UserSession): void {
  const token = createSessionToken(session);
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  
  const cookieOptions = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${24 * 60 * 60}`, // 24 hours
    isProduction ? 'Secure' : '',
    isProduction ? 'SameSite=None' : 'SameSite=Lax',
  ].filter(Boolean).join('; ');
  
  res.setHeader('Set-Cookie', cookieOptions);
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(res: VercelResponse): void {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  
  const cookieOptions = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isProduction ? 'Secure' : '',
    isProduction ? 'SameSite=None' : 'SameSite=Lax',
  ].filter(Boolean).join('; ');
  
  res.setHeader('Set-Cookie', cookieOptions);
}

/**
 * Parse cookies from header string
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.split('=');
    if (name && rest.length > 0) {
      cookies[name.trim()] = rest.join('=').trim();
    }
  });
  
  return cookies;
}

/**
 * CORS headers for API responses
 */
export function setCorsHeaders(res: VercelResponse, origin?: string): void {
  const allowedOrigin = origin || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Handle CORS preflight
 */
export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  setCorsHeaders(res, req.headers.origin);
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  
  return false;
}
