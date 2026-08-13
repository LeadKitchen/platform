import { desc, eq, GameConfigVersion } from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
  type ConfigSnapshot,
  diffSnapshots,
  loadConfigSnapshot,
  lockConfig,
  restoreSnapshot,
} from "../../../game/config-version";
import { methodologistProcedure } from "../../../orpc";

export const list = methodologistProcedure
  .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }))
  .handler(async ({ context, input }) => {
    const versions = await context.db
      .select()
      .from(GameConfigVersion)
      .orderBy(desc(GameConfigVersion.createdAt))
      .limit(input.limit);
    return versions.map((version) => ({
      id: version.id,
      actorId: version.actorId,
      source: version.source,
      summary: version.summary,
      revertedVersionId: version.revertedVersionId,
      createdAt: version.createdAt,
      changes: diffSnapshots(
        version.beforeSnapshot as unknown as ConfigSnapshot,
        version.afterSnapshot as unknown as ConfigSnapshot,
      ),
    }));
  });

export const rollback = methodologistProcedure
  .input(z.object({ versionId: z.uuid() }))
  .handler(async ({ context, input }) =>
    context.db.transaction(async (tx) => {
      await lockConfig(tx);
      const [target] = await tx
        .select()
        .from(GameConfigVersion)
        .where(eq(GameConfigVersion.id, input.versionId))
        .limit(1);
      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "Версия не найдена" });
      }
      const before = await loadConfigSnapshot(tx);
      const restored = target.beforeSnapshot as unknown as ConfigSnapshot;
      await restoreSnapshot(tx, restored);
      const after = await loadConfigSnapshot(tx);
      const [version] = await tx
        .insert(GameConfigVersion)
        .values({
          actorId: context.session.user.id,
          source: "rollback",
          summary: `Откат версии: ${target.summary}`,
          beforeSnapshot: before as unknown as Record<string, unknown>,
          afterSnapshot: after as unknown as Record<string, unknown>,
          revertedVersionId: target.id,
        })
        .returning({ id: GameConfigVersion.id });
      return {
        versionId: version?.id,
        changes: diffSnapshots(before, after),
      };
    }),
  );

export const adminGameVersionsRouter = { list, rollback };
