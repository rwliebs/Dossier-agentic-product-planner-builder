"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for an expanded implementation card.
 * Mimics card header, knowledge sections, and planned files.
 */
export function CardSkeleton() {
  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-200">
      <div className="space-y-2">
        <Skeleton className="h-5 w-[75%]" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[83%]" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="space-y-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded" />
          <Skeleton className="h-8 w-24 rounded" />
        </div>
      </div>
    </div>
  );
}
