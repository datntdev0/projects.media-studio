import type { ComponentType, SVGProps } from 'react';
import {
  DashboardIcon,
  LibraryIcon,
  ScrapingsIcon,
  SettingsIcon,
  WorkflowIcon,
} from '../icons';
import { DashboardScreen } from '../../features/dashboard/DashboardScreen';
import { WorkflowScreen } from '../../features/workflow/WorkflowScreen';
import { LibraryScreen } from '../../features/library/LibraryScreen';
import { ScrapingsScreen } from '../../features/scrapings/ScrapingsScreen';
import { SettingsScreen } from '../../features/settings/SettingsScreen';
import type { PageKey } from './useNavigation';

export interface NavItem {
  key: PageKey;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { key: 'workflow', label: 'Workflow', Icon: WorkflowIcon },
  { key: 'library', label: 'Library', Icon: LibraryIcon },
  { key: 'scrapings', label: 'Scrapings', Icon: ScrapingsIcon },
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
  workflow: { title: 'Workflow', Component: WorkflowScreen },
  library: { title: 'Library', Component: LibraryScreen },
  scrapings: { title: 'Scrapings', Component: ScrapingsScreen },
  settings: { title: 'Settings', Component: SettingsScreen },
};
