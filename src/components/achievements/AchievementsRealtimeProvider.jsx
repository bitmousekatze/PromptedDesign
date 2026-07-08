import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase.js';
import { fetchAllAchievements } from '../../lib/achievements.js';
import AchievementUnlockToast from './AchievementUnlockToast.jsx';

const AchievementsRealtimeContext = createContext({
  navigateToAchievements: () => {},
});

export const useAchievementsRealtime = () => useContext(AchievementsRealtimeContext);

export default function AchievementsRealtimeProvider({ user, onNavigateToAchievements, children }) {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState([]);
  const [active, setActive] = useState(null);
  const subscribedAtRef = useRef(0);

  const { data: catalog = [] } = useQuery({
    queryKey: ['achievements', 'catalog'],
    queryFn: fetchAllAchievements,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });

  const catalogById = useMemo(() => {
    const map = {};
    for (const a of catalog) map[a.id] = a;
    return map;
  }, [catalog]);

  const enqueueUnlock = useCallback((achievement) => {
    setQueue((prev) => [...prev, achievement]);
  }, []);

  useEffect(() => {
    if (!active && queue.length > 0) {
      setActive(queue[0]);
      setQueue((prev) => prev.slice(1));
    }
  }, [active, queue]);

  const dismissActive = useCallback((shouldNavigate) => {
    setActive(null);
    if (shouldNavigate && onNavigateToAchievements) {
      onNavigateToAchievements();
    }
  }, [onNavigateToAchievements]);

  useEffect(() => {
    if (!user?.id) return undefined;

    subscribedAtRef.current = Date.now();

    const channel = supabase
      .channel(`achievements-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_achievements',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const row = payload?.new;
          if (!row) return;

          const unlockedAtMs = row.unlocked_at ? new Date(row.unlocked_at).getTime() : Date.now();
          if (unlockedAtMs < subscribedAtRef.current - 1000) {
            return;
          }

          let achievement = catalogById[row.achievement_id];
          if (!achievement) {
            try {
              const { data } = await supabase
                .from('achievements')
                .select('*')
                .eq('id', row.achievement_id)
                .maybeSingle();
              if (data) achievement = data;
            } catch (e) {
              console.error('[achievements] failed to fetch achievement', e);
            }
          }

          if (achievement) {
            enqueueUnlock({ ...achievement, unlocked_at: row.unlocked_at });
          }

          queryClient.invalidateQueries({ queryKey: ['achievements', 'progress', user.id] });
        }
      )
      .on('system', { event: 'phx_reply' }, () => {})
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          queryClient.invalidateQueries({ queryKey: ['achievements', 'progress', user.id] });
        }
      });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['achievements', 'progress', user.id] });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient, catalogById, enqueueUnlock]);

  const ctxValue = useMemo(
    () => ({
      navigateToAchievements: () => onNavigateToAchievements && onNavigateToAchievements(),
    }),
    [onNavigateToAchievements]
  );

  return (
    <AchievementsRealtimeContext.Provider value={ctxValue}>
      {children}
      {active && (
        <AchievementUnlockToast
          achievement={active}
          onDismiss={dismissActive}
        />
      )}
    </AchievementsRealtimeContext.Provider>
  );
}
