"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { api } from "~/orpc/server";

export type ReviewReport = Awaited<
  ReturnType<typeof api.admin.game.reviews.list>
>[number];

function dateLabel(value: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const markdownComponents = {
  h1: (props: React.ComponentProps<"h1">) => (
    <h2 className="mt-8 mb-3 font-semibold text-xl first:mt-0" {...props} />
  ),
  h2: (props: React.ComponentProps<"h2">) => (
    <h3 className="mt-7 mb-3 font-semibold text-lg first:mt-0" {...props} />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h4 className="mt-5 mb-2 font-medium text-base" {...props} />
  ),
  p: (props: React.ComponentProps<"p">) => (
    <p className="mb-3 text-sm leading-relaxed" {...props} />
  ),
  ul: (props: React.ComponentProps<"ul">) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 text-sm" {...props} />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm" {...props} />
  ),
  li: (props: React.ComponentProps<"li">) => (
    <li className="leading-relaxed" {...props} />
  ),
  strong: (props: React.ComponentProps<"strong">) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  code: (props: React.ComponentProps<"code">) => (
    <code
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
      {...props}
    />
  ),
  blockquote: (props: React.ComponentProps<"blockquote">) => (
    <blockquote
      className="mb-3 border-muted-foreground/30 border-l-2 pl-4 text-muted-foreground text-sm italic"
      {...props}
    />
  ),
  hr: () => <hr className="my-6 border-border" />,
  table: (props: React.ComponentProps<"table">) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  thead: (props: React.ComponentProps<"thead">) => (
    <thead className="border-b" {...props} />
  ),
  th: (props: React.ComponentProps<"th">) => (
    <th
      className="px-3 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide"
      {...props}
    />
  ),
  td: (props: React.ComponentProps<"td">) => (
    <td className="border-b px-3 py-2 align-top" {...props} />
  ),
};

/**
 * Written reviews of external/reference implementations.
 *
 * Same publish-offline-then-display philosophy as `AdminBenchmarkReports`:
 * the markdown body is authored outside the app and inserted verbatim into
 * `game_review_reports`, so this component only renders it.
 */
export function AdminReviewReports({ reports }: { reports: ReviewReport[] }) {
  const [selectedId, setSelectedId] = useState(reports[0]?.id);
  const report = reports.find((item) => item.id === selectedId) ?? reports[0];

  if (!report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Отчёты ревью</CardTitle>
          <CardDescription>
            Пока не опубликовано ни одного отчёта.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Опубликуйте отчёт из проанализированного репозитория:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            bun --filter @acme/db run src/scripts/publish-review.ts report.md
            --title "Название"
          </code>
          .
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Отчёты о ревью</CardTitle>
              <CardDescription>
                Технический разбор внешних реализаций и рекомендации на основе
                архитектуры Sitruk.
              </CardDescription>
            </div>
            {reports.length > 1 ? (
              <Select
                value={selectedId}
                onValueChange={(value) =>
                  setSelectedId(value ?? reports[0]?.id)
                }
              >
                <SelectTrigger className="w-auto min-w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {reports.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.title} — {dateLabel(item.createdAt)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{report.title}</CardTitle>
          <CardDescription>
            {report.summary || "Без краткого описания"} · опубликовано{" "}
            {dateLabel(report.createdAt)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {report.content}
          </Markdown>
        </CardContent>
      </Card>
    </div>
  );
}
