import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@acme/ui";
import { IconArrowRight, IconBook2 } from "@tabler/icons-react";
import Link from "next/link";
import {
  ADMIN_DOC_CATEGORY_COPY,
  ADMIN_DOC_SECTIONS,
} from "~/content/admin-docs";

export function AdminDocsOverview() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="flex max-w-3xl flex-col gap-2">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <IconBook2 className="size-4" />
          База знаний
        </div>
        <h1 className="text-3xl font-medium tracking-[-0.035em] sm:text-4xl">
          {ADMIN_DOC_CATEGORY_COPY.title}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed sm:text-base">
          {ADMIN_DOC_CATEGORY_COPY.description}
        </p>
      </div>

      <div className="grid overflow-hidden rounded-xl border sm:grid-cols-3">
        <div className="border-b p-4 sm:border-r sm:border-b-0">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Разделов
          </p>
          <p className="mt-1 text-2xl font-medium tabular-nums">
            {ADMIN_DOC_SECTIONS.length}
          </p>
        </div>
        <div className="border-b p-4 sm:border-r sm:border-b-0">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Формат
          </p>
          <p className="mt-1 text-sm font-medium">Практические руководства</p>
        </div>
        <div className="p-4">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Доступ
          </p>
          <p className="mt-1 text-sm font-medium">Для администраторов</p>
        </div>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="sections-title">
        <div className="flex max-w-3xl flex-col gap-2">
          <h2 id="sections-title" className="text-xl font-medium">
            Разделы
          </h2>
          <p className="text-muted-foreground">
            Откройте раздел, чтобы разобраться, как устроена соответствующая
            часть продукта.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ADMIN_DOC_SECTIONS.map((section) => {
            const SectionIcon = section.icon;

            return (
              <Card
                key={section.slug}
                className="group flex h-full flex-col gap-0 overflow-hidden py-0 shadow-none transition-colors hover:border-foreground/20"
              >
                <CardHeader className="border-b py-5 [.border-b]:pb-5">
                  <div className="bg-muted text-foreground flex size-10 items-center justify-center rounded-lg">
                    <SectionIcon />
                  </div>
                  <CardTitle>
                    <h3>{section.title}</h3>
                  </CardTitle>
                  <CardDescription>{section.eyebrow}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4 py-5">
                  <p className="text-sm leading-relaxed">{section.summary}</p>
                </CardContent>
                <CardFooter className="pb-5">
                  <Button
                    className="w-full"
                    variant="outline"
                    render={<Link href={`/admin/docs/${section.slug}`} />}
                    nativeButton={false}
                  >
                    Читать
                    <IconArrowRight data-icon="inline-end" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
