import { orgCoachingPathsRouter } from "./coaching-paths";
import { orgMembersRouter } from "./members";
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
  members: orgMembersRouter,
  scorecards: orgScorecardsRouter,
  coachingPaths: orgCoachingPathsRouter,
  training: orgTrainingRouter,
  workspace: orgWorkspaceRouter,
};

import { orgConfigureRouter } from "./configure";
