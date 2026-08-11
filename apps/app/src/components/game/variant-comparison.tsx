import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@acme/ui";

export interface VariantStats {
  variantId: string;
  dialogs: number;
  avgScore: number;
  styleMatchRate: number;
  successRate: number;
  onTimeRate: number;
  criteriaCoverage: number;
  avgLatencyMs: number;
  avgCostUsd: number;
  totalCostUsd: number;
  avgTokens: number;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Сравнение подходов на живых играх.
 *
 * Здесь нет «правильного» ответа эксперта — это агрегат по реальным диалогам:
 * совпадение стиля, доля успешных заказов, покрытие критериев и во что каждый
 * подход обходится по задержке и деньгам.
 */
export function VariantComparison({ variants }: { variants: VariantStats[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Сравнение подходов ИИ</CardTitle>
        <CardDescription>
          Агрегат по завершённым диалогам. Для проверки на размеченных сценариях
          используйте офлайн-прогон: <code>bun eval</code>.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {variants.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Пока нет завершённых диалогов.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Вариант</TableHead>
                  <TableHead className="text-right">Диалогов</TableHead>
                  <TableHead className="text-right">Ср. оценка</TableHead>
                  <TableHead className="text-right">Стиль совпал</TableHead>
                  <TableHead className="text-right">Заказ успешен</TableHead>
                  <TableHead className="text-right">В срок</TableHead>
                  <TableHead className="text-right">Критерии</TableHead>
                  <TableHead className="text-right">Задержка</TableHead>
                  <TableHead className="text-right">Токены</TableHead>
                  <TableHead className="text-right">Стоимость</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((variant) => (
                  <TableRow key={variant.variantId}>
                    <TableCell className="font-medium">
                      {variant.variantId}
                    </TableCell>
                    <TableCell className="text-right">
                      {variant.dialogs}
                    </TableCell>
                    <TableCell className="text-right">
                      {variant.avgScore}%
                    </TableCell>
                    <TableCell className="text-right">
                      {percent(variant.styleMatchRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {percent(variant.successRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {percent(variant.onTimeRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {percent(variant.criteriaCoverage)}
                    </TableCell>
                    <TableCell className="text-right">
                      {variant.avgLatencyMs} мс
                    </TableCell>
                    <TableCell className="text-right">
                      {variant.avgTokens}
                    </TableCell>
                    <TableCell className="text-right">
                      ${variant.avgCostUsd.toFixed(4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
