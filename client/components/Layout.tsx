import { ReactNode, useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LogOut,
  Package,
  User,
  Users,
  HardDrive,
  Palette,
  Contact,
} from "lucide-react";
import styles from "./Layout.module.css";
import { SidebarMusicPlayer } from "./SidebarMusicPlayer";

interface LayoutProps {
  children: ReactNode;
}

/**
 * ⚡ Bolt Performance Optimization:
 * Moved static array outside of the component to prevent recreating it on every render.
 */
const navItems = [
  { label: "Apps", href: "/apps", icon: Package },
  { label: "Storage", href: "/storage", icon: HardDrive },
  { label: "Account", href: "/account", icon: User },
  { label: "Friends", href: "/friends", icon: Users },
  { label: "Customize", href: "/customize", icon: Palette },
  { label: "Characters", href: "/characters", icon: Contact },
];

/** Minimum horizontal swipe distance (px) to open sidebar on mobile */
const TOUCH_EDGE_ZONE = 30;
const SWIPE_THRESHOLD = 40;

export const Layout = ({ children }: LayoutProps) => {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Touch handling for mobile edge-swipe ──
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const x = e.touches[0].clientX;
    if (x <= TOUCH_EDGE_ZONE) {
      touchStartX.current = x;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (dx > SWIPE_THRESHOLD) {
      setSidebarOpen(true);
      touchStartX.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchStartX.current = null;
  }, []);

  useEffect(() => {
    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // ── Desktop hover trigger ──
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openSidebar = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setSidebarOpen(true);
  }, []);

  const scheduleSidebarClose = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setSidebarOpen(false);
    }, 300);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/auth");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  return (
    <div className={styles["layout-wrapper"]}>
      <div className={styles["background-gradient"]} />
      {/* Header */}
      <header
        className={`${styles["header"]} backdrop-blur-sm sticky top-0 z-10`}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className={`${styles["logo"]} text-2xl font-bold`}>
              Oxygen Low's Software
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className={`${styles["user-email"]} text-sm`}>
              {session?.user?.email}
            </span>
            <button
              onClick={handleSignOut}
              className={`${styles["sign-out-button"]} flex items-center gap-2 px-4 py-2 rounded-lg border transition duration-200 text-sm font-medium`}
            >
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Invisible hover trigger zone along left edge */}
      <div className={styles["sidebar-trigger"]} onMouseEnter={openSidebar} />

      {/* Sidebar overlay container */}
      <div
        className={`${styles["sidebar-container"]}${sidebarOpen ? ` ${styles["open"]}` : ""}`}
        onMouseEnter={openSidebar}
        onMouseLeave={scheduleSidebarClose}
      >
        {/* Backdrop – click to close */}
        <div
          className={styles["sidebar-backdrop"]}
          onClick={() => setSidebarOpen(false)}
        />

        {/* Sidebar panel */}
        <aside className={styles["sidebar"]}>
          <nav className="p-4 space-y-2 flex-1 overflow-y-auto pt-2">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`${styles["nav-link"]} flex items-center gap-3 px-4 py-3 rounded-lg font-medium`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <SidebarMusicPlayer />
        </aside>
      </div>

      {/* Subtle edge hint when sidebar is closed */}
      <div className={styles["sidebar-edge-hint"]} />

      {/* Content Area – now full width, centered */}
      <main className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
        {children}
      </main>
    </div>
  );
};

export default Layout;
