import { describe, expect, test } from "bun:test";

import {
  type DialogContext,
  defaultCatalog,
  findEmployee,
  findTask,
  resolveExpectation,
  resolveShiftLoad,
} from "@acme/game";

import { createEngine } from "./engine";
import { createMockProvider } from "./provider/mock";
import type { LlmProvider, LlmRequest } from "./provider/types";
import { knowledgeRegistry } from "./registries";
import { graphRagKnowledge } from "./strategies/knowledge/graph-rag";
import { ragKnowledge } from "./strategies/knowledge/rag";
import {
  createInMemorySkillStore,
  createSkillRlPersona,
} from "./strategies/persona/skill-rl";
import type { StageDeps } from "./types";

function dialog(args: {
  employeeId: string;
  taskId: string;
  round?: 2 | 3;
  activeOrders?: number;
  soloOnShift?: boolean;
}): DialogContext {
  const employee = findEmployee(defaultCatalog, args.employeeId);
  const task = findTask(defaultCatalog, args.taskId);
  if (!employee || !task) throw new Error("fixture not found");

  const activeOrders = args.activeOrders ?? 1;
  const soloOnShift = args.soloOnShift ?? false;

  return {
    employee,
    task,
    order: {
      id: "order-1",
      taskId: task.id,
      employeeId: employee.id,
      portions: 1,
      deadlineMinutes: 90,
    },
    shift: {
      round: args.round ?? 2,
      activeOrders,
      soloOnShift,
      load: resolveShiftLoad(activeOrders, soloOnShift),
    },
    turns: [],
    engaged: false,
    emotion: 0,
  };
}

function stageDeps(
  provider: LlmProvider,
  params: Record<string, unknown> = {},
): StageDeps {
  return { provider, catalog: defaultCatalog, params };
}

/** Mock that answers every call site the pipeline can make. */
function testProvider(replyText = "Поняла, сделаю."): {
  provider: LlmProvider;
  calls: LlmRequest<unknown>[];
} {
  const calls: LlmRequest<unknown>[] = [];

  const provider = createMockProvider((request) => {
    calls.push(request);

    if (request.purpose === "persona.reply") {
      return {
        reply: replyText,
        understood: "Нужно приготовить заказ",
        readiness: "confident",
        requests: [],
        confirmsCheckpoints: false,
        emotionDelta: 1,
      };
    }

    if (request.purpose === "engagement.check") {
      return { engaged: true, reason: "обращение к цеху" };
    }

    if (request.purpose === "evaluation.style") {
      return {
        distribution: {
          directive: 0.8,
          coaching: 0.2,
          supporting: 0,
          delegating: 0,
        },
        evidence: [{ style: "directive", quote: "сделай по шагам" }],
      };
    }

    // evaluation.criteria — mark everything the judge was asked about as met.
    const asked = request.messages
      .map((message) => message.content)
      .join("\n")
      .split("\n")
      .flatMap((line) => {
        const match = /^- ([a-z_]+):/.exec(line.trim());
        return match?.[1] ? [match[1]] : [];
      });

    return {
      criteria: asked.map((id) => ({
        id,
        met: true,
        comment: "видно из речи",
      })),
      toxicTurns: 0,
    };
  });

  return { provider, calls };
}

describe("pipeline engagement gate", () => {
  test("the character stays silent — and costs nothing — until addressed", async () => {
    const { provider, calls } = testProvider();
    const engine = createEngine({ provider });
    const pipeline = engine.pipeline("baseline");

    const result = await pipeline.respond({
      dialog: dialog({ employeeId: "anna", taskId: "apple_pies" }),
      utterance: "Так, посмотрим, что там по заказам на вечер",
    });

    expect(result.reply.silent).toBe(true);
    expect(result.reply.reply).toBe("");
    expect(result.dialog.engaged).toBe(false);
    expect(result.telemetry.costUsd).toBe(0);
    expect(calls).toHaveLength(0);
  });

  test("addressing the employee by name starts the dialog", async () => {
    const { provider, calls } = testProvider();
    const engine = createEngine({ provider });
    const pipeline = engine.pipeline("baseline");

    const result = await pipeline.respond({
      dialog: dialog({ employeeId: "anna", taskId: "apple_pies" }),
      utterance: "Анна, нужно 20 пирогов к 18:00.",
    });

    expect(result.reply.silent).toBe(false);
    expect(result.dialog.engaged).toBe(true);
    expect(result.dialog.turns).toHaveLength(2);
    expect(result.dialog.emotion).toBe(1);
    expect(calls.map((call) => call.purpose)).toContain("persona.reply");
  });

  test("once engaged the character keeps answering", async () => {
    const { provider } = testProvider();
    const pipeline = createEngine({ provider }).pipeline("baseline");

    const first = await pipeline.respond({
      dialog: dialog({ employeeId: "anna", taskId: "apple_pies" }),
      utterance: "Анна, возьмёшь пироги?",
    });
    const second = await pipeline.respond({
      dialog: first.dialog,
      utterance: "Хорошо.",
    });

    expect(second.reply.silent).toBe(false);
  });
});

describe("engagement gate is pluggable", () => {
  test("the LLM gate can recognise an address the markers miss", async () => {
    const { provider, calls } = testProvider();
    const heuristic = createEngine({ provider }).pipeline("baseline");
    const llm = createEngine({ provider }).pipeline("llm-first");

    // Обращение по должности, без имени и без вопроса: маркеры его не ловят.
    const utterance = "Пусть десертный цех берёт торт на банкет.";

    const byMarkers = await heuristic.respond({
      dialog: dialog({ employeeId: "anna", taskId: "decorated_cake" }),
      utterance,
    });
    const byModel = await llm.respond({
      dialog: dialog({ employeeId: "anna", taskId: "decorated_cake" }),
      utterance,
    });

    expect(byMarkers.reply.silent).toBe(true);
    expect(byModel.reply.silent).toBe(false);
    expect(calls.map((call) => call.purpose)).toContain("engagement.check");
  });

  test("the gate is not consulted again once the dialog is running", async () => {
    const { provider, calls } = testProvider();
    const pipeline = createEngine({ provider }).pipeline("llm-first");

    const first = await pipeline.respond({
      dialog: dialog({ employeeId: "anna", taskId: "apple_pies" }),
      utterance: "Анна, возьмёшь пироги?",
    });
    calls.length = 0;

    await pipeline.respond({ dialog: first.dialog, utterance: "Ага." });

    expect(calls.map((call) => call.purpose)).not.toContain("engagement.check");
  });
});

describe("knowledge strategies", () => {
  const context = dialog({ employeeId: "anna", taskId: "decorated_cake" });
  const expectation = resolveExpectation(
    context.employee,
    context.task,
    context.shift,
  );

  test("RAG retrieves the competence fact for the task at hand", async () => {
    const { provider } = testProvider();
    const result = await ragKnowledge.retrieve(
      { dialog: context, expectation, query: "торт с украшением на банкет" },
      stageDeps(provider, { topK: 6 }),
    );

    expect(result.snippets.length).toBeGreaterThan(0);
    expect(result.snippets.some((s) => s.id === "profile:anna")).toBe(true);
    expect(result.snippets.some((s) => s.id.startsWith("task:"))).toBe(true);
  });

  test("GraphRAG derives the level × novelty path", async () => {
    const { provider } = testProvider();
    const result = await graphRagKnowledge.retrieve(
      { dialog: context, expectation, query: "торт" },
      stageDeps(provider, { hops: 2 }),
    );

    const text = result.snippets.map((s) => s.text).join(" ");
    expect(text).toContain("Путь вывода");
    expect(text).toContain("новая");
  });

  test("no strategy leaks the expected style into the character context", async () => {
    const { provider } = testProvider();
    const forbidden = ["директивн", "делегирующ", "наставнич", "поддерживающ"];

    for (const strategy of knowledgeRegistry.list()) {
      const result = await strategy.retrieve(
        { dialog: context, expectation, query: "торт с украшением" },
        stageDeps(provider, { topK: 6, hops: 2 }),
      );
      const text = result.snippets
        .map((snippet) => snippet.text)
        .join(" ")
        .toLowerCase();

      for (const word of forbidden) {
        expect(`${strategy.id}: ${text.includes(word)}`).toBe(
          `${strategy.id}: false`,
        );
      }
    }
  });
});

describe("evaluation strategies", () => {
  test("rules evaluation needs no model call", async () => {
    const { provider, calls } = testProvider();
    const pipeline = createEngine({ provider }).pipeline("baseline");

    const context = dialog({ employeeId: "anna", taskId: "decorated_cake" });
    context.turns = [
      {
        role: "manager",
        text: "Анна, нужно сделать торт с украшением к 19:00. Объясню по шагам: сначала бисквит, потом декор. Перед сборкой покажи — я проверю. Всё понятно?",
      },
    ];

    const result = await pipeline.evaluate(context);

    expect(calls).toHaveLength(0);
    expect(result.evaluation.expectedStyle).toBe("directive");
    expect(result.evaluation.scorePercent).toBeGreaterThan(60);
    expect(result.costUsd).toBe(0);
  });

  test("hybrid evaluation combines the judge with the heuristics", async () => {
    const { provider, calls } = testProvider();
    const pipeline = createEngine({ provider }).pipeline("graph-rag");

    const context = dialog({ employeeId: "anna", taskId: "decorated_cake" });
    context.turns = [
      { role: "manager", text: "Анна, торт на банкет. Сделай как обычно." },
    ];

    const result = await pipeline.evaluate(context);
    const purposes = calls.map((call) => call.purpose);

    expect(purposes).toContain("evaluation.style");
    expect(purposes).toContain("evaluation.criteria");
    // The judge reported a directive style, so the blended verdict follows it.
    expect(result.evaluation.actualStyle).toBe("directive");
    expect(result.evaluation.criteria.every((item) => item.met)).toBe(true);
  });
});

describe("skill-rl persona", () => {
  test("reward moves the policy and is scoped to the context", async () => {
    const store = createInMemorySkillStore();
    const persona = createSkillRlPersona({ store, activeSkills: 2 });
    const { provider } = testProvider();

    const context = dialog({
      employeeId: "anna",
      taskId: "decorated_cake",
      round: 3,
      activeOrders: 4,
      soloOnShift: true,
    });
    const expectation = resolveExpectation(
      context.employee,
      context.task,
      context.shift,
    );

    const result = await persona.respond(
      {
        dialog: context,
        expectation,
        knowledge: { snippets: [], latencyMs: 0 },
        utterance: "Анна, сделаешь торт?",
      },
      stageDeps(provider),
    );

    const chosen = result.meta?.skills as string[];
    expect(chosen.length).toBe(2);

    await persona.learn?.({
      dialogId: "d1",
      variantId: "skill-rl",
      evaluation: {} as never,
      reward: 1,
      turnMeta: [result.meta ?? {}],
    });

    const snapshot = store.snapshot();
    const key = `${result.meta?.contextKey}::${chosen[0]}`;
    expect(snapshot[key]?.count).toBe(1);
    expect(snapshot[key]?.value).toBeGreaterThan(0.6);
  });

  test("selection is deterministic for the same context", async () => {
    const persona = createSkillRlPersona({
      store: createInMemorySkillStore(),
    });
    const { provider } = testProvider();
    const context = dialog({ employeeId: "marina", taskId: "salads" });
    const expectation = resolveExpectation(
      context.employee,
      context.task,
      context.shift,
    );
    const request = {
      dialog: context,
      expectation,
      knowledge: { snippets: [], latencyMs: 0 },
      utterance: "Марина, сделаешь салаты?",
    };

    const first = await persona.respond(request, stageDeps(provider));
    const second = await persona.respond(request, stageDeps(provider));

    expect(second.meta?.skills).toEqual(first.meta?.skills);
  });
});

describe("variants", () => {
  test("every built-in variant resolves to registered strategies", () => {
    const engine = createEngine({ provider: testProvider().provider });
    for (const variant of engine.variants()) {
      expect(() => engine.pipeline(variant.id)).not.toThrow();
    }
  });

  test("an unknown variant fails loudly", () => {
    const engine = createEngine({ provider: testProvider().provider });
    expect(() => engine.pipeline("does-not-exist")).toThrow();
  });
});
