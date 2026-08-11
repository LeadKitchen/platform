import { gameCatalogRouter } from "./catalog";
import { gameDialogRouter } from "./dialog";
import { gameOrderRouter } from "./order";
import { gameSessionRouter } from "./session";

export const gameRouter = {
  catalog: gameCatalogRouter,
  session: gameSessionRouter,
  order: gameOrderRouter,
  dialog: gameDialogRouter,
};
