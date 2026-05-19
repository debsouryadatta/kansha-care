import "leaflet/dist/leaflet.css";
import "./styles/index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@kansha/ui";
import { AuthProvider, useAuth } from "./lib/auth";
import { GlobalErrorToasts } from "./components/GlobalErrorToasts";
import { LandingPage } from "./pages/LandingPage";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AdminPage } from "./pages/AdminPage";

function Protected({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading workspace...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <GlobalErrorToasts />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route
            path="/dashboard"
            element={
              <Protected>
                <DashboardPage />
              </Protected>
            }
          />
          <Route
            path="/admin"
            element={
              <Protected admin>
                <AdminPage />
              </Protected>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    <Toaster />
  </React.StrictMode>
);
