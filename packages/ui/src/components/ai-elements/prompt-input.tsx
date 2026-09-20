"use client";

import { SendIcon, XIcon } from "lucide-react";
import type {
  ComponentProps,
  HTMLAttributes,
  KeyboardEventHandler,
} from "react";
import { Button, cn, Textarea } from "..";
import { Loader } from "./loader";

export type PromptInputProps = HTMLAttributes<HTMLFormElement>;

export const PromptInput = ({ className, ...props }: PromptInputProps) => (
  <form
    className={cn(
      "divide-y divide-border overflow-hidden rounded-xl border bg-card",
      className,
    )}
    {...props}
  />
);

export type PromptInputTextareaProps = ComponentProps<typeof Textarea> & {
  /** Submits the closest form on Enter — Shift+Enter still inserts a newline. */
  onSubmit?: () => void;
};

export const PromptInputTextarea = ({
  className,
  onKeyDown,
  onSubmit,
  ...props
}: PromptInputTextareaProps) => {
  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (
    event,
  ) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <Textarea
      className={cn(
        "min-h-16 resize-none rounded-none border-none bg-transparent shadow-none focus-visible:ring-0",
        className,
      )}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
};

export type PromptInputToolbarProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputToolbar = ({
  className,
  ...props
}: PromptInputToolbarProps) => (
  <div
    className={cn("flex items-center justify-between gap-2 p-2", className)}
    {...props}
  />
);

export type PromptInputSubmitStatus = "submitted" | "streaming" | "error";

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
  status?: PromptInputSubmitStatus;
};

export const PromptInputSubmit = ({
  className,
  size = "icon",
  status,
  children,
  ...props
}: PromptInputSubmitProps) => {
  let icon = <SendIcon className="size-4" />;
  if (status === "submitted" || status === "streaming") {
    icon = <Loader size={16} />;
  } else if (status === "error") {
    icon = <XIcon className="size-4" />;
  }

  return (
    <Button
      className={cn("shrink-0", className)}
      size={size}
      type="submit"
      {...props}
    >
      {children ?? icon}
    </Button>
  );
};

