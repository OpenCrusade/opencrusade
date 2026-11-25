import { lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter, Outlet, ScrollRestoration } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { HomePage } from "@/pages/HomePage";
import { ErrorPage, NotFoundPage } from "@/pages/ErrorPage";

/**
 * Each page loads when it is first visited, so the first screen isn't
 * held up by code for pages the visitor may never open.
 */
function page<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
) {
  const Page = lazy<ComponentType>(async () => ({ default: (await load())[name] }));
  return (
    <Suspense fallback={<p className="page py-8 text-mute">Loading…</p>}>
      <Page />
    </Suspense>
  );
}

const legal = (section: "about" | "privacy" | "terms") => {
  const Legal = lazy(async () => {
    const { LegalPage } = await import("@/pages/LegalPage");
    return { default: () => <LegalPage section={section} /> };
  });
  return (
    <Suspense fallback={<p className="page py-8 text-mute">Loading…</p>}>
      <Legal />
    </Suspense>
  );
};

export const router = createBrowserRouter(
  [
    {
      // Without ScrollRestoration the browser keeps the old scroll
      // position, so a page opened from far down a list (a unit from
      // its roster, say) opened part-way down. Now a new page opens at
      // the top, and Back returns to where you were.
      element: (
        <>
          <ScrollRestoration />
          <Outlet />
        </>
      ),
      errorElement: <ErrorPage />,
      children: [
        { path: "/", element: <HomePage /> },
        { path: "/faq", element: page(() => import("@/pages/FaqPage"), "FaqPage") },
        { path: "/tracker-sets/new", element: page(() => import("@/pages/TrackerSetBuilderPage"), "TrackerSetBuilderPage") },
        { path: "/about", element: legal("about") },
        { path: "/privacy", element: legal("privacy") },
        { path: "/terms", element: legal("terms") },
        {
          element: <AppShell />,
          children: [
            { path: "/crusades", element: page(() => import("@/pages/DashboardPage"), "DashboardPage") },
            { path: "/crusades/:crusadeId", element: page(() => import("@/pages/CrusadePage"), "CrusadePage") },
            { path: "/crusades/:crusadeId/rules", element: page(() => import("@/pages/HouseRulesPage"), "HouseRulesPage") },
            { path: "/crusades/:crusadeId/table", element: page(() => import("@/pages/TablePage"), "TablePage") },
            { path: "/crusades/:crusadeId/battles", element: page(() => import("@/pages/BattlesPage"), "BattlesPage") },
            { path: "/crusades/:crusadeId/battles/:battleId", element: page(() => import("@/pages/BattlePage"), "BattlePage") },
            { path: "/rosters", element: page(() => import("@/pages/RosterLibraryPage"), "RosterLibraryPage") },
            { path: "/rosters/:rosterId", element: page(() => import("@/pages/RosterPage"), "RosterPage") },
            { path: "/rosters/:rosterId/units/:unitId", element: page(() => import("@/pages/UnitDetailPage"), "UnitDetailPage") },
            { path: "*", element: <NotFoundPage /> },
          ],
        },
      ],
    },
  ],
  // The app may be served from a sub-path (VITE_BASE_PATH).
  { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" },
);
