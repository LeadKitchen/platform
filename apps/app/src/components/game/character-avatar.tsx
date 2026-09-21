"use client";

import { Avatar } from "@acme/ui";
import Image from "next/image";
import { useState } from "react";
import { characterAvatarFallbackUri } from "~/lib/avatar";

/** Photos for fictional characters, including a photo if the main asset fails. */
export function CharacterAvatar({
  src,
  name,
  className,
}: {
  src: string;
  name: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return (
    <Avatar className={className} data-character-avatar>
      <Image
        key={src}
        src={failedSrc === src ? characterAvatarFallbackUri(src) : src}
        alt={name}
        width={512}
        height={512}
        unoptimized
        loading="eager"
        className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
        onError={() => setFailedSrc(src)}
      />
    </Avatar>
  );
}
