import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { MusicProvider } from "@/contexts/MusicContext";
import { Suspense, lazy, ComponentType } from "react";

const lazyWithRetry = (componentImport: () => Promise<{ default: ComponentType<any> }>) =>
  lazy(async () => {
    try {
      const component = await componentImport();
      window.sessionStorage.removeItem("retry-lazy-refreshed");
      return component;
    } catch (error) {
      if (!window.sessionStorage.getItem("retry-lazy-refreshed")) {
        window.sessionStorage.setItem("retry-lazy-refreshed", "true");
        window.location.reload();
        // Return a pending promise to halt rendering while reloading
        return new Promise<{ default: ComponentType<any> }>(() => {});
      }
      throw error;
    }
  });

const Auth = lazyWithRetry(() => import("./pages/Auth"));
const Apps = lazyWithRetry(() => import("./pages/Apps"));
const Friends = lazyWithRetry(() => import("./pages/Friends"));
const Account = lazyWithRetry(() => import("./pages/Account"));
const Storage = lazyWithRetry(() => import("./pages/Storage"));
const Customize = lazyWithRetry(() => import("./pages/Customize"));
const Characters = lazyWithRetry(() => import("./pages/Characters"));
const Changelogs = lazyWithRetry(() => import("./pages/Changelogs"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const UserProfile = lazyWithRetry(() => import("./pages/UserProfile"));
const OauthConsent = lazyWithRetry(() => import("./pages/OauthConsent"));
const Support = lazyWithRetry(() => import("./pages/Support"));
const SupportTicket = lazyWithRetry(() => import("./pages/SupportTicket"));
const AdminSupport = lazyWithRetry(() => import("./pages/AdminSupport"));
const AdminTicket = lazyWithRetry(() => import("./pages/AdminTicket"));
const AdminPanel = lazyWithRetry(() => import("./pages/AdminPanel"));
const AuthCallback = lazyWithRetry(() => import("./pages/AuthCallback"));
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider>
        <BrowserRouter>
          <MusicProvider>
            <Toaster />
            <Sonner />
            <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
              <Routes>
                <Route
                  path="/"
                  element={<Apps />}
                />
                <Route
                  path="/apps"
                  element={<Apps />}
                />
                <Route
                  path="/apps/:appId"
                  element={<Apps />}
                />
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
                  path="/changelogs"
                  element={
                    <ProtectedRoute>
                      <Changelogs />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/users/:username"
                  element={
                    <ProtectedRoute>
                      <UserProfile />
                    </ProtectedRoute>
                  }
                />
                <Route path="/oauth/consent" element={<OauthConsent />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
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
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <AdminPanel />
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
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </MusicProvider>
        </BrowserRouter>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
