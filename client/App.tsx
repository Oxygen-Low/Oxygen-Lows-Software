import "./global.css";

import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { MusicProvider } from "@/contexts/MusicContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Suspense, lazy, ComponentType } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", () => {
    const key = "vite_preload_auto_reload";
    const last = window.sessionStorage.getItem(key);
    const now = Date.now();
    if (!last || now - parseInt(last, 10) > 10000) {
      window.sessionStorage.setItem(key, now.toString());
      window.location.reload();
    }
  });
}

const lazyWithRetry = (
  componentImport: () => Promise<{ default: ComponentType<any> }>,
) =>
  lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      const key = "lazy_retry_reload";
      const last = window.sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - parseInt(last, 10) > 10000) {
        window.sessionStorage.setItem(key, now.toString());
        window.location.reload();
        // Return a pending promise to halt rendering while reloading
        return new Promise<{ default: ComponentType<any> }>(() => {});
      }
      throw error;
    }
  });

// Notification UIs are progressively enhanced — keep their dependency trees
// (sonner / radix toast) out of the initial JS bundle.
const Toaster = lazyWithRetry(
  () => import("@/components/ui/toaster").then((m) => ({ default: m.Toaster })),
);
const SonnerToaster = lazyWithRetry(
  () => import("@/components/ui/sonner").then((m) => ({ default: m.Toaster })),
);

// Warm the landing route in parallel with the entry chunk instead of waiting
// for React to render before starting its request.
void import("./pages/Apps");

/** Shell skeleton shown while the route module is still loading. */
const AppShellSkeleton = () => (
  <div className="min-h-screen bg-background" aria-busy="true">
    <div className="h-[61px] sm:h-[73px] border-b border-border/40 bg-muted/10" />
    <div className="mx-auto w-full max-w-5xl px-3 sm:px-6 lg:px-8 py-6 sm:py-12">
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-muted/40" />
      <div className="mb-8 h-4 w-72 animate-pulse rounded bg-muted/30" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border border-border/30 bg-muted/20"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    </div>
  </div>
);

const Auth = lazyWithRetry(() => import("./pages/Auth"));
const Apps = lazyWithRetry(() => import("./pages/Apps"));
const Games = lazyWithRetry(() => import("./pages/Games"));
const Friends = lazyWithRetry(() => import("./pages/Friends"));
const Chat = lazyWithRetry(() => import("./pages/Chat"));
const Account = lazyWithRetry(() => import("./pages/Account"));
const Security = lazyWithRetry(() => import("./pages/Security"));
const Storage = lazyWithRetry(() => import("./pages/Storage"));
const Customize = lazyWithRetry(() => import("./pages/Customize"));
const Characters = lazyWithRetry(() => import("./pages/Characters"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const UserProfile = lazyWithRetry(() => import("./pages/UserProfile"));
const Support = lazyWithRetry(() => import("./pages/Support"));
const SupportTicket = lazyWithRetry(() => import("./pages/SupportTicket"));
const ContentTest = lazyWithRetry(() => import("./pages/ContentTest"));
const AdminSupport = lazyWithRetry(() => import("./pages/AdminSupport"));
const AdminTicket = lazyWithRetry(() => import("./pages/AdminTicket"));
const AdminVerification = lazyWithRetry(
  () => import("./pages/AdminVerification"),
);
const AdminSurveys = lazyWithRetry(() => import("./pages/AdminSurveys"));
const AdminPanel = lazyWithRetry(() => import("./pages/AdminPanel"));
const Notifications = lazyWithRetry(() => import("./pages/Notifications"));
const AdminNotifications = lazyWithRetry(
  () => import("./pages/AdminNotifications"),
);
const AdminBannedIps = lazyWithRetry(() => import("./pages/AdminBannedIps"));
const BannedIps = lazyWithRetry(() => import("./pages/BannedIps"));
const Privacy = lazyWithRetry(() => import("./pages/Privacy"));
const Terms = lazyWithRetry(() => import("./pages/Terms"));
const Eula = lazyWithRetry(() => import("./pages/Eula"));
const Dmca = lazyWithRetry(() => import("./pages/Dmca"));
const AcceptableUse = lazyWithRetry(() => import("./pages/AcceptableUse"));
const Legal = lazyWithRetry(() => import("./pages/Legal"));
const License = lazyWithRetry(() => import("./pages/License"));
const Download = lazyWithRetry(() => import("./pages/Download"));
const OAuthAuthorize = lazyWithRetry(() => import("./pages/OAuthAuthorize"));
const PollinationsOAuthCallback = lazyWithRetry(
  () => import("./pages/PollinationsOAuthCallback"),
);
const AgentsPortal = lazyWithRetry(() => import("./pages/AgentsPortal"));
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LanguageProvider>
        <ThemeProvider>
          <BrowserRouter>
            <MusicProvider>
              <Suspense fallback={null}>
                <Toaster />
                <SonnerToaster />
              </Suspense>
              <ErrorBoundary>
                <Suspense fallback={<AppShellSkeleton />}>
                    <Routes>
                      <Route path="/" element={<Apps />} />
                      <Route path="/apps" element={<Apps />} />
                      <Route path="/apps/:appId" element={<Apps />} />
                      <Route path="/apps/3d-background" element={<Apps />} />
                      <Route path="/agents" element={<AgentsPortal />} />
                      <Route path="/agents/*" element={<AgentsPortal />} />
                      <Route path="/chat" element={<Chat />} />
                      <Route path="/oauth/authorize" element={<OAuthAuthorize />} />
                      <Route
                        path="/oauth/pollinations/callback"
                        element={<PollinationsOAuthCallback />}
                      />
                    <Route path="/banned-ips" element={<BannedIps />} />
                    <Route path="/webdefender/banned-ips" element={<BannedIps />} />
                    <Route path="/games" element={<Games />} />
                    <Route path="/games/:appId" element={<Games />} />
                    <Route
                      path="/storage"
                      element={
                        <ProtectedRoute>
                          <Storage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/friends"
                      element={
                        <ProtectedRoute>
                          <Friends />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/account"
                      element={
                        <ProtectedRoute>
                          <Account />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/security"
                      element={
                        <ProtectedRoute>
                          <Security />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/customize"
                      element={
                        <ProtectedRoute>
                          <Customize />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/characters"
                      element={
                        <ProtectedRoute>
                          <Characters />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/users/oxygen-low"
                      element={<Navigate to="/users/oxygenlow" replace />}
                    />
                    <Route
                      path="/users/:username"
                      element={
                        <ProtectedRoute>
                          <UserProfile />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/eula" element={<Eula />} />
                    <Route path="/dmca" element={<Dmca />} />
                    <Route path="/acceptable-use" element={<AcceptableUse />} />
                    <Route path="/legal" element={<Legal />} />
                    <Route path="/license" element={<License />} />
                    <Route
                      path="/support"
                      element={
                        <ProtectedRoute>
                          <Support />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/support/:id"
                      element={
                        <ProtectedRoute>
                          <SupportTicket />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/contenttest"
                      element={
                        <ProtectedRoute>
                          <ContentTest />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin"
                      element={
                        <ProtectedRoute>
                          <AdminPanel />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/verification"
                      element={
                        <ProtectedRoute>
                          <AdminVerification />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/support"
                      element={
                        <ProtectedRoute>
                          <AdminSupport />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/support/:id"
                      element={
                        <ProtectedRoute>
                          <AdminTicket />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/surveys"
                      element={
                        <ProtectedRoute>
                          <AdminSurveys />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/notifications"
                      element={
                        <ProtectedRoute>
                          <AdminNotifications />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/banned-ips"
                      element={<ProtectedRoute><AdminBannedIps /></ProtectedRoute>}
                    />
                    <Route
                      path="/admin/webdefender/banned-ips"
                      element={<ProtectedRoute><AdminBannedIps /></ProtectedRoute>}
                    />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/download" element={<Download />} />
                    <Route
                      path="/surveys"
                      element={<Navigate to="/apps/surveys" replace />}
                    />
                    <Route
                      path="/webdefender"
                      element={<Navigate to="/apps/webdefender" replace />}
                    />
                    <Route
                      path="/defender"
                      element={<Navigate to="/apps/webdefender" replace />}
                    />
                    <Route
                      path="/apps/defender"
                      element={<Navigate to="/apps/webdefender" replace />}
                    />
                    <Route
                      path="/passwords"
                      element={<Navigate to="/apps/password-manager" replace />}
                    />
                    <Route
                      path="/password-manager"
                      element={<Navigate to="/apps/password-manager" replace />}
                    />
                    <Route
                      path="/datasets"
                      element={<Navigate to="/apps/datasets" replace />}
                    />
                    <Route
                      path="/simplecookies"
                      element={<Navigate to="/apps/simplecookies" replace />}
                    />
                    <Route
                      path="/cookies"
                      element={<Navigate to="/apps/simplecookies" replace />}
                    />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </MusicProvider>
          </BrowserRouter>
        </ThemeProvider>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
