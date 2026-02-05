import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromRequest, setSessionCookie, handleCors } from '../../lib/auth';
import { refreshAccessToken } from '../../lib/salesforce';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const session = getSessionFromRequest(req);
  
  if (!session?.refreshToken) {
    return res.status(401).json({ error: 'No refresh token available' });
  }
  
  try {
    const newSession = await refreshAccessToken(session.refreshToken);
    setSessionCookie(res, newSession);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Token refresh error:', err.response?.data || err.message);
    res.status(401).json({ error: 'Token refresh failed' });
  }
}
