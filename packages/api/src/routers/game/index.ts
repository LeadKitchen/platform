import { gameCatalogRouter } from "./catalog";
import { gameDialogRouter } from "./dialog";
import { gameOrderRouter } from "./order";
import { gameSessionRouter } from "./session";
import { gameTrainingRouter } from "./training";

export const gameRouter = {
  activity: gameActivityRouter,
  catalog: gameCatalogRouter,
  session: gameSessionRouter,
  order: gameOrderRouter,
  dialog: gameDialogRouter,
  training: gameTrainingRouter,
};

import { gameActivityRouter } from "./activity";
