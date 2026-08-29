import { orgCoachingPathsRouter } from "./coaching-paths";
import { mine } from "./mine";
import { orgPeopleRouter } from "./people";
import { orgScorecardsRouter } from "./scorecards";
import { orgSessionsRouter } from "./sessions";
import { orgTrainingRouter } from "./training";
import { orgWorkspaceRouter } from "./workspace";

export const orgRouter = {
  configure: orgConfigureRouter,
  mine,
  sessions: orgSessionsRouter,
  people: orgPeopleRouter,
  scorecards: orgScorecardsRouter,
  coachingPaths: orgCoachingPathsRouter,
  training: orgTrainingRouter,
  workspace: orgWorkspaceRouter,
};

import { orgConfigureRouter } from "./configure";
