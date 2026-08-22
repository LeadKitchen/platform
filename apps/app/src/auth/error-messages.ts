const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Неверный адрес электронной почты или пароль.",
  USER_ALREADY_EXISTS: "Пользователь с таким email уже существует.",
  USER_NOT_FOUND: "Пользователь не найден.",
  INVALID_OTP: "Неверный код. Попробуйте снова.",
  EMAIL_NOT_VERIFIED: "Email не подтвержден.",
  TOO_MANY_REQUESTS: "Слишком много попыток. Попробуйте позже.",
};

export function getAuthErrorMessage(
  code: string | undefined,
  fallback: string,
): string {
  if (!code) return fallback;
  return ERROR_MESSAGES[code] ?? fallback;
}
