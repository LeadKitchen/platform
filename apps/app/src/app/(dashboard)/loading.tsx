import { Skeleton } from "@acme/ui";

export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
