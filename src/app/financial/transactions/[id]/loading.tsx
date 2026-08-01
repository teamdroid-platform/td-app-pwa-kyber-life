/**
 * Shown the instant a transaction is tapped.
 *
 * Without it the router had nothing to render while the server resolved the
 * transaction, so the app stayed on the list looking frozen — which is exactly
 * why the row got tapped again and again. The shape mirrors the real screen so
 * the content lands in place instead of rearranging it.
 */
export default function Loading() {
    return (
        <div className="flex w-full max-w-5xl flex-col gap-6 mx-auto" aria-busy="true">
            <span className="sr-only" role="status">Cargando la transacción</span>

            <div className="flex items-center gap-4">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted/60" />
                <div className="min-w-0 flex-1">
                    <div className="h-7 w-64 max-w-full animate-pulse rounded-lg bg-muted/60" />
                    <div className="mt-2 h-4 w-48 max-w-full animate-pulse rounded bg-muted/40" />
                </div>
            </div>

            {/* Hero */}
            <div className="flex flex-col gap-2 rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-4">
                <div className="h-6 w-24 animate-pulse rounded-full bg-muted/50" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" />
                <div className="h-8 w-40 animate-pulse rounded-lg bg-muted/60" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted/40" />
            </div>

            {/* Field rows */}
            <div className="flex flex-col gap-1.5">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-bg-secondary/40 p-2.5">
                        <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted/50" />
                        <div className="min-w-0 flex-1">
                            <div className="h-2.5 w-20 animate-pulse rounded bg-muted/40" />
                            <div className="mt-1.5 h-3.5 w-2/3 animate-pulse rounded bg-muted/50" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
