"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the runs tab in the right panel.
 * Mimics run list and run detail layout.
 */
export function RunStatusSkeleton() {
  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-200">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border">
              <Skeleton className="h-6 w-6 rounded" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
