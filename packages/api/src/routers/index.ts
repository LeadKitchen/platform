/**
 * Root Router
 *
 * The single entry-point for the entire oRPC API.
 * Add new domain routers here and they become available everywhere
 * (Next.js handler, RSC clients, type-safe hooks, etc.).
 *
 * Current route map:
 *
 *   user.*          – current user profile & account settings  (protected)
 *   post.list       – paginated list of posts                  (public)
 *   post.byId       – single post by UUID                      (public)
 *   post.create     – create a post                            (protected)
 *   post.delete     – delete a post                            (admin)
 *   admin.users.*   – user management                          (admin)
 *   admin.stats.*   – system-wide statistics                   (admin)
 *
 *   game.catalog.*  – reference data & methodology dictionary  (protected)
 *   game.session.*  – game sessions (round 2 / 3)              (protected)
 *   game.order.*    – order queue & assignment                 (protected)
 *   game.dialog.*   – role-play dialog + автооценка            (protected)
 *   admin.game.*    – dialogs, experiment arms, A/B analytics  (admin)
 */

import { adminRouter } from "./admin";
import { gameRouter } from "./game";
import { postRouter } from "./post";
import { userRouter } from "./user";

export const appRouter = {
  user: userRouter,
  post: postRouter,
  admin: adminRouter,
  game: gameRouter,
};

export type AppRouter = typeof appRouter;
