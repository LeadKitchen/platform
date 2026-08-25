import { createAvatar } from "@dicebear/core";
import * as glass from "@dicebear/glass";
import * as notionists from "@dicebear/notionists";

/**
 * Детерминированный аватар ИИ-сотрудника (повара) — один и тот же человек
 * выглядит одинаково в списке смен, комнате диалога и демо-туре, без фото
 * реальных людей.
 */
export function employeeAvatarUri(seed: string): string {
  return createAvatar(notionists, {
    seed,
    size: 64,
  }).toDataUri();
}

/**
 * Детерминированный аватар руководителя (реального пользователя), пока он
 * не загрузил своё фото — абстрактный узор вместо инициалов на сером фоне.
 */
export function userAvatarUri(seed: string): string {
  return createAvatar(glass, {
    seed,
    size: 64,
  }).toDataUri();
}
