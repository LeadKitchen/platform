import { analytics } from "./analytics";
import {
  applyConfiguration,
  draftConfiguration,
  rejectConfiguration,
} from "./assistant";
import { adminGameCatalogRouter } from "./catalog";
import { detail as dialogDetail, dialogs } from "./dialogs";
import { analyze as analyzeInsights } from "./insights";
import { productAnalytics } from "./product-analytics";
import { adminGameSessionsRouter } from "./sessions";
import { adminGameSystemRouter } from "./system";
import { adminGameVariantsRouter } from "./variants";
import { adminGameVersionsRouter } from "./versions";

export const adminGameRouter = {
  analytics,
  productAnalytics,
  insights: { analyze: analyzeInsights },
  assistant: {
    draftConfiguration,
    applyConfiguration,
    rejectConfiguration,
  },
  catalog: adminGameCatalogRouter,
  dialogs,
  dialogDetail,
  sessions: adminGameSessionsRouter,
  system: adminGameSystemRouter,
  variants: adminGameVariantsRouter,
  versions: adminGameVersionsRouter,
};
