import { createProviderFromEnv } from "@acme/ai";
import { GameEmployee, GameProductEvent } from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
  characterRosterDraftSchema,
  evaluateCharacterRoster,
} from "../../../game/character-studio";
import {
  configRevision,
  loadConfigSnapshot,
  mutateConfig,
} from "../../../game/config-version";
import { methodologistProcedure } from "../../../orpc";

function qualityContext(
  snapshot: Awaited<ReturnType<typeof loadConfigSnapshot>>,
) {
  return {
    taskTypes: [
      ...new Set(
        snapshot.tasks.filter((task) => task.isActive).map((task) => task.type),
      ),
    ],
    existingIds: snapshot.employees.map((employee) => employee.id),
    existingNames: snapshot.employees.map((employee) => employee.name),
  };
}

export const draftRoster = methodologistProcedure
  .input(
    z.object({
      brief: z.string().trim().min(20).max(4000),
      count: z.number().int().min(1).max(5).default(3),
    }),
  )
  .handler(async ({ context, input, signal }) => {
    const snapshot = await loadConfigSnapshot(context.db);
    const provider = createProviderFromEnv();
    const activeTasks = snapshot.tasks
      .filter((task) => task.isActive)
      .map((task) => ({
        title: task.title,
        type: task.type,
        complexity: task.complexity,
      }));

    try {
      const result = await provider.generate({
        purpose: "admin.characters.draft",
        schemaName: "CharacterRosterDraft",
        schema: characterRosterDraftSchema,
        effort: "high",
        signal,
        system: [
          "Ты проектировщик персонажей для деловой игры по ситуационному руководству в ресторане.",
          `Создай ровно ${input.count} новых, контрастных и правдоподобных персонажей по брифу заказчика.`,
          "Каждый персонаж должен давать разные учебные ситуации в зависимости от типа задачи и управленческого подхода.",
          "Используй только переданные типы задач как ключи competences и только значения novice, learning, capable, expert.",
          "ID — уникальный lowercase snake_case без транслитерационных ошибок. Не повторяй существующие ID и имена.",
          "Не упоминай методологию, стили управления и уровни готовности в репликах персонажей.",
          "Пробные реплики должны звучать как живой сотрудник, отличаться друг от друга и показывать характер без карикатуры.",
          "Весь результат — на русском языке, кроме технических ID и enum-значений.",
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              brief: input.brief,
              count: input.count,
              activeTasks,
              existingCharacters: snapshot.employees.map((employee) => ({
                id: employee.id,
                name: employee.name,
                role: employee.role,
              })),
            }),
          },
        ],
      });
      const quality = evaluateCharacterRoster(
        result.value,
        qualityContext(snapshot),
      );
      if (result.value.characters.length !== input.count) {
        quality.ready = false;
        quality.blockers.push(
          `Модель создала ${result.value.characters.length} персонажей вместо ${input.count}.`,
        );
      }
      await context.db.insert(GameProductEvent).values({
        userId: context.session.user.id,
        name: "llm_character_roster_drafted",
        properties: {
          requested: input.count,
          generated: result.value.characters.length,
          qualityScore: quality.score,
          model: result.model,
        },
      });
      return {
        draft: result.value,
        quality,
        baseRevision: configRevision(snapshot),
        meta: {
          model: result.model,
          latencyMs: result.latencyMs,
          requestedCount: input.count,
        },
      };
    } catch (cause) {
      if (signal?.aborted) throw cause;
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message:
          cause instanceof Error
            ? `Не удалось спроектировать персонажей: ${cause.message}`
            : "Лаборатория персонажей временно недоступна",
      });
    }
  });

export const publishRoster = methodologistProcedure
  .input(
    z.object({
      brief: z.string().trim().min(20).max(4000),
      requestedCount: z.number().int().min(1).max(5),
      baseRevision: z.string().length(64),
      draft: characterRosterDraftSchema,
    }),
  )
  .handler(async ({ context, input }) => {
    const audit = await mutateConfig(
      context.db,
      {
        actorId: context.session.user.id,
        source: "llm-character-studio",
        summary: `Набор персонажей: ${input.draft.teamName}`,
      },
      async (tx, before) => {
        if (configRevision(before) !== input.baseRevision) {
          throw new ORPCError("CONFLICT", {
            message:
              "Каталог изменился после генерации. Создайте набор заново, чтобы повторно пройти проверку качества.",
          });
        }
        const quality = evaluateCharacterRoster(
          input.draft,
          qualityContext(before),
        );
        if (input.draft.characters.length !== input.requestedCount) {
          throw new ORPCError("BAD_REQUEST", {
            message: `В наборе должно быть ${input.requestedCount} персонажей.`,
          });
        }
        if (!quality.ready) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              quality.blockers[0] ??
              "Набор не прошёл порог качества 80%. Создайте новый вариант.",
          });
        }
        const values = input.draft.characters.map(({ profile }) => ({
          ...profile,
          isActive: true,
        }));
        const created = await tx
          .insert(GameEmployee)
          .values(values)
          .returning({ id: GameEmployee.id });
        await tx.insert(GameProductEvent).values({
          userId: context.session.user.id,
          name: "llm_character_roster_published",
          properties: {
            teamName: input.draft.teamName,
            characters: created.length,
            requested: input.requestedCount,
            qualityScore: quality.score,
            brief: input.brief,
          },
        });
        return { created, quality };
      },
    );
    return {
      versionId: audit.versionId,
      createdIds: audit.result.created.map((item) => item.id),
      quality: audit.result.quality,
    };
  });

export const adminGameCharactersRouter = { draftRoster, publishRoster };
