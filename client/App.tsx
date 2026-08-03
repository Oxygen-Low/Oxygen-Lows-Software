import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { MusicProvider } from "@/contexts/MusicContext";
import Auth from "./pages/Auth";
import Apps from "./pages/Apps";
import Friends from "./pages/Friends";
import Account from "./pages/Account";
import Storage from "./pages/Storage";
import Customize from "./pages/Customize";
import Characters from "./pages/Characters";
import NotFound from "./pages/NotFound";
import UserProfile from "./pages/UserProfile";
import OauthConsent from "./pages/OauthConsent";
import Support from "./pages/Support";
import SupportTicket from "./pages/SupportTicket";
import AdminSupport from "./pages/AdminSupport";
import AdminTicket from "./pages/AdminTicket";
import AdminPanel from "./pages/AdminPanel";
import AuthCallback from "./pages/AuthCallback";
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
            <Routes>
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Apps />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/apps"
                element={
                  <ProtectedRoute>
                    <Apps />
                  </ProtectedRoute>
                }
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
          </MusicProvider>
        </BrowserRouter>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
