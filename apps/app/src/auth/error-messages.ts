const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Неверный адрес электронной почты или пароль.",
  USER_ALREADY_EXISTS: "Пользователь с таким email уже существует.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "Пользователь с таким email уже существует. Используйте другой адрес.",
  USER_NOT_FOUND: "Пользователь не найден.",
  INVALID_OTP: "Неверный код. Попробуйте снова.",
  OTP_EXPIRED: "Код истек. Запросите новый код.",
  EMAIL_NOT_VERIFIED: "Email не подтвержден.",
  TOO_MANY_REQUESTS: "Слишком много попыток. Попробуйте позже.",
  TOO_MANY_ATTEMPTS: "Слишком много попыток. Попробуйте позже.",
};

export function getAuthErrorMessage(
  code: string | undefined,
  fallback: string,
): string {
  if (!code) return fallback;
  // Prevent prototype pollution by checking own property
  if (Object.hasOwn(ERROR_MESSAGES, code)) {
    return ERROR_MESSAGES[code] ?? fallback;
  }
  return fallback;
}
