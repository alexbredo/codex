
'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarDisplayProps {
  rating?: number | null; // 0 or null for not rated, 1-5 for rated
  maxStars?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg'; // sm: h-4 w-4, md: h-5 w-5, lg: h-6 w-6
}

export function StarDisplay({ rating = 0, maxStars = 5, className, size = 'sm' }: StarDisplayProps) {
  const displayRating = rating ?? 0;

  const starSizeClass = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  }[size];

  if (displayRating === 0) {
    return <span className={cn("text-xs text-muted-foreground italic", className)}>Not rated</span>;
  }
  return (
    <div className={cn("flex items-center space-x-0.5", className)}>
      {[...Array(maxStars)].map((_, index) => {
        const starValue = index + 1;
        return (
          <Star
            key={starValue}
            className={cn(
              starSizeClass,
              starValue <= displayRating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/70"
            )}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}
