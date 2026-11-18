import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Routes,
  Route,
  Navigate,
  MemoryRouter,
  BrowserRouter,
  useLocation,
  useParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import LoginForm from "./components/LoginForm";
import Dashboard from "./components/Dashboard";
import PlayerView from "./components/PlayerView";
import api from "./utils/api";
import storage from "./utils/storage";
import WelcomeModal from "./components/WelcomeModal";
import LogsModal from "./components/LogsModal";
import SettingsModal from "./components/SettingsModal";
import ConfirmLogoutModal from "./components/ConfirmLogoutModal";
import PlayerBar from "./components/PlayerBar";
import ReadingView from "./components/ReadingView";
import { AudioProvider } from "./contexts/AudioContext";

const useMemoryRouter =
  import.meta.env.VITE_REACT_APP_USE_MEMORY_ROUTER === "true";
const Router = useMemoryRouter ? MemoryRouter : BrowserRouter;

// Page changes fade in with a slight rise; switching one book between the
// player and Read along is a plain crossfade (two modes of the same book).
function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const lastPathRef = useRef(location.pathname);
  const animation = useMemo(() => {
    const mode = /^\/(player|read)\/([^/]+)$/;
    const from = lastPathRef.current.match(mode);
    const to = location.pathname.match(mode);
    const sameBookOtherMode = !!from && !!to && from[2] === to[2] && from[1] !== to[1];
    return sameBookOtherMode ? "animate-fade-in" : "animate-page-in";
  }, [location.pathname]);
  useEffect(() => {
    lastPathRef.current = location.pathname;
  }, [location.pathname]);
  return (
    <div key={location.pathname} className={`flex-1 min-h-0 flex flex-col ${animation}`}>
      {children}
    </div>
  );
}

function BookToPlayer() {
  const { bookId } = useParams();
  const location = useLocation();
  return <Navigate to={`/player/${bookId}`} replace state={location.state} />;
}

function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const location = useLocation();
  const isPlayerView = location.pathname.startsWith('/player/');

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0A0A0A] text-white select-none">
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative flex flex-col">
        {children}
      </main>
      {/* One footer for both modes, so switching never moves its tools; listen mode
          (the full player) shows only the tools, as the page has its own transport. */}
      <PlayerBar variant={isPlayerView ? 'tools' : 'full'} />
    </div>
  );
}

function App() {
  const { t } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [triggerLogout, setTriggerLogout] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // macOS: room for the window buttons in the top-left corner and a draggable top
  // strip, except in full screen (see .mac-titlebar in index.css).
  useEffect(() => {
    const win = window.electronWindow;
    if (!win || !navigator.userAgent.includes('Mac')) return;
    const apply = (fullScreen: boolean) => document.documentElement.classList.toggle('mac-titlebar', !fullScreen);
    apply(false);
    win.isFullScreen().then(apply).catch(() => undefined);
    return win.onFullScreenChange(apply);
  }, []);

  useEffect(() => {
    checkAuthStatus();

    // Listen for logout event from tray
    if (window.trayControls?.onLogout) {
      window.trayControls.onLogout(() => {
        setTriggerLogout(true);
      });
    }

    // Global keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Alt+D -> Logs modal
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setShowLogsModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (triggerLogout) {
      setShowConfirmModal(true);
      setTriggerLogout(false);
    }
  }, [triggerLogout]);

  useEffect(() => {
    const handleUnauthorized = async () => {
      await storage.remove("token");
      setIsAuthenticated(false);
      setSessionExpired(true);
      if (window.trayControls?.updateAuthState) {
        window.trayControls.updateAuthState(false);
      }
    };
    window.addEventListener("unauthorized", handleUnauthorized);
    return () => window.removeEventListener("unauthorized", handleUnauthorized);
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await storage.get("token");
      if (!token) {
        setIsAuthenticated(false);
        setIsLoading(false);
        if (window.trayControls?.updateAuthState) {
          window.trayControls.updateAuthState(false);
        }
        return;
      }

      const response = await api.get("/auth/status");
      const authenticated = response.data.authenticated;
      setIsAuthenticated(authenticated);
      if (window.trayControls?.updateAuthState) {
        window.trayControls.updateAuthState(authenticated);
      }
    } catch (error) {
      setIsAuthenticated(false);
      await storage.remove("token");
      if (window.trayControls?.updateAuthState) {
        window.trayControls.updateAuthState(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const checkFirstTime = async () => {
      if (isAuthenticated && !isLoading) {
        const hasSeenWelcome = await storage.get("hasSeenWelcome");
        if (!hasSeenWelcome || hasSeenWelcome === "false") {
          setShowWelcomeModal(true);
        }
      }
    };
    checkFirstTime();
  }, [isAuthenticated, isLoading]);

  const handleLogin = () => {
    setIsAuthenticated(true);
    setSessionExpired(false);
    if (window.trayControls?.updateAuthState) {
      window.trayControls.updateAuthState(true);
    }
  };

  const handleWelcomeClose = async () => {
    await storage.set("hasSeenWelcome", "true");
    setShowWelcomeModal(false);
  };

  const handleLogout = async () => {
    try {
      await api.post("/logout");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      await storage.remove("token");
      setIsAuthenticated(false);
      setShowConfirmModal(false);
      setShowSettingsModal(false);
      if (window.trayControls?.updateAuthState) {
        window.trayControls.updateAuthState(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-sm font-medium text-gray-400">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <>
    <div className="titlebar-drag" aria-hidden="true" />
    <Router>
      <AudioProvider>
        {isAuthenticated ? (
          <AuthenticatedLayout>
            <PageTransition>
            <Routes>
              <Route
                path="/"
                element={
                  <Dashboard
                    onLogout={handleLogout}
                    onOpenSettings={() => setShowSettingsModal(true)}
                    triggerLogout={triggerLogout}
                    setTriggerLogout={setTriggerLogout}
                  />
                }
              />
              <Route path="/player/:bookId" element={<PlayerView />} />
              {/* No separate book page: old links (search) open the full player. */}
              <Route path="/book/:bookId" element={<BookToPlayer />} />
              <Route path="/read/:bookId" element={<ReadingView />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </PageTransition>

            {/* Modals */}
            <SettingsModal
              isOpen={showSettingsModal}
              onClose={() => setShowSettingsModal(false)}
              onLogout={() => {
                setShowSettingsModal(false);
                setShowConfirmModal(true);
              }}
            />
            <ConfirmLogoutModal
              isOpen={showConfirmModal}
              onConfirm={handleLogout}
              onCancel={() => setShowConfirmModal(false)}
            />
            <WelcomeModal
              isOpen={showWelcomeModal}
              onClose={handleWelcomeClose}
            />
            <LogsModal
              isOpen={showLogsModal}
              onClose={() => setShowLogsModal(false)}
            />
          </AuthenticatedLayout>
        ) : (
          <div className="min-h-screen bg-[#0A0A0A]">
            <Routes>
              <Route
                path="/login"
                element={
                  <LoginForm onLogin={handleLogin} sessionExpired={sessionExpired} />
                }
              />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </div>
        )}
      </AudioProvider>
    </Router>
    </>
  );
}

export default App;
