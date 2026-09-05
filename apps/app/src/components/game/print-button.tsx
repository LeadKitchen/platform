"use client";

import { Button } from "@acme/ui";
import { IconPrinter } from "@tabler/icons-react";

/** Triggers the browser's print dialog — "Save as PDF" is a print destination. */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="no-print">
      <IconPrinter data-icon="inline-start" />
      Печать / Сохранить как PDF
    </Button>
  );
}
