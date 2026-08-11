import { analytics } from "./analytics";
import { dialogs } from "./dialogs";
import { adminGameVariantsRouter } from "./variants";

export const adminGameRouter = {
  analytics,
  dialogs,
  variants: adminGameVariantsRouter,
};
