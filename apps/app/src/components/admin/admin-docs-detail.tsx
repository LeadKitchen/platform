import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
} from "@acme/ui";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import Link from "next/link";
import { ADMIN_DOC_SECTIONS, type AdminDocSection } from "~/content/admin-docs";

interface AdminDocsDetailProps {
  section: AdminDocSection;
}

export function AdminDocsDetail({ section }: AdminDocsDetailProps) {
  const sectionIndex = ADMIN_DOC_SECTIONS.findIndex(
    (item) => item.slug === section.slug,
  );
  const previousSection =
    sectionIndex > 0 ? ADMIN_DOC_SECTIONS[sectionIndex - 1] : undefined;
  const nextSection =
    sectionIndex < ADMIN_DOC_SECTIONS.length - 1
      ? ADMIN_DOC_SECTIONS[sectionIndex + 1]
      : undefined;
  const SectionIcon = section.icon;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <section className="flex flex-col items-start gap-5 py-4 lg:py-8">
          <div className="bg-muted text-foreground flex size-11 items-center justify-center rounded-xl">
            <SectionIcon />
          </div>
          <div className="flex max-w-3xl flex-col gap-3">
            <p className="text-muted-foreground text-sm font-medium">
              {section.eyebrow}
            </p>
            <h1 className="text-3xl font-medium tracking-[-0.035em] sm:text-4xl">
              {section.title}
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              {section.summary}
            </p>
          </div>
          {section.relatedLink && (
            <Button
              render={<Link href={section.relatedLink.href} />}
              nativeButton={false}
            >
              {section.relatedLink.label}
              <IconArrowRight data-icon="inline-end" />
            </Button>
          )}
      </section>

      <div className="flex flex-col gap-6">
        {section.blocks.map((block) => (
          <Card key={block.title} className="gap-0 overflow-hidden py-0 shadow-none">
            <CardHeader className="border-b py-5 [.border-b]:pb-5">
              <CardTitle>
                <h2>{block.title}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 py-5">
              {block.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-relaxed">
                  {paragraph}
                </p>
              ))}
              {block.bullets && (
                <ul className="flex flex-col gap-3">
                  {block.bullets.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm">
                      <IconCheck className="mt-0.5 shrink-0 text-primary" />
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <nav
        className="grid gap-3 sm:grid-cols-2"
        aria-label="Другие разделы документации"
      >
        {previousSection ? (
          <Button
            className="h-auto justify-start px-4 py-3"
            variant="outline"
            render={<Link href={`/admin/docs/${previousSection.slug}`} />}
            nativeButton={false}
          >
            <IconArrowRight data-icon="inline-start" className="rotate-180" />
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-muted-foreground text-xs">Предыдущий</span>
              <span>{previousSection.shortTitle}</span>
            </span>
          </Button>
        ) : (
          <Button
            className="h-auto justify-start px-4 py-3"
            variant="outline"
            render={<Link href="/admin/docs" />}
            nativeButton={false}
          >
            <IconArrowRight data-icon="inline-start" className="rotate-180" />
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-muted-foreground text-xs">К обзору</span>
              <span>Все разделы</span>
            </span>
          </Button>
        )}

        {nextSection ? (
          <Button
            className="h-auto justify-end px-4 py-3 sm:text-right"
            variant="outline"
            render={<Link href={`/admin/docs/${nextSection.slug}`} />}
            nativeButton={false}
          >
            <span className="flex flex-col items-end gap-0.5">
              <span className="text-muted-foreground text-xs">Следующий</span>
              <span>{nextSection.shortTitle}</span>
            </span>
            <IconArrowRight data-icon="inline-end" />
          </Button>
        ) : (
          <Button
            className="h-auto justify-end px-4 py-3 sm:text-right"
            variant="outline"
            render={<Link href="/admin/docs" />}
            nativeButton={false}
          >
            <span className="flex flex-col items-end gap-0.5">
              <span className="text-muted-foreground text-xs">Завершить</span>
              <span>Вернуться к обзору</span>
            </span>
            <IconArrowRight data-icon="inline-end" />
          </Button>
        )}
      </nav>
    </div>
  );
}
