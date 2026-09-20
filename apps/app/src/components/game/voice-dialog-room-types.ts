export interface VoiceTurn {
  role: "manager" | "employee";
  text: string;
  at: string;
  /** Set only for admin/QA callers — lets the hint button fetch the LLM prompt. */
  promptEventId?: string;
}

export interface PromptDebugData {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  model?: string;
}

export interface VoiceDialogRoomProps {
  dialogId: string;
  employee: {
    id: string;
    name: string;
    role: string;
    gender: "male" | "female";
  };
  task: { title: string };
  shift: { round: number; activeOrders: number; soloOnShift: boolean };
  initialTurns: Array<{
    role: "manager" | "employee";
    text: string;
    promptEventId?: string;
  }>;
  initialFinished: boolean;
  variantId: string;
  variantName: string;
  userAvatarSeed?: string;
  uploadedAvatarUrl?: string;
  /** Admin/QA only: shows hints linking to where this character/AI variant is configured. */
  isAdmin?: boolean;
}

export type EndDialog =
  | { kind: "confirm" }
  | {
      kind: "missing";
      missingCritical: Array<{ id: string; title: string; met: boolean }>;
    }
  | null;
