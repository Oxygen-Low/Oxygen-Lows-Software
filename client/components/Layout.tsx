import { ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, Package, User, Users, HardDrive, Palette, Contact } from "lucide-react";
import styles from "./Layout.module.css";
import { useTranslation } from "react-i18next";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { t } = useTranslation();
  const { session, signOut } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { label: t('nav.apps'), href: "/apps", icon: Package },
    { label: t('nav.storage'), href: "/storage", icon: HardDrive },
    { label: t('nav.account'), href: "/account", icon: User },
    { label: t('nav.friends'), href: "/friends", icon: Users },
    { label: t('nav.customize'), href: "/customize", icon: Palette },
    { label: t('nav.characters'), href: "/characters", icon: Contact },
  ];

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
            {t('auth.title')}
          </h1>
          <div className="flex items-center gap-4">
            <span className={`${styles["user-email"]} text-sm`}>{session?.user?.email}</span>
            <button
              onClick={handleSignOut}
              className={`${styles["sign-out-button"]} flex items-center gap-2 px-4 py-2 rounded-lg border transition duration-200 text-sm font-medium`}
            >
              <LogOut className="w-4 h-4" />
              {t('auth.signin') === "Sign In" ? "Sign Out" : t('auth.signin') === "Войти" ? "Выйти" : t('auth.signin') === "サインイン" ? "サインアウト" : t('auth.signin') === "로그인" ? "로그아웃" : t('auth.signin') === "登录" ? "退出登录" : t('auth.signin') === "登入" ? "登出" : t('auth.signin') === "Inire" ? "Exire" : "Sign Out"}
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
