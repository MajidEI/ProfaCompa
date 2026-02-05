import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/auth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL ? 'vercel' : 'local',
  });
}
