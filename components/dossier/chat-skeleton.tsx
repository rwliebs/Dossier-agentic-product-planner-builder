"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the chat / planning column.
 * Mimics message bubbles and input area.
 */
export function ChatSkeleton() {
  return (
    <div className="flex flex-col h-full p-4 space-y-4 animate-in fade-in duration-200">
      <div className="flex-1 space-y-4">
        <div className="flex justify-end">
          <Skeleton className="h-12 w-48 rounded-lg" />
        </div>
        <div className="flex justify-start">
          <Skeleton className="h-16 w-56 rounded-lg" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
        <div className="flex justify-start">
          <Skeleton className="h-20 w-64 rounded-lg" />
        </div>
      </div>
      <div className="shrink-0 space-y-2">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-8 w-20 rounded" />
      </div>
    </div>
  );
}
