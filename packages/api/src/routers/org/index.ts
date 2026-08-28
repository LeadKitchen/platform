import { mine } from "./mine";
import { orgPeopleRouter } from "./people";
import { orgSessionsRouter } from "./sessions";
import { orgTrainingRouter } from "./training";
import { orgWorkspaceRouter } from "./workspace";

export const orgRouter = {
  mine,
  sessions: orgSessionsRouter,
  people: orgPeopleRouter,
  training: orgTrainingRouter,
  workspace: orgWorkspaceRouter,
};
