"use client";

import { Loader2Icon } from "lucide-react";
import type { HTMLAttributes } from "react";
import { cn } from "..";

export type LoaderProps = HTMLAttributes<HTMLDivElement> & {
  size?: number;
};

export const Loader = ({ className, size = 16, ...props }: LoaderProps) => (
  <div className={cn("inline-flex", className)} {...props}>
    <Loader2Icon
      className="animate-spin text-muted-foreground"
      size={size}
    />
  </div>
);
