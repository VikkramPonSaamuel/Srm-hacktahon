import React, { createContext, useContext, useEffect, useState } from 'react';
import type { TimeRangeValue } from '../styles/tokens';
import type { BrandProfile } from '../types/brand';
import { DEFAULT_BRAND_PROFILE } from '../types/brand';

interface ShellContextValue {
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  isMobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  timeRange: TimeRangeValue;
  setTimeRange: (range: TimeRangeValue) => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;
  isSearchDialogOpen: boolean;
  setSearchDialogOpen: (open: boolean) => void;
  brandProfile: BrandProfile;
  setBrandProfile: (profile: BrandProfile) => void;
  updateBrandProfile: (partial: Partial<BrandProfile>) => void;
  resetBrandProfile: () => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

const SIDEBAR_STORAGE_KEY = 'continuum.sidebar.collapsed';
const TIME_RANGE_STORAGE_KEY = 'continuum.shell.timeRange';
const BRAND_PROFILE_STORAGE_KEY = 'synesis.brand_profile';

export const ShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  const [timeRange, setTimeRangeState] = useState<TimeRangeValue>(() => {
    try {
      const saved = window.localStorage.getItem(TIME_RANGE_STORAGE_KEY) as TimeRangeValue | null;
      if (saved && ['15m', '1h', '6h', '24h', '7d', '30d'].includes(saved)) {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return '1h';
  });

  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  const [isSearchDialogOpen, setSearchDialogOpen] = useState<boolean>(false);

  // Brand Owner Profile & Customization State
  const [brandProfile, setBrandProfileState] = useState<BrandProfile>(() => {
    try {
      const saved = window.localStorage.getItem(BRAND_PROFILE_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_BRAND_PROFILE, ...JSON.parse(saved) };
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_BRAND_PROFILE;
  });

  const setBrandProfile = (profile: BrandProfile) => {
    setBrandProfileState(profile);
    try {
      window.localStorage.setItem(BRAND_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // ignore
    }
  };

  const updateBrandProfile = (partial: Partial<BrandProfile>) => {
    setBrandProfileState((prev) => {
      const next = { ...prev, ...partial, lastUpdated: new Date().toISOString() };
      try {
        window.localStorage.setItem(BRAND_PROFILE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const resetBrandProfile = () => {
    setBrandProfileState(DEFAULT_BRAND_PROFILE);
    try {
      window.localStorage.removeItem(BRAND_PROFILE_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const setSidebarCollapsed = (collapsed: boolean) => {
    setIsSidebarCollapsed(collapsed);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      // ignore storage errors
    }
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!isSidebarCollapsed);
  };

  const setTimeRange = (range: TimeRangeValue) => {
    setTimeRangeState(range);
    try {
      window.localStorage.setItem(TIME_RANGE_STORAGE_KEY, range);
    } catch {
      // ignore storage errors
    }
  };

  // Global keyboard shortcuts: Ctrl/Cmd + K for search, Ctrl/Cmd + B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchDialogOpen(true);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setIsSidebarCollapsed((prev) => {
          const next = !prev;
          try {
            window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
          } catch {
            // ignore
          }
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ShellContext.Provider
      value={{
        isSidebarCollapsed,
        toggleSidebar,
        setSidebarCollapsed,
        isMobileSidebarOpen,
        setMobileSidebarOpen,
        timeRange,
        setTimeRange,
        globalSearchQuery,
        setGlobalSearchQuery,
        isSearchDialogOpen,
        setSearchDialogOpen,
        brandProfile,
        setBrandProfile,
        updateBrandProfile,
        resetBrandProfile,
      }}
    >
      {children}
    </ShellContext.Provider>
  );
};

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error('useShell must be used within a ShellProvider');
  }
  return ctx;
}
