import { BellIcon, PanelIcon } from '@/components/icons';

interface TopBarProps {
  title: string;
  onToggleSidebar: () => void;
}

export function TopBar({ title, onToggleSidebar }: TopBarProps) {
  return (
    <header className="topbar">
      <button
        className="btn btn-secondary btn-icon"
        type="button"
        onClick={onToggleSidebar}
        style={{ borderColor: 'transparent', width: 30, height: 30 }}
        aria-label="Toggle sidebar"
      >
        <PanelIcon />
      </button>
      <h4>{title}</h4>
      <div className="topbar-actions">
        <button
          className="btn btn-secondary btn-icon"
          type="button"
          style={{ borderColor: 'transparent', width: 30, height: 30 }}
          aria-label="Notifications"
        >
          <BellIcon />
        </button>
      </div>
    </header>
  );
}
