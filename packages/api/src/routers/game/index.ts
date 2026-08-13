import { gameCatalogRouter } from "./catalog";
import { gameDialogRouter } from "./dialog";
import { gameOrderRouter } from "./order";
import { gameSessionRouter } from "./session";

export const gameRouter = {
  activity: gameActivityRouter,
  catalog: gameCatalogRouter,
  session: gameSessionRouter,
  order: gameOrderRouter,
  dialog: gameDialogRouter,
};

import { gameActivityRouter } from "./activity";
