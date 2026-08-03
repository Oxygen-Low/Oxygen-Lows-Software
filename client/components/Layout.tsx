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
  LifeBuoy,
  ShieldAlert,
} from "lucide-react";
import styles from "./Layout.module.css";
import { SidebarMusicPlayer } from "./SidebarMusicPlayer";

interface LayoutProps {
  children: ReactNode;
  fullWidth?: boolean;
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
  { label: "Support", href: "/support", icon: LifeBuoy },
];

/** Minimum horizontal swipe distance (px) to open sidebar on mobile */
const TOUCH_EDGE_ZONE = 30;
const SWIPE_THRESHOLD = 40;

export const Layout = ({ children, fullWidth = false }: LayoutProps) => {
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
        className={`${styles["header"]} backdrop-blur-sm sticky top-0 z-[60]`}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className={`${styles["logo"]} text-2xl font-bold`}>
              Oxygen Low's Software
            </h1>
            <a
              href="https://discord.gg/tNczTe66jK"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center p-2 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] transition-colors text-white"
              title="Join our Discord"
            >
              <svg width="20" height="20" viewBox="0 0 127.14 96.36" fill="currentColor">
                <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14c2.64-27.38-4.51-51.11-19.32-72.15ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.31,60,73.31,53s5-12.74,11.43-12.74S96.2,46,96.12,53,91.08,65.69,84.69,65.69Z" />
              </svg>
            </a>
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
      <div 
        className={styles["sidebar-trigger"]} 
        onMouseEnter={openSidebar} 
        onMouseLeave={scheduleSidebarClose}
      />

      {/* Sidebar overlay container */}
      <div
        className={`${styles["sidebar-container"]}${sidebarOpen ? ` ${styles["open"]}` : ""}`}
      >
        {/* Backdrop – click to close */}
        <div
          className={styles["sidebar-backdrop"]}
          onClick={() => setSidebarOpen(false)}
        />

        {/* Sidebar panel */}
        <aside 
          className={styles["sidebar"]}
          onMouseEnter={openSidebar}
          onMouseLeave={scheduleSidebarClose}
        >
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

      {/* Content Area */}
      <main className={fullWidth ? "w-full h-[calc(100vh-73px)]" : "mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-12"}>
        {children}
      </main>
    </div>
  );
};

export default Layout;
