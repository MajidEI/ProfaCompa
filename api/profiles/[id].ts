import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromRequest, handleCors } from '../../lib/auth';
import { ProfileNormalizer } from '../../lib/normalizer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const session = getSessionFromRequest(req);
  
  if (!session?.accessToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Profile ID is required' });
  }
  
  // Validate profile ID format
  if (!/^[a-zA-Z0-9]{15,18}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid profile ID format' });
  }
  
  try {
    const normalizer = new ProfileNormalizer(session);
    const [profile] = await normalizer.normalizeProfiles([id]);
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.json(profile);
  } catch (err: any) {
    console.error('Error fetching profile:', err.response?.data || err.message);
    
    if (err.response?.status === 401) {
      return res.status(401).json({ error: 'Session expired. Please re-authenticate.' });
    }
    
    res.status(500).json({ error: 'Failed to fetch profile details' });
  }
}
