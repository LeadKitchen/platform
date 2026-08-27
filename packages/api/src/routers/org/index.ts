import { mine } from "./mine";
import { orgPeopleRouter } from "./people";
import { orgSessionsRouter } from "./sessions";

export const orgRouter = {
  mine,
  sessions: orgSessionsRouter,
  people: orgPeopleRouter,
};
