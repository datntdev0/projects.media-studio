import { Sidebar } from './components/app-shell/Sidebar';
import { TopBar } from './components/app-shell/TopBar';
import { PAGES } from './components/app-shell/navConfig';
import { useNavigation } from './components/app-shell/useNavigation';
import { useTheme } from './components/app-shell/useTheme';

export function App() {
  const { page, goTo, sidebarCollapsed, toggleSidebar } = useNavigation();
  const { theme, setTheme } = useTheme();
  const { title, Component } = PAGES[page];

  return (
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar page={page} onNavigate={goTo} theme={theme} onThemeChange={setTheme} />
      <main className="main-panel">
        <TopBar title={title} onToggleSidebar={toggleSidebar} />
        <div className="page-content">
          <Component />
        </div>
      </main>
    </div>
  );
}
