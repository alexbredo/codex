
'use client';

import { Star } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface StarRatingInputProps {
  value?: number | null; // 0 or null for not rated, 1-5 for rated
  onChange: (value: number) => void;
  maxStars?: number;
  disabled?: boolean;
}

export function StarRatingInput({ 
  value = 0, 
  onChange, 
  maxStars = 5,
  disabled = false 
}: StarRatingInputProps) {
  const ratingValue = value ?? 0;

  const handleStarClick = (starValue: number) => {
    if (disabled) return;
    // If current value is same as clicked star, and it's for clearing, then clear.
    // Otherwise, set to new starValue.
    // For this component, clicking a star always sets its value.
    onChange(starValue);
  };

  const handleClearClick = () => {
    if (disabled) return;
    onChange(0); // Set to 0 for "not rated"
  };

  return (
    <div className="flex items-center space-x-1">
      {[...Array(maxStars)].map((_, index) => {
        const starValue = index + 1;
        return (
          <Button
            key={starValue}
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleStarClick(starValue)}
            disabled={disabled}
            className={cn(
              "p-1 h-7 w-7 rounded-full", // Adjusted size
              starValue <= ratingValue 
                ? "text-yellow-400 hover:text-yellow-500" 
                : "text-muted-foreground hover:text-yellow-400",
              disabled && "cursor-not-allowed opacity-70 hover:text-muted-foreground"
            )}
            aria-label={`Rate ${starValue} out of ${maxStars} stars`}
          >
            <Star
              className={cn("h-5 w-5", starValue <= ratingValue ? "fill-current" : "")}
            />
          </Button>
        );
      })}
      {ratingValue > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClearClick}
          disabled={disabled}
          className={cn(
            "ml-2 text-xs text-muted-foreground hover:text-destructive h-7 px-2",
            disabled && "cursor-not-allowed opacity-70 hover:text-muted-foreground"
            )}
          aria-label="Clear rating"
        >
          Clear
        </Button>
      )}
    </div>
  );
}
