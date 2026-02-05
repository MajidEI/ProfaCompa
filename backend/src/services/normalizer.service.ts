import { SalesforceService } from './salesforce.service';
import {
  NormalizedProfile,
  ObjectAccess,
  ObjectPermission,
  FieldPermission,
  SalesforceProfile,
  SalesforceObjectPermission,
  SalesforceFieldPermission,
  SalesforcePermissionSet,
  SalesforceSetupEntityAccess,
  UserSession,
} from '../types';

/**
 * ProfileNormalizer transforms raw Salesforce API data into a normalized
 * structure suitable for comparison.
 * 
 * The normalization process:
 * 1. Fetches all relevant data for selected profiles in parallel
 * 2. Maps PermissionSet IDs back to Profile IDs
 * 3. Resolves entity IDs (Apex classes, VF pages) to names
 * 4. Constructs the unified NormalizedProfile structure
 * 
 * This approach minimizes API calls by:
 * - Batching all profile-related queries
 * - Using IN clauses instead of individual queries
 * - Caching entity name lookups
 */
export class ProfileNormalizer {
  private sfService: SalesforceService;
  private profiles: Map<string, SalesforceProfile> = new Map();
  
  constructor(session: UserSession) {
    this.sfService = new SalesforceService(session);
  }

  /**
   * Normalize multiple profiles for comparison
   * This is the main entry point for the normalization process
   */
  async normalizeProfiles(profileIds: string[]): Promise<NormalizedProfile[]> {
    console.log(`Normalizing ${profileIds.length} profiles...`);
    
    // Step 1: Get profile basic info
    const allProfiles = await this.sfService.getAllProfiles();
    for (const profile of allProfiles) {
      this.profiles.set(profile.Id, profile);
    }
    
    // Step 2: Get the PermissionSet IDs for these profiles
    // Each profile has one associated PermissionSet where IsOwnedByProfile = true
    const profileToPermSetMap = await this.sfService.getProfilePermissionSetIds(profileIds);
    const permissionSetIds = Array.from(profileToPermSetMap.values());
    
    // Create reverse mapping: PermissionSetId -> ProfileId
    const permSetToProfileMap = new Map<string, string>();
    for (const [profileId, permSetId] of profileToPermSetMap) {
      permSetToProfileMap.set(permSetId, profileId);
    }
    
    // Step 3: Fetch all permissions data in parallel for efficiency
    // Using individual try-catch to handle partial failures gracefully
    console.log('Fetching permissions data in parallel...');
    
    let objectPermissions: SalesforceObjectPermission[] = [];
    let fieldPermissions: SalesforceFieldPermission[] = [];
    let permissionSets: SalesforcePermissionSet[] = [];
    let setupEntityAccess: SalesforceSetupEntityAccess[] = [];
    
    // Fetch with error handling for each query
    const results = await Promise.allSettled([
      this.sfService.getObjectPermissions(permissionSetIds),
      this.sfService.getFieldPermissions(permissionSetIds),
      this.sfService.getPermissionSetWithSystemPerms(permissionSetIds),
      this.sfService.getSetupEntityAccess(permissionSetIds),
    ]);
    
    // Process results, logging any failures
    if (results[0].status === 'fulfilled') {
      objectPermissions = results[0].value;
      console.log(`  ✓ Object permissions: ${objectPermissions.length} records`);
    } else {
      console.error('  ✗ Failed to fetch object permissions:', results[0].reason?.message || results[0].reason);
    }
    
    if (results[1].status === 'fulfilled') {
      fieldPermissions = results[1].value;
      console.log(`  ✓ Field permissions: ${fieldPermissions.length} records`);
    } else {
      console.error('  ✗ Failed to fetch field permissions:', results[1].reason?.message || results[1].reason);
    }
    
    if (results[2].status === 'fulfilled') {
      permissionSets = results[2].value;
      console.log(`  ✓ Permission sets (system perms): ${permissionSets.length} records`);
    } else {
      console.error('  ✗ Failed to fetch system permissions:', results[2].reason?.message || results[2].reason);
    }
    
    if (results[3].status === 'fulfilled') {
      setupEntityAccess = results[3].value;
      console.log(`  ✓ Setup entity access: ${setupEntityAccess.length} records`);
    } else {
      console.error('  ✗ Failed to fetch setup entity access:', results[3].reason?.message || results[3].reason);
    }
    
    // Step 4: Resolve entity names for SetupEntityAccess
    const apexClassIds = setupEntityAccess
      .filter(e => e.SetupEntityType === 'ApexClass')
      .map(e => e.SetupEntityId);
    const apexPageIds = setupEntityAccess
      .filter(e => e.SetupEntityType === 'ApexPage')
      .map(e => e.SetupEntityId);
    
    let apexClassNames = new Map<string, string>();
    let apexPageNames = new Map<string, string>();
    let recordTypeNames = new Map<string, string>();
    let customTabNames = new Map<string, string>();
    let customAppNames = new Map<string, string>();
    
    // Fetch all name lookups in parallel
    const [apexNames, pageNames, rtNames, tabNames, appNames] = await Promise.all([
      this.sfService.getApexClassNames(apexClassIds).catch(() => new Map<string, string>()),
      this.sfService.getApexPageNames(apexPageIds).catch(() => new Map<string, string>()),
      this.sfService.getRecordTypes().catch(() => new Map<string, string>()),
      this.sfService.getCustomTabs().catch(() => new Map<string, string>()),
      this.sfService.getCustomApps().catch(() => new Map<string, string>()),
    ]);
    
    apexClassNames = apexNames;
    apexPageNames = pageNames;
    recordTypeNames = rtNames;
    customTabNames = tabNames;
    customAppNames = appNames;
    
    console.log(`  ✓ Apex class names: ${apexClassNames.size} resolved`);
    console.log(`  ✓ Apex page names: ${apexPageNames.size} resolved`);
    console.log(`  ✓ Record types: ${recordTypeNames.size} found`);
    console.log(`  ✓ Custom tabs: ${customTabNames.size} found`);
    console.log(`  ✓ Custom apps: ${customAppNames.size} found`);
    
    // Step 5: Group data by profile
    const profileData = this.groupDataByProfile(
      profileIds,
      permSetToProfileMap,
      objectPermissions,
      fieldPermissions,
      permissionSets,
      setupEntityAccess,
      apexClassNames,
      apexPageNames,
      recordTypeNames,
      customTabNames,
      customAppNames
    );
    
    // Step 6: Build normalized profiles
    const normalizedProfiles: NormalizedProfile[] = [];
    
    for (const profileId of profileIds) {
      const profile = this.profiles.get(profileId);
      if (!profile) continue;
      
      const data = profileData.get(profileId);
      if (!data) continue;
      
      normalizedProfiles.push(this.buildNormalizedProfile(profile, data));
    }
    
    console.log(`Normalization complete for ${normalizedProfiles.length} profiles`);
    return normalizedProfiles;
  }

  /**
   * Group all fetched data by profile ID for easier processing
   */
  private groupDataByProfile(
    profileIds: string[],
    permSetToProfileMap: Map<string, string>,
    objectPermissions: SalesforceObjectPermission[],
    fieldPermissions: SalesforceFieldPermission[],
    permissionSets: SalesforcePermissionSet[],
    setupEntityAccess: SalesforceSetupEntityAccess[],
    apexClassNames: Map<string, string>,
    apexPageNames: Map<string, string>,
    recordTypeNames: Map<string, string>,
    customTabNames: Map<string, string>,
    customAppNames: Map<string, string>
  ): Map<string, ProfileDataBundle> {
    const result = new Map<string, ProfileDataBundle>();
    
    // Initialize bundles for each profile
    for (const profileId of profileIds) {
      result.set(profileId, {
        objectPermissions: [],
        fieldPermissions: [],
        systemPermissions: {},
        apexClasses: [],
        visualforcePages: [],
        lightningPages: [],
        recordTypes: [],
        tabs: [],
        apps: [],
      });
    }
    
    // Group object permissions by profile
    for (const objPerm of objectPermissions) {
      const profileId = permSetToProfileMap.get(objPerm.ParentId);
      if (profileId) {
        const bundle = result.get(profileId);
        if (bundle) {
          bundle.objectPermissions.push(objPerm);
        }
      }
    }
    
    // Group field permissions by profile
    for (const fieldPerm of fieldPermissions) {
      const profileId = permSetToProfileMap.get(fieldPerm.ParentId);
      if (profileId) {
        const bundle = result.get(profileId);
        if (bundle) {
          bundle.fieldPermissions.push(fieldPerm);
        }
      }
    }
    
    // Extract system permissions from PermissionSet records
    for (const permSet of permissionSets) {
      const profileId = permSet.ProfileId;
      if (profileId) {
        const bundle = result.get(profileId);
        if (bundle) {
          // Extract all "Permissions*" boolean fields
          const systemPerms: Record<string, boolean> = {};
          for (const [key, value] of Object.entries(permSet)) {
            if (key.startsWith('Permissions') && typeof value === 'boolean') {
              // Remove "Permissions" prefix for cleaner names
              const permName = key.replace('Permissions', '');
              systemPerms[permName] = value;
            }
          }
          bundle.systemPermissions = systemPerms;
        }
      }
    }
    
    // Group setup entity access by profile and resolve names
    // Track counts for debugging
    const typeCounts: Record<string, number> = {};
    const matchCounts: Record<string, { matched: number; unmatched: number }> = {
      ApexClass: { matched: 0, unmatched: 0 },
      ApexPage: { matched: 0, unmatched: 0 },
      RecordType: { matched: 0, unmatched: 0 },
      TabSet: { matched: 0, unmatched: 0 },
      CustomApplication: { matched: 0, unmatched: 0 },
    };
    
    for (const access of setupEntityAccess) {
      // Count entity types
      typeCounts[access.SetupEntityType] = (typeCounts[access.SetupEntityType] || 0) + 1;
      
      const profileId = permSetToProfileMap.get(access.ParentId);
      if (!profileId) continue;
      
      const bundle = result.get(profileId);
      if (!bundle) continue;
      
      switch (access.SetupEntityType) {
        case 'ApexClass': {
          const className = apexClassNames.get(access.SetupEntityId);
          if (className) {
            bundle.apexClasses.push(className);
            matchCounts.ApexClass.matched++;
          } else {
            matchCounts.ApexClass.unmatched++;
          }
          break;
        }
        case 'ApexPage': {
          const pageName = apexPageNames.get(access.SetupEntityId);
          if (pageName) {
            bundle.visualforcePages.push(pageName);
            matchCounts.ApexPage.matched++;
          } else {
            matchCounts.ApexPage.unmatched++;
          }
          break;
        }
        case 'RecordType': {
          const rtName = recordTypeNames.get(access.SetupEntityId);
          if (rtName) {
            bundle.recordTypes.push(rtName);
            matchCounts.RecordType.matched++;
          } else {
            matchCounts.RecordType.unmatched++;
          }
          break;
        }
        case 'TabSet': {
          // TabSet refers to custom applications
          const appName = customAppNames.get(access.SetupEntityId);
          if (appName) {
            bundle.apps.push(appName);
            matchCounts.TabSet.matched++;
          } else {
            matchCounts.TabSet.unmatched++;
          }
          break;
        }
        case 'CustomTab': {
          const tabName = customTabNames.get(access.SetupEntityId);
          if (tabName) {
            bundle.tabs.push(tabName);
          }
          break;
        }
      }
    }
    
    console.log('SetupEntityAccess types found:', typeCounts);
    console.log('Match results:', matchCounts);
    
    return result;
  }

  /**
   * Build the final NormalizedProfile from grouped data
   */
  private buildNormalizedProfile(
    profile: SalesforceProfile,
    data: ProfileDataBundle
  ): NormalizedProfile {
    // Build objects map with permissions and fields
    const objects: Record<string, ObjectAccess> = {};
    
    // First, create object entries from object permissions
    for (const objPerm of data.objectPermissions) {
      const objectName = objPerm.SobjectType;
      
      if (!objects[objectName]) {
        objects[objectName] = {
          permissions: this.buildObjectPermission(objPerm),
          fields: {},
        };
      } else {
        objects[objectName].permissions = this.buildObjectPermission(objPerm);
      }
    }
    
    // Then, add field permissions
    for (const fieldPerm of data.fieldPermissions) {
      const objectName = fieldPerm.SobjectType;
      // Field format is "ObjectName.FieldName" - extract just the field name
      const fieldName = fieldPerm.Field.split('.')[1] || fieldPerm.Field;
      
      // Ensure object exists in our map
      if (!objects[objectName]) {
        objects[objectName] = {
          permissions: this.getDefaultObjectPermission(),
          fields: {},
        };
      }
      
      objects[objectName].fields[fieldName] = {
        read: fieldPerm.PermissionsRead,
        edit: fieldPerm.PermissionsEdit,
      };
    }
    
    // Sort arrays for consistent comparison
    const sortedApexClasses = [...data.apexClasses].sort();
    const sortedVfPages = [...data.visualforcePages].sort();
    const sortedLightningPages = [...data.lightningPages].sort();
    const sortedRecordTypes = [...data.recordTypes].sort();
    const sortedTabs = [...data.tabs].sort();
    const sortedApps = [...data.apps].sort();
    
    // Convert tabs array to tabVisibilities object
    const tabVisibilities: Record<string, string> = {};
    for (const tab of sortedTabs) {
      tabVisibilities[tab] = 'Visible';
    }
    
    // Convert apps array to appVisibilities object
    const appVisibilities: Record<string, { visible: boolean; default: boolean }> = {};
    for (const app of sortedApps) {
      appVisibilities[app] = { visible: true, default: false };
    }
    
    return {
      profileId: profile.Id,
      profileName: profile.Name,
      objects,
      systemPermissions: data.systemPermissions,
      apexClasses: sortedApexClasses,
      visualforcePages: sortedVfPages,
      lightningPages: sortedLightningPages,
      recordTypes: sortedRecordTypes,
      tabVisibilities,
      appVisibilities,
      userPermissions: data.systemPermissions,
    };
  }

  /**
   * Convert raw Salesforce object permission to our format
   */
  private buildObjectPermission(raw: SalesforceObjectPermission): ObjectPermission {
    return {
      read: raw.PermissionsRead,
      create: raw.PermissionsCreate,
      edit: raw.PermissionsEdit,
      delete: raw.PermissionsDelete,
      viewAll: raw.PermissionsViewAllRecords,
      modifyAll: raw.PermissionsModifyAllRecords,
    };
  }

  /**
   * Get default (all false) object permissions
   * Used when we have field permissions but no object permissions
   */
  private getDefaultObjectPermission(): ObjectPermission {
    return {
      read: false,
      create: false,
      edit: false,
      delete: false,
      viewAll: false,
      modifyAll: false,
    };
  }
}

/**
 * Internal type to bundle data during processing
 */
interface ProfileDataBundle {
  objectPermissions: SalesforceObjectPermission[];
  fieldPermissions: SalesforceFieldPermission[];
  systemPermissions: Record<string, boolean>;
  apexClasses: string[];
  visualforcePages: string[];
  lightningPages: string[];
  recordTypes: string[];
  tabs: string[];
  apps: string[];
}
