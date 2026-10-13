import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { GlobalSearchDialog } from './GlobalSearchDialog';

export const AppShell: React.FC = () => {
  return (
    <div className="min-h-screen flex bg-surface-cream text-ink-primary">
      {/* Accessible Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-burgundy focus:text-surface-ivory focus:text-xs focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* Collapsible Sidebar Navigation */}
      <Sidebar />

      {/* Primary Content Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader />

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-5 lg:px-6 lg:py-6 max-w-[1600px] w-full mx-auto outline-none"
        >
          <Outlet />
        </main>
      </div>

      {/* Global Search / Command Palette */}
      <GlobalSearchDialog />
    </div>
  );
};
