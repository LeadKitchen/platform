import { paths } from "@acme/config";
import { redirect } from "next/navigation";
import { getSession } from "~/auth/server";

/**
 * The root URL has nothing of its own to show — the product is the game
 * module. Route straight to it (or to login) instead of a generic dashboard.
 */
export default async function Page() {
  const session = await getSession();
  redirect(session?.user ? "/game" : paths.auth.login);
}
