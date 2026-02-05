import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearSessionCookie, handleCors } from '../../lib/auth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  clearSessionCookie(res);
  res.json({ success: true });
}
