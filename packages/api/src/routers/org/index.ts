import { mine } from "./mine";
import { orgSessionsRouter } from "./sessions";

export const orgRouter = {
  mine,
  sessions: orgSessionsRouter,
};
