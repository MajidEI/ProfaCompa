import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { config } from './config';
import type {
  SalesforceProfile,
  SalesforceObjectPermission,
  SalesforceFieldPermission,
  SalesforcePermissionSet,
  SalesforceSetupEntityAccess,
  UserSession,
} from './types';

// PKCE Storage (in-memory, works for serverless with short-lived state)
const pkceStore = new Map<string, { verifier: string; env: string; expires: number }>();

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

function getLoginUrl(env: 'production' | 'sandbox'): string {
  return env === 'sandbox' ? 'https://test.salesforce.com' : 'https://login.salesforce.com';
}

/**
 * Generate OAuth authorization URL with PKCE
 */
export function getAuthorizationUrl(env: 'production' | 'sandbox' = 'production'): { url: string; state: string } {
  const loginUrl = getLoginUrl(env);
  const baseUrl = `${loginUrl}/services/oauth2/authorize`;
  
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  
  // Store PKCE data with 10-minute expiry
  pkceStore.set(state, {
    verifier: codeVerifier,
    env,
    expires: Date.now() + 10 * 60 * 1000,
  });
  
  // Cleanup old entries
  for (const [key, value] of pkceStore.entries()) {
    if (value.expires < Date.now()) {
      pkceStore.delete(key);
    }
  }
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.salesforce.clientId,
    redirect_uri: config.salesforce.callbackUrl,
    scope: 'api refresh_token',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  
  return { url: `${baseUrl}?${params.toString()}`, state };
}

/**
 * Get stored PKCE data for state
 */
export function getPkceData(state: string): { verifier: string; env: 'production' | 'sandbox' } | null {
  const data = pkceStore.get(state);
  if (!data || data.expires < Date.now()) {
    pkceStore.delete(state);
    return null;
  }
  pkceStore.delete(state); // One-time use
  return { verifier: data.verifier, env: data.env as 'production' | 'sandbox' };
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForToken(
  code: string,
  codeVerifier?: string,
  env: 'production' | 'sandbox' = 'production'
): Promise<UserSession> {
  const loginUrl = getLoginUrl(env);
  const tokenUrl = `${loginUrl}/services/oauth2/token`;
  
  const params: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    client_id: config.salesforce.clientId,
    redirect_uri: config.salesforce.callbackUrl,
  };
  
  if (config.salesforce.clientSecret) {
    params.client_secret = config.salesforce.clientSecret;
  }
  
  if (codeVerifier) {
    params.code_verifier = codeVerifier;
  }
  
  const response = await axios.post(tokenUrl, new URLSearchParams(params), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  
  const data = response.data;
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    instanceUrl: data.instance_url,
    userId: data.id.split('/').pop(),
    organizationId: data.id.split('/')[4],
    expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<UserSession> {
  const tokenUrl = `${config.salesforce.loginUrl}/services/oauth2/token`;
  
  const response = await axios.post(tokenUrl, null, {
    params: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.salesforce.clientId,
      client_secret: config.salesforce.clientSecret,
    },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  
  const data = response.data;
  
  return {
    accessToken: data.access_token,
    refreshToken,
    instanceUrl: data.instance_url,
    userId: data.id.split('/').pop(),
    organizationId: data.id.split('/')[4],
    expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
  };
}

/**
 * Salesforce API Service
 */
export class SalesforceService {
  private accessToken: string;
  private instanceUrl: string;
  private apiClient: AxiosInstance;

  constructor(session: UserSession) {
    this.accessToken = session.accessToken;
    this.instanceUrl = session.instanceUrl;
    
    this.apiClient = axios.create({
      baseURL: `${this.instanceUrl}/services/data/v59.0`,
      timeout: config.api.timeout,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async query<T>(soql: string): Promise<T[]> {
    const records: T[] = [];
    let url: string | null = `/query?q=${encodeURIComponent(soql)}`;
    
    while (url) {
      const response = await this.apiClient.get(url);
      records.push(...response.data.records);
      
      if (response.data.nextRecordsUrl) {
        const nextUrl = response.data.nextRecordsUrl;
        const match = nextUrl.match(/\/query\/(.+)$/);
        url = match ? `/query/${match[1]}` : null;
      } else {
        url = null;
      }
    }
    
    return records;
  }

  async toolingQuery<T>(soql: string): Promise<T[]> {
    const records: T[] = [];
    let url: string | null = `/tooling/query?q=${encodeURIComponent(soql)}`;
    
    while (url) {
      const response = await this.apiClient.get(url);
      records.push(...response.data.records);
      
      if (response.data.nextRecordsUrl) {
        const nextUrl = response.data.nextRecordsUrl;
        const match = nextUrl.match(/\/query\/(.+)$/);
        url = match ? `/tooling/query/${match[1]}` : null;
      } else {
        url = null;
      }
    }
    
    return records;
  }

  async getAllProfiles(): Promise<SalesforceProfile[]> {
    return this.query<SalesforceProfile>(`
      SELECT Id, Name, UserLicenseId, UserType, Description
      FROM Profile ORDER BY Name
    `);
  }

  async getProfilePermissionSetIds(profileIds: string[]): Promise<Map<string, string>> {
    if (profileIds.length === 0) return new Map();
    
    const idList = profileIds.map(id => `'${id}'`).join(',');
    const results = await this.query<{ Id: string; ProfileId: string }>(`
      SELECT Id, ProfileId FROM PermissionSet
      WHERE IsOwnedByProfile = true AND ProfileId IN (${idList})
    `);
    
    return new Map(results.map(r => [r.ProfileId, r.Id]));
  }

  async getObjectPermissions(permissionSetIds: string[]): Promise<SalesforceObjectPermission[]> {
    if (permissionSetIds.length === 0) return [];
    
    const idList = permissionSetIds.map(id => `'${id}'`).join(',');
    return this.query<SalesforceObjectPermission>(`
      SELECT Id, ParentId, SobjectType,
             PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete,
             PermissionsViewAllRecords, PermissionsModifyAllRecords
      FROM ObjectPermissions WHERE ParentId IN (${idList})
    `);
  }

  async getFieldPermissions(permissionSetIds: string[]): Promise<SalesforceFieldPermission[]> {
    if (permissionSetIds.length === 0) return [];
    
    const idList = permissionSetIds.map(id => `'${id}'`).join(',');
    try {
      return await this.query<SalesforceFieldPermission>(`
        SELECT Id, ParentId, SobjectType, Field, PermissionsRead, PermissionsEdit
        FROM FieldPermissions WHERE ParentId IN (${idList})
      `);
    } catch {
      return [];
    }
  }

  async getPermissionSetWithSystemPerms(permissionSetIds: string[]): Promise<SalesforcePermissionSet[]> {
    if (permissionSetIds.length === 0) return [];
    
    let permissionFields: string[] = [];
    try {
      const describeResponse = await this.apiClient.get('/sobjects/PermissionSet/describe');
      permissionFields = describeResponse.data.fields
        .filter((f: any) => f.name.startsWith('Permissions') && f.type === 'boolean')
        .map((f: any) => f.name);
    } catch {
      permissionFields = [
        'PermissionsApiEnabled', 'PermissionsViewSetup',
        'PermissionsModifyAllData', 'PermissionsViewAllData', 'PermissionsManageUsers',
      ];
    }
    
    const idList = permissionSetIds.map(id => `'${id}'`).join(',');
    const fieldList = ['Id', 'Name', 'ProfileId', 'IsOwnedByProfile', ...permissionFields].join(', ');
    
    return this.query<SalesforcePermissionSet>(`
      SELECT ${fieldList} FROM PermissionSet WHERE Id IN (${idList})
    `);
  }

  async getSetupEntityAccess(permissionSetIds: string[]): Promise<SalesforceSetupEntityAccess[]> {
    if (permissionSetIds.length === 0) return [];
    
    const idList = permissionSetIds.map(id => `'${id}'`).join(',');
    try {
      return await this.query<SalesforceSetupEntityAccess>(`
        SELECT Id, ParentId, SetupEntityId, SetupEntityType
        FROM SetupEntityAccess WHERE ParentId IN (${idList})
      `);
    } catch {
      return [];
    }
  }

  async getApexClassNames(classIds: string[]): Promise<Map<string, string>> {
    if (classIds.length === 0) return new Map();
    
    const result = new Map<string, string>();
    const batchSize = 100;
    
    try {
      for (let i = 0; i < classIds.length; i += batchSize) {
        const batch = classIds.slice(i, i + batchSize);
        const idList = batch.map(id => `'${id}'`).join(',');
        const results = await this.toolingQuery<{ Id: string; Name: string }>(
          `SELECT Id, Name FROM ApexClass WHERE Id IN (${idList})`
        );
        results.forEach(r => result.set(r.Id, r.Name));
      }
    } catch { /* ignore */ }
    
    return result;
  }

  async getApexPageNames(pageIds: string[]): Promise<Map<string, string>> {
    if (pageIds.length === 0) return new Map();
    
    const result = new Map<string, string>();
    const batchSize = 100;
    
    try {
      for (let i = 0; i < pageIds.length; i += batchSize) {
        const batch = pageIds.slice(i, i + batchSize);
        const idList = batch.map(id => `'${id}'`).join(',');
        const results = await this.toolingQuery<{ Id: string; Name: string }>(
          `SELECT Id, Name FROM ApexPage WHERE Id IN (${idList})`
        );
        results.forEach(r => result.set(r.Id, r.Name));
      }
    } catch { /* ignore */ }
    
    return result;
  }

  async getRecordTypes(): Promise<Map<string, string>> {
    try {
      const recordTypes = await this.query<{
        Id: string; Name: string; SobjectType: string; DeveloperName: string;
      }>(`SELECT Id, Name, SobjectType, DeveloperName FROM RecordType WHERE IsActive = true`);
      
      return new Map(recordTypes.map(rt => [rt.Id, `${rt.SobjectType}.${rt.DeveloperName}`]));
    } catch {
      return new Map();
    }
  }

  async getCustomTabs(): Promise<Map<string, string>> {
    try {
      const tabs = await this.toolingQuery<{
        Id: string; DeveloperName: string; SobjectName: string;
      }>(`SELECT Id, DeveloperName, SobjectName FROM CustomTab`);
      
      return new Map(tabs.map(tab => [tab.Id, tab.DeveloperName || tab.SobjectName || tab.Id]));
    } catch {
      return new Map();
    }
  }

  async getCustomApps(): Promise<Map<string, string>> {
    try {
      const apps = await this.toolingQuery<{
        Id: string; DeveloperName: string; Label: string;
      }>(`SELECT Id, DeveloperName, Label FROM CustomApplication`);
      
      return new Map(apps.map(app => [app.Id, app.Label || app.DeveloperName]));
    } catch {
      return new Map();
    }
  }
}
