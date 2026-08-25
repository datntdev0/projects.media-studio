import { SearchIcon } from '../icons';
import { NAV_ITEMS } from './navConfig';
import { ThemeToggle } from './ThemeToggle';
import type { PageKey } from './useNavigation';
import type { Theme } from './useTheme';

interface SidebarProps {
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export function Sidebar({ page, onNavigate, theme, onThemeChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <button className="navitem" type="button">
          <span className="sidebar-brand-mark">MS</span>
          <span>Media Studio</span>
        </button>
      </div>

      <div className="sidebar-nav">
        <button className="navitem sidebar-search" type="button">
          <SearchIcon />
          <span>Search...</span>
          <span
            className="tag tag-neutral"
            style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 6px' }}
          >
            ⌘K
          </span>
        </button>

        <nav className="sidebar-sections" aria-label="Sections">
          {NAV_ITEMS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={`navitem${page === key ? ' is-active' : ''}`}
              onClick={() => onNavigate(key)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <ThemeToggle theme={theme} onChange={onThemeChange} />
    </aside>
  );
}
