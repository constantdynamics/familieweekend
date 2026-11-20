import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CAPTAIN_COOKIE, PROEF_COOKIE, PROEF_MAX_AGE_S, cookieBase, createProefToken, verifyProefToken } from "@/lib/server/tokens";

/** An invitation from the admin: this phone joins the test environment for a day. */
export async function GET(_request: Request, { params }: RouteContext<"/proef/[token]">) {
  const { token } = await params;
  if (!(await verifyProefToken(token, "uitnodiging"))) redirect("/?proef=verlopen");
  const store = await cookies();
  store.set(PROEF_COOKIE, await createProefToken("proef"), cookieBase(PROEF_MAX_AGE_S));
  store.delete(CAPTAIN_COOKIE);
  redirect("/");
}
