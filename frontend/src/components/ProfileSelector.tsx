import { useState, useEffect, useMemo } from 'react';
import { Search, Check, AlertCircle, ArrowRight } from 'lucide-react';
import { getProfiles, compareProfiles, getErrorMessage } from '../services/api';
import type { Profile, CompareResponse } from '../types';
import LoadingSpinner from './LoadingSpinner';

interface ProfileSelectorProps {
  onComparisonComplete: (data: CompareResponse) => void;
}

/**
 * Profile Selector Component
 * 
 * Allows users to:
 * 1. View all profiles in the connected org
 * 2. Search/filter profiles
 * 3. Select 2+ profiles to compare
 * 4. Initiate the comparison
 */
function ProfileSelector({ onComparisonComplete }: ProfileSelectorProps) {
  // Profile data state
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  
  // Comparison state
  const [isComparing, setIsComparing] = useState(false);
  
  /**
   * Fetch profiles on component mount
   */
  useEffect(() => {
    fetchProfiles();
  }, []);
  
  /**
   * Fetch all profiles from the connected org
   */
  async function fetchProfiles() {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await getProfiles();
      setProfiles(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }
  
  /**
   * Filter profiles based on search query
   */
  const filteredProfiles = useMemo(() => {
    if (!searchQuery.trim()) {
      return profiles;
    }
    
    const query = searchQuery.toLowerCase();
    return profiles.filter(p => 
      p.name.toLowerCase().includes(query)
    );
  }, [profiles, searchQuery]);
  
  /**
   * Toggle profile selection
   */
  function toggleSelection(profileId: string) {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(profileId)) {
        newSet.delete(profileId);
      } else {
        newSet.add(profileId);
      }
      return newSet;
    });
  }
  
  /**
   * Select all visible profiles
   */
  function selectAll() {
    setSelectedIds(new Set(filteredProfiles.map(p => p.id)));
  }
  
  /**
   * Clear all selections
   */
  function clearSelection() {
    setSelectedIds(new Set());
  }
  
  /**
   * Start the comparison
   */
  async function handleCompare() {
    if (selectedIds.size < 2) return;
    
    setIsComparing(true);
    setError(null);
    
    try {
      const data = await compareProfiles(Array.from(selectedIds));
      onComparisonComplete(data);
    } catch (err) {
      setError(getErrorMessage(err));
      setIsComparing(false);
    }
  }
  
  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" message="Loading profiles..." />
      </div>
    );
  }
  
  // Show comparison in progress
  if (isComparing) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner 
          size="lg" 
          message="Comparing profiles... This may take a moment for large orgs." 
        />
      </div>
    );
  }
  
  return (
    <div className="max-w-4xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Select Profiles to Compare
        </h2>
        <p className="text-gray-600">
          Choose two or more profiles to see a detailed side-by-side comparison 
          of all permissions and access settings.
        </p>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg 
                        flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Error</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}
      
      {/* Search and selection controls */}
      <div className="card p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 
                               w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search profiles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-9"
            />
          </div>
          
          {/* Selection buttons */}
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="btn-secondary text-sm whitespace-nowrap"
            >
              Select All ({filteredProfiles.length})
            </button>
            <button
              onClick={clearSelection}
              className="btn-secondary text-sm whitespace-nowrap"
              disabled={selectedIds.size === 0}
            >
              Clear ({selectedIds.size})
            </button>
          </div>
        </div>
      </div>
      
      {/* Profile list */}
      <div className="card divide-y divide-gray-100 mb-6 max-h-[500px] 
                      overflow-y-auto scrollbar-thin">
        {filteredProfiles.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchQuery 
              ? 'No profiles match your search'
              : 'No profiles found in this org'
            }
          </div>
        ) : (
          filteredProfiles.map(profile => (
            <ProfileItem
              key={profile.id}
              profile={profile}
              isSelected={selectedIds.has(profile.id)}
              onToggle={() => toggleSelection(profile.id)}
            />
          ))
        )}
      </div>
      
      {/* Compare button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {selectedIds.size === 0 
            ? 'Select at least 2 profiles to compare'
            : selectedIds.size === 1
            ? 'Select one more profile to compare'
            : `${selectedIds.size} profiles selected`
          }
        </p>
        
        <button
          onClick={handleCompare}
          disabled={selectedIds.size < 2}
          className="btn-primary flex items-center gap-2"
        >
          Compare Profiles
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Individual profile item in the list
 */
interface ProfileItemProps {
  profile: Profile;
  isSelected: boolean;
  onToggle: () => void;
}

function ProfileItem({ profile, isSelected, onToggle }: ProfileItemProps) {
  return (
    <label
      className={`flex items-center gap-4 p-4 cursor-pointer transition-colors
                  ${isSelected ? 'bg-sf-blue-50' : 'hover:bg-gray-50'}`}
    >
      <div className={`flex items-center justify-center w-5 h-5 rounded border-2 
                       transition-colors
                       ${isSelected 
                         ? 'bg-sf-blue-500 border-sf-blue-500' 
                         : 'border-gray-300'}`}>
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">
          {profile.name}
        </p>
        <p className="text-xs text-gray-500 font-mono truncate">
          {profile.id}
        </p>
      </div>
      
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="sr-only"
      />
    </label>
  );
}

export default ProfileSelector;
