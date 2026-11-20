import { Suspense } from "react";
import { TabBalk } from "@/components/ui/TabBalk";
import { getStaffSession } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";

/** The tabs share the fixed menu at the bottom. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <Menu />
      </Suspense>
    </>
  );
}

/**
 * The new menu once the owner releases it (settings.fase2_live). Before that
 * only the admin sees it, so the work in progress can be tried out.
 */
async function Menu() {
  const settings = await getSettings();
  if (settings.fase2Live) return <TabBalk variant="nieuw" />;
  return (
    <Suspense fallback={<TabBalk variant="oud" />}>
      <MenuVoorBeheerder />
    </Suspense>
  );
}

async function MenuVoorBeheerder() {
  const staff = await getStaffSession();
  return <TabBalk variant={staff?.role === "beheerder" ? "nieuw" : "oud"} />;
}
