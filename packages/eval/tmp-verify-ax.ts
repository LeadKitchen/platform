import { STYLE_JUDGE_SYSTEM } from "@acme/ai";
import { MANAGEMENT_STYLES } from "@acme/game";
import { ax, f } from "@ax-llm/ax";
import { z } from "zod";
import { createAxClientFromEnv } from "./src/optimize/ax-client";

const handle = createAxClientFromEnv();
console.log("candidate:", handle.candidateId, "model:", handle.model);

const signature = f()
  .input("transcript", z.string().describe("Расшифровка диалога"))
  .output(
    "directiveShare",
    z.number().describe("Доля директивного стиля, 0..1"),
  )
  .output(
    "coachingShare",
    z.number().describe("Доля наставнического стиля, 0..1"),
  )
  .output(
    "supportingShare",
    z.number().describe("Доля поддерживающего стиля, 0..1"),
  )
  .output(
    "delegatingShare",
    z.number().describe("Доля делегирующего стиля, 0..1"),
  )
  .output(
    "evidence",
    z.array(
      z.object({
        style: z.enum(MANAGEMENT_STYLES),
        quote: z.string().describe("Короткая цитата руководителя"),
      }),
    ),
  )
  .build();

const program = ax(signature);
program.setInstruction(STYLE_JUDGE_SYSTEM);

const result = await program.forward(handle.client, {
  transcript: `Сотрудник: Анна Соколова, Повар десертов.
Заказ: Пироги с яблоком, 20 порций, 1 шт., дедлайн через 90 мин.
Раунд 2, активных заказов 1, нагрузка normal.

Расшифровка диалога:
РУКОВОДИТЕЛЬ: Анна, нужно пироги с яблоком, 20 порций к 18:00.
СОТРУДНИК: Понял вас, сделаю.
РУКОВОДИТЕЛЬ: На твоё усмотрение, как обычно — доверяю.
СОТРУДНИК: Хорошо, начну с теста.
РУКОВОДИТЕЛЬ: Не буду вмешиваться, работай как привыкла.
СОТРУДНИК: Спасибо, всё сделаю к сроку.`,
});

console.log(JSON.stringify(result, null, 2));
