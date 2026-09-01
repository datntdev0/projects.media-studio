import type { ComponentType, SVGProps } from 'react';
import {
  DashboardIcon,
  LibraryIcon,
  SettingsIcon,
  WorkspacesIcon,
} from '@/components/icons';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { WorkspacesScreen } from '@/features/workspaces/WorkspacesScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import type { PageKey } from './useNavigation';

export interface NavItem {
  key: PageKey;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { key: 'workspaces', label: 'Workspaces', Icon: WorkspacesIcon },
  { key: 'library', label: 'Library', Icon: LibraryIcon },
  { key: 'settings', label: 'Settings', Icon: SettingsIcon },
];

interface PageMeta {
  title: string;
  Component: ComponentType;
}

// Registry the app shell uses to render the header title and the active
// screen for whichever PageKey is selected.
export const PAGES: Record<PageKey, PageMeta> = {
  dashboard: { title: 'Dashboard', Component: DashboardScreen },
  workspaces: { title: 'Workspaces', Component: WorkspacesScreen },
  library: { title: 'Library', Component: LibraryScreen },
  settings: { title: 'Settings', Component: SettingsScreen },
};
