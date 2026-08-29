import { createAvatar } from "@dicebear/core";
import * as glass from "@dicebear/glass";
import * as notionists from "@dicebear/notionists";

const EMPLOYEE_PHOTO_AVATARS: Record<string, string> = {
  "Анна Соколова": "/images/roleplay/anna-sokolova.webp",
  "Игорь Петров": "/images/roleplay/igor-petrov.webp",
  "Марина Ким": "/images/roleplay/marina-kim.webp",
  "Ольга Веретенникова": "/images/roleplay/olga-veretennikova.webp",
  "Тимур Асланов": "/images/roleplay/timur-aslanov.webp",
};

/**
 * Основные персонажи используют локальные сгенерированные фотопортреты, чтобы
 * выглядеть одинаково в каталоге, комнате диалога и демо-туре. Для новых
 * пользовательских персонажей остаётся детерминированный DiceBear fallback.
 */
export function employeeAvatarUri(seed: string): string {
  const photoAvatar = EMPLOYEE_PHOTO_AVATARS[seed.trim()];
  if (photoAvatar) return photoAvatar;

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
