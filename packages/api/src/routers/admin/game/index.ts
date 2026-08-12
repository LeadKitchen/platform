import { analytics } from "./analytics";
import { adminGameCatalogRouter } from "./catalog";
import { detail as dialogDetail, dialogs } from "./dialogs";
import { adminGameSessionsRouter } from "./sessions";
import { adminGameSystemRouter } from "./system";
import { adminGameVariantsRouter } from "./variants";

export const adminGameRouter = {
  analytics,
  catalog: adminGameCatalogRouter,
  dialogs,
  dialogDetail,
  sessions: adminGameSessionsRouter,
  system: adminGameSystemRouter,
  variants: adminGameVariantsRouter,
};
