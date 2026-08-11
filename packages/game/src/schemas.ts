import { z } from "zod";

import {
  COMPETENCE_STATES,
  CRITERION_IDS,
  EMPLOYEE_LEVELS,
  MANAGEMENT_STYLES,
  OUTCOME_STATUSES,
  SHIFT_LOADS,
} from "./types";

export const managementStyleSchema = z.enum(MANAGEMENT_STYLES);
export const employeeLevelSchema = z.enum(EMPLOYEE_LEVELS);
export const competenceStateSchema = z.enum(COMPETENCE_STATES);
export const criterionIdSchema = z.enum(CRITERION_IDS);
export const shiftLoadSchema = z.enum(SHIFT_LOADS);
export const outcomeStatusSchema = z.enum(OUTCOME_STATUSES);
export const gameRoundSchema = z.union([z.literal(2), z.literal(3)]);

export const styleDistributionSchema = z.object({
  directive: z.number().min(0).max(1),
  coaching: z.number().min(0).max(1),
  supporting: z.number().min(0).max(1),
  delegating: z.number().min(0).max(1),
});

export const shiftContextSchema = z.object({
  round: gameRoundSchema,
  activeOrders: z.number().int().min(0),
  soloOnShift: z.boolean(),
  load: shiftLoadSchema,
});

export const dialogTurnSchema = z.object({
  role: z.enum(["manager", "employee"]),
  text: z.string().min(1).max(4000),
  at: z.string().optional(),
});

export const criterionResultSchema = z.object({
  id: criterionIdSchema,
  title: z.string(),
  weight: z.number(),
  met: z.boolean(),
  comment: z.string().optional(),
});

export const orderOutcomeSchema = z.object({
  status: outcomeStatusSchema,
  onTime: z.boolean(),
  defects: z.array(z.string()),
  motivationDelta: z.number().min(-2).max(2),
  summary: z.string(),
});

export const evaluationSchema = z.object({
  scorePercent: z.number().min(0).max(100),
  expectedStyle: managementStyleSchema,
  actualStyle: managementStyleSchema,
  styleDistribution: styleDistributionSchema,
  criteria: z.array(criterionResultSchema),
  outcome: orderOutcomeSchema,
  breakdown: z.object({
    style: z.number(),
    actions: z.number(),
    outcome: z.number(),
    penalties: z.number(),
  }),
  summary: z.string(),
});

export type EvaluationDto = z.infer<typeof evaluationSchema>;
