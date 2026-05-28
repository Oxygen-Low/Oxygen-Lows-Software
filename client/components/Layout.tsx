import { ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, Package, Zap, Settings, User, HardDrive, Palette } from "lucide-react";
import styles from "./Layout.module.css";

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: "Apps", href: "/apps", icon: Package },
  { label: "Storage", href: "/storage", icon: HardDrive },
  { label: "Server Integrations", href: "/integrations", icon: Zap },
  { label: "Server Settings", href: "/settings", icon: Settings },
  { label: "Account", href: "/account", icon: User },
  { label: "Customize", href: "/customize", icon: Palette },
];

export const Layout = ({ children }: LayoutProps) => {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();

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
      <header className={`${styles["header"]} backdrop-blur-sm sticky top-0 z-10`}>
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <h1 className={`${styles["logo"]} text-2xl font-bold`}>
            Oxygen Low's Software
          </h1>
          <div className="flex items-center gap-4">
            <span className={`${styles["user-email"]} text-sm`}>{session?.user?.email}</span>
            <button
              onClick={handleSignOut}
              className={`${styles["sign-out-button"]} flex items-center gap-2 px-4 py-2 rounded-lg border transition duration-200 text-sm font-medium`}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex">
        {/* Sidebar */}
        <aside className={`${styles["sidebar"]} w-64 border-r min-h-[calc(100vh-73px)]`}>
          <nav className="p-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`${styles["nav-link"]} flex items-center gap-3 px-4 py-3 rounded-lg font-medium`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-12">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
