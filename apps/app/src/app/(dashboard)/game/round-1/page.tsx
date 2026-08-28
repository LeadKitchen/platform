import { GameSectionHeader, RoundOneTraining } from "~/components/game";
import { SiteHeader } from "~/components/layout";

export default function RoundOnePage() {
  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: "Деловая игра", href: "/game" },
          { label: "Раунд 1" },
        ]}
      />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <GameSectionHeader
          eyebrow="Обучение"
          title="Путь ситуационного руководства"
          description="Пройдите четыре коротких шага и научитесь выбирать подход под готовность сотрудника к конкретной задаче."
        />
        <RoundOneTraining />
      </main>
    </>
  );
}
