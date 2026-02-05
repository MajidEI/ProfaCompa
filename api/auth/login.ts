import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthorizationUrl } from '../../lib/salesforce';
import { handleCors } from '../../lib/auth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  
  const env = req.query.env === 'sandbox' ? 'sandbox' : 'production';
  const { url } = getAuthorizationUrl(env);
  
  console.log(`Redirecting to Salesforce OAuth (${env})...`);
  res.redirect(302, url);
}
