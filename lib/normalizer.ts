import { SalesforceService } from './salesforce';
import type {
  NormalizedProfile,
  ObjectAccess,
  ObjectPermission,
  SalesforceProfile,
  SalesforceObjectPermission,
  SalesforceFieldPermission,
  SalesforcePermissionSet,
  SalesforceSetupEntityAccess,
  UserSession,
} from './types';

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

export class ProfileNormalizer {
  private sfService: SalesforceService;
  private profiles: Map<string, SalesforceProfile> = new Map();
  
  constructor(session: UserSession) {
    this.sfService = new SalesforceService(session);
  }

  async normalizeProfiles(profileIds: string[]): Promise<NormalizedProfile[]> {
    // Step 1: Get all profiles
    const allProfiles = await this.sfService.getAllProfiles();
    allProfiles.forEach(p => this.profiles.set(p.Id, p));
    
    // Step 2: Get PermissionSet IDs
    const profileToPermSetMap = await this.sfService.getProfilePermissionSetIds(profileIds);
    const permissionSetIds = Array.from(profileToPermSetMap.values());
    
    const permSetToProfileMap = new Map<string, string>();
    profileToPermSetMap.forEach((permSetId, profileId) => {
      permSetToProfileMap.set(permSetId, profileId);
    });
    
    // Step 3: Fetch all permissions data in parallel
    const results = await Promise.allSettled([
      this.sfService.getObjectPermissions(permissionSetIds),
      this.sfService.getFieldPermissions(permissionSetIds),
      this.sfService.getPermissionSetWithSystemPerms(permissionSetIds),
      this.sfService.getSetupEntityAccess(permissionSetIds),
    ]);
    
    const objectPermissions = results[0].status === 'fulfilled' ? results[0].value : [];
    const fieldPermissions = results[1].status === 'fulfilled' ? results[1].value : [];
    const permissionSets = results[2].status === 'fulfilled' ? results[2].value : [];
    const setupEntityAccess = results[3].status === 'fulfilled' ? results[3].value : [];
    
    // Step 4: Resolve entity names
    const apexClassIds = setupEntityAccess.filter(e => e.SetupEntityType === 'ApexClass').map(e => e.SetupEntityId);
    const apexPageIds = setupEntityAccess.filter(e => e.SetupEntityType === 'ApexPage').map(e => e.SetupEntityId);
    
    const [apexClassNames, apexPageNames, recordTypeNames, customTabNames, customAppNames] = await Promise.all([
      this.sfService.getApexClassNames(apexClassIds),
      this.sfService.getApexPageNames(apexPageIds),
      this.sfService.getRecordTypes(),
      this.sfService.getCustomTabs(),
      this.sfService.getCustomApps(),
    ]);
    
    // Step 5: Group data by profile
    const profileData = this.groupDataByProfile(
      profileIds, permSetToProfileMap, objectPermissions, fieldPermissions,
      permissionSets, setupEntityAccess, apexClassNames, apexPageNames,
      recordTypeNames, customTabNames, customAppNames
    );
    
    // Step 6: Build normalized profiles
    const normalizedProfiles: NormalizedProfile[] = [];
    
    for (const profileId of profileIds) {
      const profile = this.profiles.get(profileId);
      const data = profileData.get(profileId);
      if (profile && data) {
        normalizedProfiles.push(this.buildNormalizedProfile(profile, data));
      }
    }
    
    return normalizedProfiles;
  }

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
    
    // Initialize bundles
    profileIds.forEach(id => {
      result.set(id, {
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
    });
    
    // Group object permissions
    objectPermissions.forEach(objPerm => {
      const profileId = permSetToProfileMap.get(objPerm.ParentId);
      if (profileId) result.get(profileId)?.objectPermissions.push(objPerm);
    });
    
    // Group field permissions
    fieldPermissions.forEach(fieldPerm => {
      const profileId = permSetToProfileMap.get(fieldPerm.ParentId);
      if (profileId) result.get(profileId)?.fieldPermissions.push(fieldPerm);
    });
    
    // Extract system permissions
    permissionSets.forEach(permSet => {
      if (permSet.ProfileId) {
        const bundle = result.get(permSet.ProfileId);
        if (bundle) {
          const systemPerms: Record<string, boolean> = {};
          Object.entries(permSet).forEach(([key, value]) => {
            if (key.startsWith('Permissions') && typeof value === 'boolean') {
              systemPerms[key.replace('Permissions', '')] = value;
            }
          });
          bundle.systemPermissions = systemPerms;
        }
      }
    });
    
    // Group setup entity access
    setupEntityAccess.forEach(access => {
      const profileId = permSetToProfileMap.get(access.ParentId);
      if (!profileId) return;
      
      const bundle = result.get(profileId);
      if (!bundle) return;
      
      switch (access.SetupEntityType) {
        case 'ApexClass': {
          const name = apexClassNames.get(access.SetupEntityId);
          if (name) bundle.apexClasses.push(name);
          break;
        }
        case 'ApexPage': {
          const name = apexPageNames.get(access.SetupEntityId);
          if (name) bundle.visualforcePages.push(name);
          break;
        }
        case 'RecordType': {
          const name = recordTypeNames.get(access.SetupEntityId);
          if (name) bundle.recordTypes.push(name);
          break;
        }
        case 'TabSet': {
          const name = customAppNames.get(access.SetupEntityId);
          if (name) bundle.apps.push(name);
          break;
        }
        case 'CustomTab': {
          const name = customTabNames.get(access.SetupEntityId);
          if (name) bundle.tabs.push(name);
          break;
        }
      }
    });
    
    return result;
  }

  private buildNormalizedProfile(profile: SalesforceProfile, data: ProfileDataBundle): NormalizedProfile {
    const objects: Record<string, ObjectAccess> = {};
    
    // Build from object permissions
    data.objectPermissions.forEach(objPerm => {
      objects[objPerm.SobjectType] = {
        permissions: {
          read: objPerm.PermissionsRead,
          create: objPerm.PermissionsCreate,
          edit: objPerm.PermissionsEdit,
          delete: objPerm.PermissionsDelete,
          viewAll: objPerm.PermissionsViewAllRecords,
          modifyAll: objPerm.PermissionsModifyAllRecords,
        },
        fields: {},
      };
    });
    
    // Add field permissions
    data.fieldPermissions.forEach(fieldPerm => {
      const objectName = fieldPerm.SobjectType;
      const fieldName = fieldPerm.Field.split('.')[1] || fieldPerm.Field;
      
      if (!objects[objectName]) {
        objects[objectName] = {
          permissions: { read: false, create: false, edit: false, delete: false, viewAll: false, modifyAll: false },
          fields: {},
        };
      }
      
      objects[objectName].fields[fieldName] = {
        read: fieldPerm.PermissionsRead,
        edit: fieldPerm.PermissionsEdit,
      };
    });
    
    const tabVisibilities: Record<string, string> = {};
    data.tabs.sort().forEach(tab => { tabVisibilities[tab] = 'Visible'; });
    
    const appVisibilities: Record<string, { visible: boolean; default: boolean }> = {};
    data.apps.sort().forEach(app => { appVisibilities[app] = { visible: true, default: false }; });
    
    return {
      profileId: profile.Id,
      profileName: profile.Name,
      objects,
      systemPermissions: data.systemPermissions,
      apexClasses: [...data.apexClasses].sort(),
      visualforcePages: [...data.visualforcePages].sort(),
      lightningPages: [...data.lightningPages].sort(),
      recordTypes: [...data.recordTypes].sort(),
      tabVisibilities,
      appVisibilities,
      userPermissions: data.systemPermissions,
    };
  }
}
