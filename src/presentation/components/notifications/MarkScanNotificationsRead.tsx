"use client";

import { useEffect } from "react";
import { markScanNotificationsReadAction } from "@/app/actions/notifications";
import { NOTIFICATIONS_CHANGED_EVENT } from "./useNotificationsRealtime";

/**
 * Entering the scans inbox counts as reviewing the scans, so their "new scan
 * completed" notices are marked read and stop piling up in the bell. Renders
 * nothing; it only runs once per visit.
 */
export function MarkScanNotificationsRead() {
    useEffect(() => {
        let cancelled = false;
        markScanNotificationsReadAction().then(result => {
            if (!cancelled && result.success) {
                window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return null;
}
