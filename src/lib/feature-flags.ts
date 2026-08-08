/**
 * System-wide Feature Flags for KyberLife
 *
 * Designed to be statically analysable by the Next.js compiler (tree-shakable).
 * Ensure each environment variable starts with NEXT_PUBLIC_ to be securely
 * shared with client-side code.
 */
export const FINANCIAL_FLAGS = {
    /**
     * Toggles Supabase Realtime websocket subscriptions for transaction updates.
     * Default: false (Forced polling fallback for Sprint 7 testing/stability)
     */
    REALTIME_ENABLED: process.env.NEXT_PUBLIC_FF_FINANCIAL_REALTIME === "true",

    /**
     * Toggles fallback HTTP polling when realtime is disabled or disconnected.
     * Default: true
     */
    POLLING_ENABLED: process.env.NEXT_PUBLIC_FF_FINANCIAL_POLLING !== "false",

    /**
     * Toggles AI-driven transaction categorization and financial insights dashboard.
     * Default: false (Under development)
     */
    AI_ENABLED: process.env.NEXT_PUBLIC_FF_FINANCIAL_AI === "true",

    /**
     * Toggles IndexedDB client-side local caching for offline usability.
     * Default: true
     */
    OFFLINE_ENABLED: process.env.NEXT_PUBLIC_FF_FINANCIAL_OFFLINE !== "false",

    /**
     * Toggles recurring transactions pattern matching and predictive reminders.
     * Default: false (Experimental)
     */
    RECURRING_DETECTION: process.env.NEXT_PUBLIC_FF_FINANCIAL_RECURRING === "true",

    /**
     * Toggles the stepped transaction wizard (create + edit) that replaces the
     * single-screen accordion form. Turning it off restores the previous form
     * without reverting any code.
     * Default: true
     */
    WIZARD_ENABLED: process.env.NEXT_PUBLIC_FF_FINANCIAL_WIZARD !== "false",

    /**
     * Toggles capturing a transaction by dictating it or writing a sentence,
     * instead of filling the form. Depends on the two N8N_EXTRACT_* webhooks
     * being reachable, so it stays off unless the deployment opts in.
     * Default: false
     */
    AI_CAPTURE_ENABLED: process.env.NEXT_PUBLIC_FF_FINANCIAL_AI_CAPTURE === "true",
} as const;

export type FinancialFeatureFlags = typeof FINANCIAL_FLAGS;
