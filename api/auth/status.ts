import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromRequest, handleCors } from '../../lib/auth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  
  const session = getSessionFromRequest(req);
  
  if (!session?.accessToken) {
    return res.status(401).json({ authenticated: false });
  }
  
  // Check if token might be expired
  const isExpired = session.expiresAt && Date.now() > session.expiresAt;
  
  res.json({
    authenticated: true,
    expired: isExpired,
    instanceUrl: session.instanceUrl,
    userId: session.userId,
    organizationId: session.organizationId,
  });
}
