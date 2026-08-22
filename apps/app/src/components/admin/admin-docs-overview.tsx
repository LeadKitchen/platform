import {
  Badge,
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
    <div className="flex flex-1 flex-col gap-8 p-4 lg:p-6">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
        <CardContent className="flex flex-col items-start gap-5 px-6 py-8 lg:px-10">
          <Badge variant="secondary">
            <IconBook2 />
            Документация
          </Badge>
          <div className="flex max-w-3xl flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {ADMIN_DOC_CATEGORY_COPY.title}
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed sm:text-lg">
              {ADMIN_DOC_CATEGORY_COPY.description}
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4" aria-labelledby="sections-title">
        <div className="flex max-w-3xl flex-col gap-2">
          <h2 id="sections-title" className="text-2xl font-semibold">
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
                className="group flex h-full flex-col transition-colors hover:border-primary/40"
              >
                <CardHeader>
                  <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
                    <SectionIcon />
                  </div>
                  <CardTitle>
                    <h3>{section.title}</h3>
                  </CardTitle>
                  <CardDescription>{section.eyebrow}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <p className="text-sm leading-relaxed">{section.summary}</p>
                </CardContent>
                <CardFooter>
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
