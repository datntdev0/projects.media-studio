import { useEffect, useState } from 'react';
import type { AppInfo } from '../../../shared/app-info';

export function useAppInfo(): AppInfo | undefined {
  const [appInfo, setAppInfo] = useState<AppInfo | undefined>(undefined);

  useEffect(() => {
    window.appInfoApi.get().then((info) => setAppInfo(info ?? undefined));
  }, []);

  return appInfo;
}
