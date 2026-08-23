/**
 * Фирменная line-art графика на кухонную тематику вместо стоковых фото.
 * Всё на currentColor — наследует цвет от обёртки (обычно text-muted-foreground).
 */

export function ChefHatIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M27 45c-7.5 0-13-6-13-13 0-6.8 5-12.4 11.5-13.2C27 12 33.5 7 41.5 7c6.4 0 12 3.6 14.8 8.9C58 15 59.7 14.7 61.5 14.7c8 0 14.5 6.5 14.5 14.5 0 6.8-4.7 12.5-11 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M25 43v20a4 4 0 0 0 4 4h38a4 4 0 0 0 4-4V43"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M25 63h46v10a4 4 0 0 1-4 4H29a4 4 0 0 1-4-4V63Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M40 70h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TicketIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M24 14h48a3 3 0 0 1 3 3v10.5l-4 3 4 3-4 3 4 3-4 3 4 3-4 3 4 3-4 3 4 3-4 3 4 3v10.5a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3V71l4-3-4-3 4-3-4-3 4-3-4-3 4-3-4-3 4-3-4-3 4-3-4-3V17a3 3 0 0 1 3-3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M33 30h30M33 39h30M33 48h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WhiskIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M52 52 76 76"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M70 70a8 8 0 1 0 11.3 11.3A8 8 0 0 0 70 70Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M48 48c-10-6-18-16-20-28 10 4 18 12 24 22M48 48c2-11 0-23-6-33 10 2 18 10 22 21M48 48c8-8 12-19 11-30 9 5 14 15 13 26M48 48c11 2 22-1 31-8-3 10-11 18-22 22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Тонкая фоновая текстура на кухонную тему — вилка и ложка, повторяющиеся
 * по диагонали. Используется на hero-карточках при низкой непрозрачности,
 * а не как самостоятельная иллюстрация.
 */
export function KitchenPatternBackdrop({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id="kitchen-motif"
          width="64"
          height="64"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(12)"
        >
          <path
            d="M10 6v24M6 6h8v10a4 4 0 0 1-8 0V6Z"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M42 6c4 0 7 3.5 7 8 0 3.6-2.2 6.6-5 7.7L45 32h-6l1-10.3c-2.8-1.1-5-4.1-5-7.7 0-4.5 3-8 7-8Z"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="none"
            strokeLinejoin="round"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#kitchen-motif)" />
    </svg>
  );
}

/**
 * Пар за аватаром сотрудника, пока идёт «готовка» ответа — три волнистые
 * полоски поднимаются и растворяются со сдвигом по времени.
 */
export function SteamWisps({ className }: { className?: string }) {
  const wisps = [
    { left: "18%", delay: "0s", height: 22 },
    { left: "48%", delay: "0.6s", height: 26 },
    { left: "76%", delay: "1.1s", height: 20 },
  ];
  return (
    <div
      className={className}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {wisps.map((wisp) => (
        <svg
          key={wisp.left}
          viewBox="0 0 12 28"
          className="animate-steam text-muted-foreground/60 absolute bottom-1/2 w-2.5"
          style={{
            left: wisp.left,
            height: wisp.height,
            animationDelay: wisp.delay,
          }}
        >
          <path
            d="M6 27c3-3 3-5.5 0-8.5S3 13 6 9.5 9 3 6 1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      ))}
    </div>
  );
}
