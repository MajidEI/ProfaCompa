import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromRequest, handleCors } from '../../lib/auth';
import { ProfileNormalizer } from '../../lib/normalizer';
import { DiffEngine } from '../../lib/diff';
import type { CompareRequest, CompareResponse } from '../../lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const session = getSessionFromRequest(req);
  
  if (!session?.accessToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const { profileIds } = req.body as CompareRequest;
    
    // Validate request
    if (!profileIds || !Array.isArray(profileIds)) {
      return res.status(400).json({ error: 'profileIds array is required' });
    }
    
    if (profileIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 profiles are required for comparison' });
    }
    
    if (profileIds.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 profiles can be compared at once' });
    }
    
    // Validate profile ID format
    const invalidIds = profileIds.filter(id => !/^[a-zA-Z0-9]{15,18}$/.test(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ error: `Invalid profile ID format: ${invalidIds.join(', ')}` });
    }
    
    console.log(`Comparing ${profileIds.length} profiles: ${profileIds.join(', ')}`);
    
    // Normalize profiles
    const normalizer = new ProfileNormalizer(session);
    const normalizedProfiles = await normalizer.normalizeProfiles(profileIds);
    
    if (normalizedProfiles.length < 2) {
      return res.status(400).json({ error: 'Could not find enough valid profiles' });
    }
    
    // Run diff
    const diffEngine = new DiffEngine();
    const comparison = diffEngine.compare(normalizedProfiles);
    
    console.log(`Comparison complete. Found ${comparison.totalDifferences} differences.`);
    
    const response: CompareResponse = {
      comparison,
      profiles: normalizedProfiles,
    };
    
    res.json(response);
  } catch (err: any) {
    console.error('Error comparing profiles:', err.response?.data || err.message);
    
    if (err.response?.status === 401) {
      return res.status(401).json({ error: 'Session expired. Please re-authenticate.' });
    }
    
    res.status(500).json({
      error: 'Failed to compare profiles',
      details: err.message,
    });
  }
}
