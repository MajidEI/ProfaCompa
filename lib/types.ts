/**
 * Type definitions for Salesforce Profile Comparison
 */

// ============================================================================
// OBJECT & FIELD PERMISSIONS
// ============================================================================

export interface ObjectPermission {
  read: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  viewAll: boolean;
  modifyAll: boolean;
}

export interface FieldPermission {
  read: boolean;
  edit: boolean;
}

export interface ObjectAccess {
  permissions: ObjectPermission;
  fields: Record<string, FieldPermission>;
}

// ============================================================================
// NORMALIZED PROFILE DATA MODEL
// ============================================================================

export interface NormalizedProfile {
  profileId: string;
  profileName: string;
  objects: Record<string, ObjectAccess>;
  systemPermissions: Record<string, boolean>;
  apexClasses: string[];
  visualforcePages: string[];
  lightningPages: string[];
  recordTypes: string[];
  tabVisibilities: Record<string, string>;
  appVisibilities: Record<string, AppVisibility>;
  userPermissions: Record<string, boolean>;
}

export interface AppVisibility {
  visible: boolean;
  default: boolean;
}

// ============================================================================
// COMPARISON RESULT TYPES
// ============================================================================

export type DiffType = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffItem {
  path: string;
  category: string;
  objectName?: string;
  fieldName?: string;
  permissionName?: string;
  values: Record<string, any>;
  diffType: DiffType;
}

export interface ComparisonResult {
  profiles: Array<{ id: string; name: string }>;
  timestamp: string;
  totalDifferences: number;
  differences: DiffItem[];
  summary: {
    objectPermissions: number;
    fieldPermissions: number;
    systemPermissions: number;
    apexClasses: number;
    visualforcePages: number;
    lightningPages: number;
    recordTypes: number;
    tabVisibilities: number;
    appVisibilities: number;
  };
}

// ============================================================================
// SALESFORCE RAW API RESPONSE TYPES
// ============================================================================

export interface SalesforceProfile {
  Id: string;
  Name: string;
  UserLicenseId: string;
  UserType?: string;
  Description?: string;
}

export interface SalesforceObjectPermission {
  Id: string;
  ParentId: string;
  SobjectType: string;
  PermissionsCreate: boolean;
  PermissionsRead: boolean;
  PermissionsEdit: boolean;
  PermissionsDelete: boolean;
  PermissionsViewAllRecords: boolean;
  PermissionsModifyAllRecords: boolean;
}

export interface SalesforceFieldPermission {
  Id: string;
  ParentId: string;
  SobjectType: string;
  Field: string;
  PermissionsRead: boolean;
  PermissionsEdit: boolean;
}

export interface SalesforcePermissionSet {
  Id: string;
  Name: string;
  ProfileId?: string;
  IsOwnedByProfile: boolean;
  [key: string]: any;
}

export interface SalesforceSetupEntityAccess {
  Id: string;
  ParentId: string;
  SetupEntityId: string;
  SetupEntityType: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface ProfileListResponse {
  profiles: Array<{ id: string; name: string }>;
}

export interface CompareRequest {
  profileIds: string[];
}

export interface CompareResponse {
  comparison: ComparisonResult;
  profiles: NormalizedProfile[];
}

// ============================================================================
// SESSION & AUTH TYPES
// ============================================================================

export interface UserSession {
  accessToken: string;
  refreshToken?: string;
  instanceUrl: string;
  userId: string;
  organizationId: string;
  expiresAt?: number;
}

export interface JWTPayload {
  accessToken: string;
  refreshToken?: string;
  instanceUrl: string;
  userId: string;
  organizationId: string;
  expiresAt?: number;
  iat?: number;
  exp?: number;
}
