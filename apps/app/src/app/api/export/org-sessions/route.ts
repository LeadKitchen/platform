import { ORPCError } from "@orpc/server";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

/** Wraps a CSV field in quotes only when it needs escaping. */
function csvField(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  // Neutralize spreadsheet formula injection (=, +, -, @ prefixes).
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsvRow(values: (string | number | null)[]): string {
  return `${values.map(csvField).join(",")}\r\n`;
}

const STATUS_LABELS: Record<string, string> = {
  active: "идёт",
  completed: "завершена",
  archived: "в архиве",
};

/**
 * CSV of the caller's organization sessions, for the facilitator's own
 * records. Requires the facilitator grant checked by `org.sessions.list`
 * itself — this route only formats what that procedure already scoped.
 *
 * @example GET /api/export/org-sessions
 */
export async function GET() {
  let sessions: Awaited<ReturnType<typeof api.org.sessions.list>>;
  try {
    const pageSize = 200;
    const pages: Awaited<ReturnType<typeof api.org.sessions.list>>[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await api.org.sessions.list({ limit: pageSize, offset });
      pages.push(page);
      if (page.length < pageSize) break;
    }
    sessions = pages.flat();
  } catch (cause) {
    if (cause instanceof ORPCError && cause.code === "UNAUTHORIZED") {
      return new Response("Требуется вход", { status: 401 });
    }
    if (cause instanceof ORPCError && cause.code === "FORBIDDEN") {
      return new Response("Доступно только ведущим группы", { status: 403 });
    }
    throw cause;
  }

  const header = toCsvRow([
    "Сессия",
    "Раунд",
    "Участник",
    "Статус",
    "Диалогов",
    "Средний балл",
    "Дата создания",
  ]);

  const rows = sessions
    .map((row) =>
      toCsvRow([
        row.session.title,
        row.session.round,
        row.participant ?? "—",
        STATUS_LABELS[row.session.status] ?? row.session.status,
        row.dialogs,
        row.avgScore,
        new Date(row.session.createdAt).toLocaleString("ru-RU"),
      ]),
    )
    .join("");

  const csv = `﻿${header}${rows}`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="group-sessions.csv"',
    },
  });
}
