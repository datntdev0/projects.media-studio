import { MoonIcon, SunIcon } from '@/components/icons';
import type { Theme } from './useTheme';

interface ThemeToggleProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

// A two-option segmented control (native radios, styled via the design
// system's .seg/.seg-opt) pinned to the bottom of the nav — the same pattern
// the mockups use for other binary switches (table/grid, read/edit).
export function ThemeToggle({ theme, onChange }: ThemeToggleProps) {
  return (
    <div className="sidebar-footer">
      <div className="seg theme-toggle">
        <label className="seg-opt theme-toggle-opt" title="Light">
          <input
            type="radio"
            name="theme"
            checked={theme === 'light'}
            onChange={() => onChange('light')}
          />
          <SunIcon width={14} height={14} />
          <span className="theme-toggle-label">Light</span>
        </label>
        <label className="seg-opt theme-toggle-opt" title="Dark">
          <input
            type="radio"
            name="theme"
            checked={theme === 'dark'}
            onChange={() => onChange('dark')}
          />
          <MoonIcon width={14} height={14} />
          <span className="theme-toggle-label">Dark</span>
        </label>
      </div>
    </div>
  );
}
