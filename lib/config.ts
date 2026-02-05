/**
 * Configuration for Vercel serverless functions
 * Environment variables are read at runtime
 */

export const config = {
  // Salesforce OAuth settings
  salesforce: {
    clientId: process.env.SF_CLIENT_ID || '',
    clientSecret: process.env.SF_CLIENT_SECRET || '',
    callbackUrl: process.env.SF_CALLBACK_URL || '',
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
  },
  
  // JWT secret for session tokens
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  
  // Frontend URL for redirects
  frontendUrl: process.env.FRONTEND_URL || process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:5173',
  
  // API settings
  api: {
    queryBatchSize: 2000,
    timeout: 120000,
    maxConcurrentRequests: 5,
  },
};

/**
 * Get the frontend URL, handling Vercel's automatic URL
 */
export function getFrontendUrl(): string {
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:5173';
}
