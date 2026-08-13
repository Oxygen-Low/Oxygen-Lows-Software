import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { MusicProvider } from "@/contexts/MusicContext";
import { Suspense, lazy } from "react";
const Auth = lazy(() => import("./pages/Auth"));
const Apps = lazy(() => import("./pages/Apps"));
const Friends = lazy(() => import("./pages/Friends"));
const Account = lazy(() => import("./pages/Account"));
const Storage = lazy(() => import("./pages/Storage"));
const Customize = lazy(() => import("./pages/Customize"));
const Characters = lazy(() => import("./pages/Characters"));
const Changelogs = lazy(() => import("./pages/Changelogs"));
const NotFound = lazy(() => import("./pages/NotFound"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const OauthConsent = lazy(() => import("./pages/OauthConsent"));
const Support = lazy(() => import("./pages/Support"));
const SupportTicket = lazy(() => import("./pages/SupportTicket"));
const AdminSupport = lazy(() => import("./pages/AdminSupport"));
const AdminTicket = lazy(() => import("./pages/AdminTicket"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
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
