import { Menu, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Notifications, Sidebar, Wordmark } from "@/components/xp/Sidebar";
import { cn } from "@/lib/utils";
import { useSocial } from "@/providers/SocialProvider";

export { Wordmark };

/** App frame: a persistent, expanded left side menu from tablet/desktop widths up, and a slide-in drawer on phones. */
export function AppShell() {
  // Device-level layout preference: kept across refreshes, not account data, so it stays out of STORAGE_KEYS.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem("xp.sidebar.collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [drawer, setDrawer] = useState<boolean>(false);
  const { unreadTotal } = useSocial();
  const location = useLocation();

  useEffect(() => {
    try {
      window.localStorage.setItem("xp.sidebar.collapsed", collapsed ? "1" : "0");
    } catch {
      // Storage may be unavailable (private mode); the expanded default still works.
    }
  }, [collapsed]);

  useEffect(() => {
    setDrawer(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden overflow-hidden border-r border-border/70 bg-[hsl(var(--sidebar-background))] transition-[width] duration-300 ease-out md:block",
          collapsed ? "w-[76px]" : "w-[288px] lg:w-[320px]",
        )}
        aria-label="Side menu"
      >
        <div key={collapsed ? "rail" : "menu"} className="sidebar-fade h-full">
          <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-[60px] items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur-md md:hidden">
        <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" className="relative grid size-11 place-items-center rounded-xl hover:bg-muted">
          <Menu className="size-5" />
          {unreadTotal > 0 ? <span className="absolute right-2 top-2 size-2 rounded-full bg-primary ring-2 ring-background" /> : null}
        </button>
        <Wordmark className="text-[24px]" />
        <div className="ml-auto flex items-center gap-1">
          <Notifications />
          <Link to="/" aria-label="New trip chat" className="press grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Plus className="size-5" />
          </Link>
        </div>
      </header>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-[90vw] max-w-[340px] border-r border-border/70 bg-[hsl(var(--sidebar-background))] p-0 sm:max-w-[340px] [&>button]:hidden">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Sidebar onNavigate={() => setDrawer(false)} />
        </SheetContent>
      </Sheet>

      <main className={cn("min-w-0 transition-[padding] duration-300 ease-out", collapsed ? "md:pl-[76px]" : "md:pl-[288px] lg:pl-[320px]")}>
        <Outlet />
      </main>
    </div>
  );
}
