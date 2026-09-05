import { ORPCError } from "@orpc/server";
import { api } from "~/orpc/server";
import { toCsvRow } from "./csv";

export const dynamic = "force-dynamic";

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
    let cursor: { createdAt: Date; id: string } | undefined;
    for (;;) {
      const page = await api.org.sessions.list({ limit: pageSize, cursor });
      pages.push(page);
      if (page.length < pageSize) break;
      const lastSession = page.at(-1)?.session;
      if (!lastSession) break;
      cursor = {
        createdAt: lastSession.createdAt,
        id: lastSession.id,
      };
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
