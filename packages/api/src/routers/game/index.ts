import { gameCatalogRouter } from "./catalog";
import { gameDialogRouter } from "./dialog";
import { gameOrderRouter } from "./order";
import { gameRoleplayRouter } from "./roleplay";
import { gameSessionRouter } from "./session";
import { gameTrainingRouter } from "./training";

export const gameRouter = {
  activity: gameActivityRouter,
  catalog: gameCatalogRouter,
  session: gameSessionRouter,
  order: gameOrderRouter,
  dialog: gameDialogRouter,
  roleplay: gameRoleplayRouter,
  training: gameTrainingRouter,
};

import { gameActivityRouter } from "./activity";
