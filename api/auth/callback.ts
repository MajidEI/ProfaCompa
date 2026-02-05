import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPkceData, exchangeCodeForToken } from '../../lib/salesforce';
import { setSessionCookie, handleCors } from '../../lib/auth';
import { getFrontendUrl } from '../../lib/config';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  
  const frontendUrl = getFrontendUrl();
  const { code, error, error_description, state } = req.query;
  
  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, error_description);
    return res.redirect(302, `${frontendUrl}?error=${encodeURIComponent(String(error))}`);
  }
  
  if (!code || typeof code !== 'string') {
    return res.redirect(302, `${frontendUrl}?error=no_code`);
  }
  
  // Get PKCE data
  let codeVerifier: string | undefined;
  let env: 'production' | 'sandbox' = 'production';
  
  if (state && typeof state === 'string') {
    const pkceData = getPkceData(state);
    if (pkceData) {
      codeVerifier = pkceData.verifier;
      env = pkceData.env;
    } else {
      console.warn('No PKCE data found for state:', state);
    }
  }
  
  try {
    // Exchange code for tokens
    const session = await exchangeCodeForToken(code, codeVerifier, env);
    
    // Set session cookie
    setSessionCookie(res, session);
    
    console.log('OAuth successful! User authenticated from:', session.instanceUrl);
    
    // Redirect to frontend
    res.redirect(302, `${frontendUrl}?auth=success`);
  } catch (err: any) {
    console.error('Token exchange error:', err.response?.data || err.message);
    res.redirect(302, `${frontendUrl}?error=token_exchange_failed`);
  }
}
