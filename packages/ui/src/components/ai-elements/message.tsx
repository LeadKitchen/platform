"use client";

import type { ComponentProps, HTMLAttributes } from "react";
import { Avatar, AvatarFallback, AvatarImage, cn } from "..";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant";
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full items-end justify-end gap-2 py-2",
      from === "assistant" && "flex-row-reverse justify-end",
      className,
    )}
    data-role={from}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "flex max-w-[85%] flex-col gap-1.5 rounded-2xl px-4 py-3 text-sm",
      "group-data-[role=assistant]:bg-muted",
      "group-data-[role=user]:bg-primary/10",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageAvatarProps = ComponentProps<typeof Avatar> & {
  src: string;
  name?: string;
};

export const MessageAvatar = ({
  src,
  name,
  className,
  ...props
}: MessageAvatarProps) => (
  <Avatar className={cn("size-6 shrink-0", className)} {...props}>
    <AvatarImage alt={name} src={src} />
    <AvatarFallback>{name?.slice(0, 1).toUpperCase()}</AvatarFallback>
  </Avatar>
);
