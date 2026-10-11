import { useEffect, useState } from 'react';
import { selectActiveSession, useAppStore } from '../../application/store';
import { reconcileSession } from '../../domain/session';

export function useFocusClock(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      const value = Date.now();
      setNow(value);
      const current = selectActiveSession(useAppStore.getState().sessions);
      if (current && reconcileSession(current, value) !== current) {
        void useAppStore.getState().updateSession('reconcile').catch(() => undefined);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
