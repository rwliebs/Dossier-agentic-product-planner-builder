"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the story map canvas.
 * Mimics workflow blocks, activities, and cards layout.
 */
export function MapSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-300">
      {/* Workflow row */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        {/* Activity columns */}
        <div className="flex gap-4 overflow-x-auto pb-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-56 space-y-3">
              <Skeleton className="h-5 w-24" />
              <div className="space-y-2">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Second workflow row */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {[1, 2].map((i) => (
            <div key={i} className="flex-shrink-0 w-52 space-y-3">
              <Skeleton className="h-5 w-20" />
              <div className="space-y-2">
                {[1, 2].map((j) => (
                  <Skeleton key={j} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
