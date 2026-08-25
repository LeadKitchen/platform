import { analytics } from "./analytics";
import {
  applyConfiguration,
  draftConfiguration,
  rejectConfiguration,
} from "./assistant";
import { adminGameBenchmarksRouter } from "./benchmarks";
import { adminGameCatalogRouter } from "./catalog";
import { adminGameCharactersRouter } from "./characters";
import { adminGameComparisonsRouter } from "./comparisons";
import { detail as dialogDetail, dialogs } from "./dialogs";
import { analyze as analyzeInsights } from "./insights";
import { productAnalytics } from "./product-analytics";
import { adminGameReviewsRouter } from "./reviews";
import { adminGameSessionsRouter } from "./sessions";
import { adminGameSystemRouter } from "./system";
import { adminGameVariantsRouter } from "./variants";
import { adminGameVersionsRouter } from "./versions";

export const adminGameRouter = {
  analytics,
  benchmarks: adminGameBenchmarksRouter,
  productAnalytics,
  insights: { analyze: analyzeInsights },
  assistant: {
    draftConfiguration,
    applyConfiguration,
    rejectConfiguration,
  },
  catalog: adminGameCatalogRouter,
  characters: adminGameCharactersRouter,
  comparisons: adminGameComparisonsRouter,
  dialogs,
  dialogDetail,
  reviews: adminGameReviewsRouter,
  sessions: adminGameSessionsRouter,
  system: adminGameSystemRouter,
  variants: adminGameVariantsRouter,
  versions: adminGameVersionsRouter,
};
