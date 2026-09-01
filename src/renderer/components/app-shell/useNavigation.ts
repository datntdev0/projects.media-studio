import { useCallback, useState } from 'react';

export type PageKey =
  | 'dashboard'
  | 'library'
  | 'settings';

export interface NavigationState {
  page: PageKey;
  goTo: (page: PageKey) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export function useNavigation(initialPage: PageKey = 'dashboard'): NavigationState {
  const [page, setPage] = useState<PageKey>(initialPage);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const goTo = useCallback((next: PageKey) => {
    setPage(next);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => !collapsed);
  }, []);

  return { page, goTo, sidebarCollapsed, toggleSidebar };
}
