import { createAvatar } from "@dicebear/core";
import * as glass from "@dicebear/glass";

interface EmployeeAvatarIdentity {
  id?: string;
  gender?: "male" | "female";
}

const EMPLOYEE_PORTRAITS = [
  {
    id: "anna",
    name: "Анна Соколова",
    gender: "female",
    src: "/images/roleplay/anna-sokolova.webp",
  },
  {
    id: "igor",
    name: "Игорь Петров",
    gender: "male",
    src: "/images/roleplay/igor-petrov.webp",
  },
  {
    id: "marina",
    name: "Марина Лебедева",
    gender: "female",
    src: "/images/roleplay/marina-lebedeva.webp",
  },
  {
    // Существующий ID Дениса сохраняется в сценариях и истории диалогов.
    id: "timur",
    name: "Денис Волков",
    gender: "male",
    src: "/images/roleplay/denis-volkov.webp",
  },
  {
    id: "olga",
    name: "Ольга Веретенникова",
    gender: "female",
    src: "/images/roleplay/olga-veretennikova.webp",
  },
] as const;

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export const DEMO_MANAGER_AVATAR = "/images/roleplay/demo-manager.webp";

/** Use another local photo of the same gender when a character image fails. */
export function characterAvatarFallbackUri(src: string): string {
  const gender =
    EMPLOYEE_PORTRAITS.find((portrait) => portrait.src === src)?.gender ??
    "male";
  return (
    EMPLOYEE_PORTRAITS.find(
      (portrait) => portrait.gender === gender && portrait.src !== src,
    )?.src ?? EMPLOYEE_PORTRAITS[0].src
  );
}

/**
 * Единые локальные фотопортреты для всех экранов. Новые персонажи получают
 * стабильное фото из того же набора с учётом пола, без рисованных заглушек.
 * Выбор по имени сохраняет портрет между черновиком персонажа и его публикацией.
 */
export function employeeAvatarUri(
  seed: string,
  identity: EmployeeAvatarIdentity = {},
): string {
  const name = normalizeName(seed);
  const candidates = EMPLOYEE_PORTRAITS.filter(
    (item) => !identity.gender || item.gender === identity.gender,
  );
  const portrait =
    candidates.find((item) => normalizeName(item.name) === name) ??
    candidates.find(
      (item) =>
        item.id === identity.id &&
        (!name || name === normalizeName(item.name).split(" ")[0]),
    );
  if (portrait) return portrait.src;

  let hash = 0;
  for (const char of name) {
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  }
  return candidates[hash % candidates.length]?.src ?? EMPLOYEE_PORTRAITS[0].src;
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
