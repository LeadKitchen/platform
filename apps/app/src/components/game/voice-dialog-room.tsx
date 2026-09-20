"use client";

import { cn } from "@acme/ui";
import { useRouter } from "next/navigation";
import { useVoiceDialogRoom } from "./use-voice-dialog-room";
import { VoiceDialogEmployeePanel } from "./voice-dialog-employee-panel";
import { VoiceDialogEndAlert } from "./voice-dialog-end-alert";
import { VoiceDialogFinished } from "./voice-dialog-finished";
import { VoiceDialogHeaderBar } from "./voice-dialog-header-bar";
import { VoiceDialogLobby } from "./voice-dialog-lobby";
import { VoiceDialogNotices } from "./voice-dialog-notices";
import { VoiceDialogPromptDebugDialog } from "./voice-dialog-prompt-debug-dialog";
import type { VoiceDialogRoomProps } from "./voice-dialog-room-types";
import { VoiceDialogSelfViewPanel } from "./voice-dialog-self-view-panel";
import { VoiceDialogTextComposer } from "./voice-dialog-text-composer";
import { VoiceDialogTranscriptPanel } from "./voice-dialog-transcript-panel";

export type { VoiceDialogRoomProps } from "./voice-dialog-room-types";

export function VoiceDialogRoom(props: VoiceDialogRoomProps) {
  const router = useRouter();
  const room = useVoiceDialogRoom(props);

  if (room.phase === "lobby") {
    return (
      <VoiceDialogLobby
        employee={props.employee}
        employeeAvatar={room.employeeAvatar}
        task={props.task}
        shift={props.shift}
        variantName={props.variantName}
        micSupported={room.speech.supported}
        onBack={() => router.push("/game/roleplay")}
        onStart={room.startCall}
      />
    );
  }

  if (room.phase === "finished") {
    return (
      <VoiceDialogFinished
        onOpenReport={() =>
          router.push(`/game/dialog/${props.dialogId}/report`)
        }
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-7.5rem)] flex-col gap-4">
      <VoiceDialogHeaderBar
        employeeName={props.employee.name}
        taskTitle={props.task.title}
        variantName={props.variantName}
        micSupported={room.speech.supported}
        micMuted={room.speech.muted}
        micRecording={room.speech.recording}
        micError={room.speech.error}
        onToggleMuted={() => room.speech.setMuted(!room.speech.muted)}
        transcriptVisible={room.transcriptVisible}
        onToggleTranscript={() =>
          room.setTranscriptVisible((current) => !current)
        }
        selfViewVisible={room.selfViewVisible}
        onToggleSelfView={() => room.setSelfViewVisible((current) => !current)}
        pending={room.pending}
        onEndClick={() => room.setEndDialog({ kind: "confirm" })}
      />

      <div
        className={cn(
          "grid min-h-0 gap-4 lg:flex-1",
          room.transcriptVisible
            ? "lg:grid-cols-[minmax(380px,1.4fr)_minmax(320px,1fr)]"
            : "grid-cols-1",
        )}
      >
        {room.transcriptVisible ? (
          <VoiceDialogTranscriptPanel
            turns={room.turns}
            duration={room.duration}
            employeeName={props.employee.name}
            employeeAvatar={room.employeeAvatar}
            managerAvatar={room.managerAvatar}
            isAdmin={props.isAdmin}
            onOpenPromptDebug={(eventId) => void room.openPromptDebug(eventId)}
            transcribing={room.speech.transcribing}
            pending={room.pending}
            transcriptEndRef={room.transcriptEndRef}
          />
        ) : null}

        <div className="grid min-h-0 gap-4 lg:grid-rows-[minmax(300px,1fr)_minmax(220px,0.7fr)]">
          <VoiceDialogEmployeePanel
            employeeId={props.employee.id}
            employeeName={props.employee.name}
            employeeRole={props.employee.role}
            employeeAvatar={room.employeeAvatar}
            variantId={props.variantId}
            variantName={props.variantName}
            isAdmin={props.isAdmin}
            pending={room.pending}
            speaking={room.voice.speaking}
            transcribing={room.speech.transcribing}
            micMuted={room.speech.muted}
            micRecording={room.speech.recording}
          />

          {room.selfViewVisible ? (
            <VoiceDialogSelfViewPanel
              managerAvatar={room.managerAvatar}
              duration={room.duration}
              micSupported={room.speech.supported}
              micMuted={room.speech.muted}
              onToggleMuted={() => room.speech.setMuted(!room.speech.muted)}
              voiceSupported={room.voice.supported}
              voiceEnabled={room.voice.enabled}
              onToggleVoiceEnabled={() =>
                room.voice.setEnabled(!room.voice.enabled)
              }
              onEndClick={() => room.setEndDialog({ kind: "confirm" })}
            />
          ) : null}
        </div>
      </div>

      <VoiceDialogNotices
        notice={room.notice}
        error={room.error ?? room.speech.error}
      />

      <VoiceDialogTextComposer
        value={room.textDraft}
        onChange={room.setTextDraft}
        pending={room.pending}
        onSend={() => void room.sendVoice(room.textDraft)}
      />

      <VoiceDialogEndAlert
        endDialog={room.endDialog}
        onOpenChange={(open) => {
          if (!open) room.setEndDialog(null);
        }}
        onConfirm={() =>
          void (room.endDialog?.kind === "missing"
            ? room.completeFinish()
            : room.requestFinish())
        }
      />

      <VoiceDialogPromptDebugDialog
        open={room.promptDialogEventId !== null}
        onOpenChange={(open) => {
          if (!open) room.closePromptDebug();
        }}
        loading={room.promptLoading}
        error={room.promptError}
        data={room.promptData}
      />
    </div>
  );
}
