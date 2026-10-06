import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export const Skeleton = ({ className }: SkeletonProps) => {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        className
      )}
    />
  );
};

// Skeleton específicos para diferentes componentes
export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => {
  return (
    <div className="space-y-3">
      {/* Header skeleton */}
      <div className="flex space-x-4">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-4 w-[150px]" />
        <Skeleton className="h-4 w-[120px]" />
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-4 w-[80px]" />
      </div>
      
      {/* Rows skeleton */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex space-x-4">
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-4 w-[150px]" />
          <Skeleton className="h-4 w-[120px]" />
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-4 w-[80px]" />
        </div>
      ))}
    </div>
  );
};

export const CardSkeleton = () => {
  return (
    <div className="p-6 border rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-[200px]" />
        <Skeleton className="h-4 w-[60px]" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[80%]" />
      <div className="flex space-x-2">
        <Skeleton className="h-8 w-[80px]" />
        <Skeleton className="h-8 w-[80px]" />
      </div>
    </div>
  );
};

export const ChatbotCardSkeleton = () => {
  return (
    <div className="p-6 border rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-[120px]" />
            <Skeleton className="h-3 w-[80px]" />
          </div>
        </div>
        <Skeleton className="h-6 w-[60px]" />
      </div>
      <Skeleton className="h-4 w-full" />
      <div className="flex justify-between items-center">
        <div className="flex space-x-4">
          <div className="text-center">
            <Skeleton className="h-6 w-[40px] mx-auto" />
            <Skeleton className="h-3 w-[60px] mt-1" />
          </div>
          <div className="text-center">
            <Skeleton className="h-6 w-[40px] mx-auto" />
            <Skeleton className="h-3 w-[60px] mt-1" />
          </div>
        </div>
        <Skeleton className="h-8 w-8 rounded" />
      </div>
    </div>
  );
};

export const CampaignCardSkeleton = () => {
  return (
    <div className="p-6 border rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-[180px]" />
        <Skeleton className="h-5 w-[80px]" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[70%]" />
      
      <div className="space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-3 w-[60px]" />
          <Skeleton className="h-3 w-[40px]" />
        </div>
        <Skeleton className="h-2 w-full" />
      </div>
      
      <div className="flex justify-between items-center">
        <div className="flex space-x-4">
          <div>
            <Skeleton className="h-4 w-[30px]" />
            <Skeleton className="h-3 w-[80px] mt-1" />
          </div>
          <div>
            <Skeleton className="h-4 w-[30px]" />
            <Skeleton className="h-3 w-[60px] mt-1" />
          </div>
        </div>
        <Skeleton className="h-8 w-8 rounded" />
      </div>
    </div>
  );
};

export const DashboardCardSkeleton = () => {
  return (
    <div className="p-6 border rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-[120px]" />
        <Skeleton className="h-5 w-5 rounded" />
      </div>
      <Skeleton className="h-8 w-[100px]" />
      <div className="flex items-center space-x-2">
        <Skeleton className="h-4 w-[60px]" />
        <Skeleton className="h-4 w-[80px]" />
      </div>
    </div>
  );
};

export const ConversationSkeleton = () => {
  return (
    <div className="p-4 border-b space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-[120px]" />
            <Skeleton className="h-3 w-[80px]" />
          </div>
        </div>
        <Skeleton className="h-3 w-[60px]" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[60%]" />
    </div>
  );
};