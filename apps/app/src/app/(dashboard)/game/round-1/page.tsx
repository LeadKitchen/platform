import { RoundOneTraining } from "~/components/game";
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
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <RoundOneTraining />
      </div>
    </>
  );
}
