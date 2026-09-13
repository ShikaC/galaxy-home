import { createBrowserRouter } from "react-router"
import { AppShell } from "./components/AppShell.js"
import { RouteErrorPage } from "./components/RouteErrorPage.js"

function RouteLoading() {
  return <main className="page-loading">正在打开你的空间...</main>
}

export const router = createBrowserRouter([
  {
    path: "/design-system",
    errorElement: <RouteErrorPage />,
    lazy: async () => ({
      Component: (await import("./pages/DesignShowcasePage.js")).DesignShowcasePage,
    }),
  },
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    HydrateFallback: RouteLoading,
    children: [
      {
        path: "plans",
        lazy: async () => ({ Component: (await import("./pages/PlansPage.js")).PlansPage }),
      },
      {
        path: "calendar",
        lazy: async () => ({ Component: (await import("./pages/CalendarPage.js")).CalendarPage }),
      },
      {
        path: "task-plans",
        lazy: async () => ({
          Component: (await import("./pages/TaskPlanningPage.js")).TaskPlanningPage,
        }),
      },
      {
        index: true,
        lazy: async () => ({ Component: (await import("./pages/HomePage.js")).HomePage }),
      },
      {
        path: "notes",
        lazy: async () => ({ Component: (await import("./pages/NotesPage.js")).NotesPage }),
      },
      {
        path: "todos",
        lazy: async () => ({ Component: (await import("./pages/TodosPage.js")).TodosPage }),
      },
      {
        path: "projects",
        lazy: async () => ({ Component: (await import("./pages/ProjectsPage.js")).ProjectsPage }),
      },
      {
        path: "projects/:id",
        lazy: async () => ({
          Component: (await import("./pages/ProjectDetailPage.js")).ProjectDetailPage,
        }),
      },
      {
        path: "habits",
        lazy: async () => ({ Component: (await import("./pages/HabitsPage.js")).HabitsPage }),
      },
      {
        path: "review",
        lazy: async () => ({ Component: (await import("./pages/ReviewPage.js")).ReviewPage }),
      },
      {
        path: "settings",
        lazy: async () => ({ Component: (await import("./pages/SettingsPage.js")).SettingsPage }),
      },
    ],
  },
])
