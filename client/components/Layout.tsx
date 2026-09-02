import {
  ReactNode,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  LogOut,
  Package,
  User,
  Users,
  HardDrive,
  Palette,
  Contact,
  LifeBuoy,
  GitCommit,
  Gamepad2,
  Scale,
  ShieldCheck,
  KeyRound,
  Menu,
  X,
  ExternalLink,
  Download as DownloadIcon,
} from "lucide-react";
import styles from "./Layout.module.css";
import { SidebarMusicPlayer } from "./SidebarMusicPlayer";

interface LayoutProps {
  children: ReactNode;
  fullWidth?: boolean;
}

interface NavItemDef {
  key: string;
  labelKey: string;
  defaultLabel: string;
  href: string;
  icon: any;
  external?: boolean;
}

const NAV_ITEM_DEFINITIONS: NavItemDef[] = [
  {
    key: "apps",
    labelKey: "nav.apps",
    defaultLabel: "Apps",
    href: "/apps",
    icon: Package,
  },
  {
    key: "games",
    labelKey: "nav.games",
    defaultLabel: "Games",
    href: "/games",
    icon: Gamepad2,
  },
  {
    key: "storage",
    labelKey: "nav.storage",
    defaultLabel: "Storage",
    href: "/storage",
    icon: HardDrive,
  },
  {
    key: "account",
    labelKey: "nav.account",
    defaultLabel: "Account",
    href: "/account",
    icon: User,
  },
  {
    key: "security",
    labelKey: "nav.security",
    defaultLabel: "Security",
    href: "/security",
    icon: ShieldCheck,
  },
  {
    key: "integrations",
    labelKey: "nav.integrations",
    defaultLabel: "Integrations",
    href: "/integrations",
    icon: KeyRound,
  },
  {
    key: "friends",
    labelKey: "nav.friends",
    defaultLabel: "Friends",
    href: "/friends",
    icon: Users,
  },
  {
    key: "customize",
    labelKey: "nav.customize",
    defaultLabel: "Customize",
    href: "/customize",
    icon: Palette,
  },
  {
    key: "characters",
    labelKey: "nav.characters",
    defaultLabel: "Characters",
    href: "/characters",
    icon: Contact,
  },
  {
    key: "changelogs",
    labelKey: "nav.changelogs",
    defaultLabel: "Changelogs",
    href: "/changelogs",
    icon: GitCommit,
  },
  {
    key: "support",
    labelKey: "nav.support",
    defaultLabel: "Support",
    href: "/support",
    icon: LifeBuoy,
  },
  {
    key: "legal",
    labelKey: "nav.legal",
    defaultLabel: "Legal",
    href: "/legal",
    icon: Scale,
  },
];

/** Minimum horizontal swipe distance (px) to open sidebar on mobile */
const TOUCH_EDGE_ZONE = 30;
const SWIPE_THRESHOLD = 40;

const MOBILE_MENU_BUTTON_CLASSES =
  "p-2 -ml-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary md:hidden flex items-center justify-center shrink-0";

export const Layout = ({ children, fullWidth = false }: LayoutProps) => {
  const { session, signOut } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Touch handling for mobile edge-swipe and tap ──
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    if (x <= TOUCH_EDGE_ZONE) {
      touchStartX.current = x;
      touchStartY.current = y;
      touchStartTime.current = Date.now();
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

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (touchStartX.current !== null) {
      const touchDuration = Date.now() - touchStartTime.current;
      const changedTouch = e.changedTouches[0];
      if (changedTouch) {
        const dx = Math.abs(changedTouch.clientX - touchStartX.current);
        const dy =
          touchStartY.current !== null
            ? Math.abs(changedTouch.clientY - touchStartY.current)
            : 0;
        // Tap on the edge opens sidebar
        if (touchDuration < 500 && dx < 20 && dy < 20) {
          setSidebarOpen(true);
        }
      }
      touchStartX.current = null;
    }
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

  const navItems = useMemo(
    () =>
      NAV_ITEM_DEFINITIONS.map((item) => ({
        ...item,
        label: t(item.labelKey as any, undefined, item.defaultLabel),
      })),
    [t],
  );

  return (
    <div className={styles["layout-wrapper"]}>
      <div className={styles["background-gradient"]} />
      {/* Header */}
      <header
        className={`${styles["header"]} backdrop-blur-md sticky top-0 z-[60] h-[61px] sm:h-[73px] flex items-center`}
      >
        <div className="w-full px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {/* Mobile Hamburger Toggle Button */}
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label={
                sidebarOpen
                  ? t("nav.closeMenu", undefined, "Close menu")
                  : t("nav.openMenu", undefined, "Open menu")
              }
              aria-expanded={sidebarOpen}
              className={MOBILE_MENU_BUTTON_CLASSES}
            >
              {sidebarOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>

            <Link to="/apps" className="flex items-center gap-2 min-w-0">
              <span
                className={`${styles["logo"]} text-base sm:text-xl md:text-2xl font-bold truncate tracking-tight`}
              >
                Oxygen Low's Software
              </span>
            </Link>

            <a
              href="https://trello.com/b/OmFTZeVK/oxygen-lows-software-development"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex px-2.5 py-0.5 text-xs font-bold text-yellow-900 bg-yellow-400 hover:bg-yellow-300 transition-colors rounded-md uppercase tracking-wide cursor-pointer shrink-0"
            >
              {t("nav.beta", undefined, "Beta")}
            </a>

            <Link
              to="/download"
              className="hidden sm:flex items-center justify-center p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-white shrink-0"
              title={t("nav.downloadApp", undefined, "Download Desktop App")}
            >
              <DownloadIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </Link>

            <a
              href="https://discord.gg/tNczTe66jK"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center justify-center p-2 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] transition-colors text-white shrink-0"
              title={t("nav.discord", undefined, "Join our Discord")}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 127.14 96.36"
                fill="currentColor"
              >
                <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14c2.64-27.38-4.51-51.11-19.32-72.15ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.31,60,73.31,53s5-12.74,11.43-12.74S96.2,46,96.12,53,91.08,65.69,84.69,65.69Z" />
              </svg>
            </a>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {session ? (
              <>
                <span
                  className={`${styles["user-email"]} text-xs sm:text-sm hidden md:inline truncate max-w-[180px]`}
                >
                  {session.user.email}
                </span>
                <button
                  onClick={handleSignOut}
                  className={`${styles["sign-out-button"]} flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border transition duration-200 text-xs sm:text-sm font-medium`}
                  title={t("nav.signOut", undefined, "Sign Out")}
                >
                  <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">
                    {t("nav.signOut", undefined, "Sign Out")}
                  </span>
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className={`${styles["sign-out-button"]} flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border transition duration-200 text-xs sm:text-sm font-medium hover:bg-white/5`}
              >
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>{t("nav.signIn", undefined, "Sign In")}</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Click / hover trigger zone along left edge */}
      <div
        className={styles["sidebar-trigger"]}
        onMouseEnter={openSidebar}
        onMouseLeave={scheduleSidebarClose}
        onClick={openSidebar}
        role="button"
        tabIndex={0}
        aria-label={t("nav.openSidebar", undefined, "Open sidebar")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            openSidebar();
          }
        }}
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
          {/* Mobile User Banner */}
          <div className="md:hidden px-4 pt-3 pb-2 border-b border-border/50 bg-muted/30">
            {session ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-medium text-slate-300 truncate">
                    {session.user.email}
                  </span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center justify-center gap-2 w-full py-1.5 px-3 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/20 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />{" "}
                  {t("nav.signOut", undefined, "Sign Out")}
                </button>
              </div>
            ) : (
              <Link
                to="/auth"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors"
              >
                <User className="w-3.5 h-3.5" />{" "}
                {t("nav.signInRegister", undefined, "Sign In / Register")}
              </Link>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="p-3 sm:p-4 space-y-1 sm:space-y-2 flex-1 overflow-y-auto pt-2">
            {navItems.map((item) => {
              const Icon = item.icon;

              if (item.external) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setSidebarOpen(false)}
                    className={`${styles["nav-link"]} flex items-center gap-3 px-3.5 py-2.5 sm:py-3 rounded-lg font-medium text-sm`}
                  >
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400/80" />
                    {item.label}
                  </a>
                );
              }

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`${styles["nav-link"]} flex items-center gap-3 px-3.5 py-2.5 sm:py-3 rounded-lg font-medium text-sm`}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400/80" />
                  {item.label}
                </Link>
              );
            })}

            {/* Mobile Quick Action Links inside sidebar */}
            <div className="pt-3 mt-3 border-t border-border/50 md:hidden space-y-1.5">
              <Link
                to="/download"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                <DownloadIcon className="w-4 h-4 text-slate-400" />
                {t("nav.downloadApp", undefined, "Download Desktop App")}
              </Link>
              <a
                href="https://discord.gg/tNczTe66jK"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-medium text-[#7983f5] hover:bg-slate-800 transition-colors"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 127.14 96.36"
                  fill="currentColor"
                >
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14c2.64-27.38-4.51-51.11-19.32-72.15ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.31,60,73.31,53s5-12.74,11.43-12.74S96.2,46,96.12,53,91.08,65.69,84.69,65.69Z" />
                </svg>
                {t("nav.discord", undefined, "Join Discord Community")}
              </a>
              <a
                href="https://trello.com/b/OmFTZeVK/oxygen-lows-software-development"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-medium text-yellow-400 hover:bg-slate-800 transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-yellow-400" />
                {t("nav.roadmap", undefined, "Development Roadmap (Trello)")}
              </a>
            </div>
          </nav>

          <SidebarMusicPlayer />
        </aside>
      </div>

      {/* Subtle edge hint when sidebar is closed */}
      <div
        className={styles["sidebar-edge-hint"]}
        onClick={openSidebar}
        role="button"
        tabIndex={0}
        aria-label={t("nav.openSidebar", undefined, "Open sidebar")}
        title={t("nav.openSidebar", undefined, "Open sidebar")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            openSidebar();
          }
        }}
      />

      {/* Content Area */}
      <main
        className={
          fullWidth
            ? "w-full h-[calc(100vh-61px)] sm:h-[calc(100vh-73px)]"
            : "mx-auto w-full max-w-5xl px-3 sm:px-6 lg:px-8 py-6 sm:py-12"
        }
      >
        {children}
      </main>
    </div>
  );
};

export default Layout;
