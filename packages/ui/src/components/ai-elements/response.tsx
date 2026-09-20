"use client";

import { memo } from "react";
import { Streamdown, type StreamdownProps } from "streamdown";
import { cn } from "..";

export type ResponseProps = StreamdownProps;

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

Response.displayName = "Response";
