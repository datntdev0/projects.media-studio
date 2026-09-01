import { SearchIcon } from '@/components/icons';
import { NAV_ITEMS } from './navConfig';
import { ThemeToggle } from './ThemeToggle';
import { useAppInfo } from './useAppInfo';
import type { PageKey } from './useNavigation';
import type { Theme } from './useTheme';

interface SidebarProps {
  theme: Theme;
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  onThemeChange: (theme: Theme) => void;
}

export function Sidebar({ page, onNavigate, theme, onThemeChange }: SidebarProps) {
  const appInfo = useAppInfo();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <button className="navitem" type="button" title="Media Studio">
          <span className="sidebar-brand-mark">MS</span>
          <span className="navitem-label">Media Studio</span>
          {appInfo && <span className="tag tag-primary navitem-label">v{appInfo.appVersion}</span>}
        </button>
      </div>

      <div className="sidebar-nav">
        <nav className="sidebar-sections" aria-label="Sections">
          {NAV_ITEMS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={`navitem${page === key ? ' is-active' : ''}`}
              onClick={() => onNavigate(key)}
              title={label}
            >
              <Icon />
              <span className="navitem-label">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <ThemeToggle theme={theme} onChange={onThemeChange} />
    </aside>
  );
}
