import { z } from "zod";

// Login form validation schema
export const loginFormSchema = z.object({
  email: z
    .string()
    .min(1, "Email обязателен")
    .email("Некорректный email адрес"),
});

export type LoginFormData = z.infer<typeof loginFormSchema>;
