import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromRequest, handleCors } from '../../lib/auth';
import { SalesforceService } from '../../lib/salesforce';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const session = getSessionFromRequest(req);
  
  if (!session?.accessToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const sfService = new SalesforceService(session);
    const profiles = await sfService.getAllProfiles();
    
    res.json({
      profiles: profiles.map(p => ({
        id: p.Id,
        name: p.Name,
      })),
    });
  } catch (err: any) {
    console.error('Error fetching profiles:', err.response?.data || err.message);
    
    if (err.response?.status === 401) {
      return res.status(401).json({ error: 'Session expired. Please re-authenticate.' });
    }
    
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
}
