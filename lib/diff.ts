import type {
  NormalizedProfile,
  ComparisonResult,
  DiffItem,
  DiffType,
  ObjectPermission,
  FieldPermission,
} from './types';

export class DiffEngine {
  compare(profiles: NormalizedProfile[], includeUnchanged = false): ComparisonResult {
    const differences: DiffItem[] = [];
    const summary = {
      objectPermissions: 0,
      fieldPermissions: 0,
      systemPermissions: 0,
      apexClasses: 0,
      visualforcePages: 0,
      lightningPages: 0,
      recordTypes: 0,
      tabVisibilities: 0,
      appVisibilities: 0,
    };
    
    this.compareObjectPermissions(profiles, differences, summary, includeUnchanged);
    this.compareFieldPermissions(profiles, differences, summary, includeUnchanged);
    this.compareSystemPermissions(profiles, differences, summary, includeUnchanged);
    this.compareArrayProperty(profiles, 'apexClasses', 'apexClass', differences, summary, includeUnchanged);
    this.compareArrayProperty(profiles, 'visualforcePages', 'visualforcePage', differences, summary, includeUnchanged);
    this.compareArrayProperty(profiles, 'lightningPages', 'lightningPage', differences, summary, includeUnchanged);
    this.compareArrayProperty(profiles, 'recordTypes', 'recordType', differences, summary, includeUnchanged);
    this.compareTabVisibilities(profiles, differences, summary, includeUnchanged);
    this.compareAppVisibilities(profiles, differences, summary, includeUnchanged);
    
    return {
      profiles: profiles.map(p => ({ id: p.profileId, name: p.profileName })),
      timestamp: new Date().toISOString(),
      totalDifferences: differences.filter(d => d.diffType !== 'unchanged').length,
      differences,
      summary,
    };
  }

  private compareObjectPermissions(
    profiles: NormalizedProfile[],
    differences: DiffItem[],
    summary: { objectPermissions: number },
    includeUnchanged: boolean
  ): void {
    const allObjectNames = new Set<string>();
    profiles.forEach(p => Object.keys(p.objects).forEach(name => allObjectNames.add(name)));
    
    const permissionTypes: (keyof ObjectPermission)[] = ['read', 'create', 'edit', 'delete', 'viewAll', 'modifyAll'];
    
    allObjectNames.forEach(objectName => {
      permissionTypes.forEach(permType => {
        const values: Record<string, boolean> = {};
        profiles.forEach(p => {
          values[p.profileId] = p.objects[objectName]?.permissions?.[permType] ?? false;
        });
        
        const diffType = this.determineDiffType(values);
        
        if (diffType !== 'unchanged' || includeUnchanged) {
          if (diffType !== 'unchanged') summary.objectPermissions++;
          differences.push({
            path: `objects.${objectName}.permissions.${permType}`,
            category: 'objectPermission',
            objectName,
            permissionName: permType,
            values,
            diffType,
          });
        }
      });
    });
  }

  private compareFieldPermissions(
    profiles: NormalizedProfile[],
    differences: DiffItem[],
    summary: { fieldPermissions: number },
    includeUnchanged: boolean
  ): void {
    const allFields = new Map<string, Set<string>>();
    
    profiles.forEach(p => {
      Object.entries(p.objects).forEach(([objectName, objAccess]) => {
        if (!allFields.has(objectName)) allFields.set(objectName, new Set());
        Object.keys(objAccess.fields).forEach(f => allFields.get(objectName)!.add(f));
      });
    });
    
    const permissionTypes: (keyof FieldPermission)[] = ['read', 'edit'];
    
    allFields.forEach((fieldNames, objectName) => {
      fieldNames.forEach(fieldName => {
        permissionTypes.forEach(permType => {
          const values: Record<string, boolean> = {};
          profiles.forEach(p => {
            values[p.profileId] = p.objects[objectName]?.fields?.[fieldName]?.[permType] ?? false;
          });
          
          const diffType = this.determineDiffType(values);
          
          if (diffType !== 'unchanged' || includeUnchanged) {
            if (diffType !== 'unchanged') summary.fieldPermissions++;
            differences.push({
              path: `objects.${objectName}.fields.${fieldName}.${permType}`,
              category: 'fieldPermission',
              objectName,
              fieldName,
              permissionName: permType,
              values,
              diffType,
            });
          }
        });
      });
    });
  }

  private compareSystemPermissions(
    profiles: NormalizedProfile[],
    differences: DiffItem[],
    summary: { systemPermissions: number },
    includeUnchanged: boolean
  ): void {
    const allPermissions = new Set<string>();
    profiles.forEach(p => Object.keys(p.systemPermissions).forEach(name => allPermissions.add(name)));
    
    allPermissions.forEach(permName => {
      const values: Record<string, boolean> = {};
      profiles.forEach(p => { values[p.profileId] = p.systemPermissions[permName] ?? false; });
      
      const diffType = this.determineDiffType(values);
      
      if (diffType !== 'unchanged' || includeUnchanged) {
        if (diffType !== 'unchanged') summary.systemPermissions++;
        differences.push({
          path: `systemPermissions.${permName}`,
          category: 'systemPermission',
          permissionName: permName,
          values,
          diffType,
        });
      }
    });
  }

  private compareArrayProperty(
    profiles: NormalizedProfile[],
    propertyName: keyof NormalizedProfile,
    category: string,
    differences: DiffItem[],
    summary: Record<string, number>,
    includeUnchanged: boolean
  ): void {
    const categoryToSummaryKey: Record<string, string> = {
      'apexClass': 'apexClasses',
      'visualforcePage': 'visualforcePages',
      'lightningPage': 'lightningPages',
      'recordType': 'recordTypes',
    };
    const summaryKey = categoryToSummaryKey[category] || `${category}s`;
    
    const allItems = new Set<string>();
    profiles.forEach(p => {
      const items = p[propertyName] as string[];
      if (Array.isArray(items)) items.forEach(item => allItems.add(item));
    });
    
    allItems.forEach(item => {
      const values: Record<string, boolean> = {};
      profiles.forEach(p => {
        const items = p[propertyName] as string[];
        values[p.profileId] = Array.isArray(items) && items.includes(item);
      });
      
      const diffType = this.determineDiffType(values);
      
      if (diffType !== 'unchanged' || includeUnchanged) {
        if (diffType !== 'unchanged' && summaryKey in summary) {
          (summary as any)[summaryKey]++;
        }
        differences.push({
          path: `${propertyName}.${item}`,
          category,
          permissionName: item,
          values,
          diffType,
        });
      }
    });
  }

  private compareTabVisibilities(
    profiles: NormalizedProfile[],
    differences: DiffItem[],
    summary: { tabVisibilities: number },
    includeUnchanged: boolean
  ): void {
    const allTabs = new Set<string>();
    profiles.forEach(p => Object.keys(p.tabVisibilities).forEach(name => allTabs.add(name)));
    
    allTabs.forEach(tabName => {
      const values: Record<string, string> = {};
      profiles.forEach(p => { values[p.profileId] = p.tabVisibilities[tabName] ?? 'Hidden'; });
      
      const diffType = this.determineDiffTypeForStrings(values);
      
      if (diffType !== 'unchanged' || includeUnchanged) {
        if (diffType !== 'unchanged') summary.tabVisibilities++;
        differences.push({
          path: `tabVisibilities.${tabName}`,
          category: 'tabVisibility',
          permissionName: tabName,
          values,
          diffType,
        });
      }
    });
  }

  private compareAppVisibilities(
    profiles: NormalizedProfile[],
    differences: DiffItem[],
    summary: { appVisibilities: number },
    includeUnchanged: boolean
  ): void {
    const allApps = new Set<string>();
    profiles.forEach(p => Object.keys(p.appVisibilities).forEach(name => allApps.add(name)));
    
    allApps.forEach(appName => {
      const visibleValues: Record<string, boolean> = {};
      const defaultValues: Record<string, boolean> = {};
      
      profiles.forEach(p => {
        const appVis = p.appVisibilities[appName];
        visibleValues[p.profileId] = appVis?.visible ?? false;
        defaultValues[p.profileId] = appVis?.default ?? false;
      });
      
      const visibleDiffType = this.determineDiffType(visibleValues);
      const defaultDiffType = this.determineDiffType(defaultValues);
      
      if (visibleDiffType !== 'unchanged' || includeUnchanged) {
        if (visibleDiffType !== 'unchanged') summary.appVisibilities++;
        differences.push({
          path: `appVisibilities.${appName}.visible`,
          category: 'appVisibility',
          permissionName: `${appName} (Visible)`,
          values: visibleValues,
          diffType: visibleDiffType,
        });
      }
      
      if (defaultDiffType !== 'unchanged' || includeUnchanged) {
        if (defaultDiffType !== 'unchanged') summary.appVisibilities++;
        differences.push({
          path: `appVisibilities.${appName}.default`,
          category: 'appVisibility',
          permissionName: `${appName} (Default)`,
          values: defaultValues,
          diffType: defaultDiffType,
        });
      }
    });
  }

  private determineDiffType(values: Record<string, boolean>): DiffType {
    const boolValues = Object.values(values);
    const uniqueValues = new Set(boolValues);
    
    if (uniqueValues.size === 1) return 'unchanged';
    
    const trueCount = boolValues.filter(v => v === true).length;
    const falseCount = boolValues.filter(v => v === false).length;
    
    if (trueCount === 1 && falseCount > 0) return 'added';
    if (falseCount === 1 && trueCount > 0) return 'removed';
    
    return 'changed';
  }

  private determineDiffTypeForStrings(values: Record<string, string>): DiffType {
    const uniqueValues = new Set(Object.values(values));
    return uniqueValues.size === 1 ? 'unchanged' : 'changed';
  }
}
