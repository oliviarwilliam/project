import { Card, Skeleton } from "@/components/dashboard/ui";

// Shown while any page in the account area is loading.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Card className="mt-6 space-y-3">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}
      </Card>
    </div>
  );
}
