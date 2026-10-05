"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { createClient } from "@/infrastructure/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const POLLING_FALLBACK_MS = 60_000;

/**
 * Fired on `window` when this tab changes notifications outside the bell
 * (e.g. opening the scans inbox marks scan notices as read). Realtime only
 * listens for inserts, so without it the badge would keep the old count.
 */
export const NOTIFICATIONS_CHANGED_EVENT = "kyber:notifications-changed";

/**
 * Subscribes to new rows in `notifications` for this user via Supabase
 * Realtime (websockets). Falls back to polling `onRefresh` on an interval
 * if the channel never reaches SUBSCRIBED (e.g. Realtime disabled on the
 * project, or a network that blocks websockets) — the notification bell
 * still stays fresh either way.
 */
export function useNotificationsRealtime(userId: string | undefined, onRefresh: () => void) {
    const onRefreshRef = useRef(onRefresh);
    useLayoutEffect(() => {
        onRefreshRef.current = onRefresh;
    });

    useEffect(() => {
        if (!userId) return;

        const supabase = createClient();
        let pollingTimer: ReturnType<typeof setInterval> | null = null;
        let channel: RealtimeChannel | null = null;

        const startPolling = () => {
            if (pollingTimer) return;
            pollingTimer = setInterval(() => onRefreshRef.current(), POLLING_FALLBACK_MS);
        };
        const stopPolling = () => {
            if (pollingTimer) {
                clearInterval(pollingTimer);
                pollingTimer = null;
            }
        };

        channel = supabase
            .channel(`notifications-${userId}`)
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "notifications", filter: `owner_user_id=eq.${userId}` },
                () => onRefreshRef.current(),
            )
            .subscribe((status) => {
                if (status === "SUBSCRIBED") {
                    stopPolling();
                } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                    startPolling();
                }
            });

        const onLocalChange = () => onRefreshRef.current();
        window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onLocalChange);

        return () => {
            stopPolling();
            window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onLocalChange);
            if (channel) supabase.removeChannel(channel);
        };
    }, [userId]);
}
