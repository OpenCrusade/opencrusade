import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useGmFix, useTrackerEdit } from "@/stores/tracker-edit";
import { useOnline } from "@/hooks/useOnline";
import { useAppStore } from "@/stores/app-store";
import { pushUnsavedRosters } from "@/lib/sync/roster-ops";
import { keepStorage } from "@/lib/device";
import { Header } from "./Header";
import { Footer } from "./Footer";

export function AppShell() {
  // A force the GM unlocked to correct locks again once they leave its pages.
  const { pathname } = useLocation();
  useEffect(() => {
    const fixing = useGmFix.getState().rosterId;
    if (fixing && !pathname.startsWith(`/rosters/${fixing}`)) {
      useGmFix.getState().set(null);
      useTrackerEdit.getState().close();
    }
  }, [pathname]);
  // Anything edited but not yet in a campaign's sheet is retried when
  // the app opens, when the connection returns, and when Google access
  // is renewed, not only when a campaign page happens to be open.
  const online = useOnline();
  const token = useAppStore((s) => s.session?.accessToken);
  useEffect(() => {
    if (online && token) void pushUnsavedRosters();
  }, [online, token]);
  useEffect(() => keepStorage(), []);

  return (
    <div className="min-h-screen grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto]">
      <Header />
      <main className="relative">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
