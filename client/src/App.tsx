import React, { useState, useEffect, useRef } from "react";
import {
  Routes,
  Route,
  Navigate,
  MemoryRouter,
  BrowserRouter,
  useLocation,
  useNavigate,
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
import SearchView from "./components/SearchView";
import ReadingView from "./components/ReadingView";
import { AudioProvider, readLocalPosition } from "./contexts/AudioContext";

/**
 * Where the developer was, so launch can reopen it: the last book page visited
 * (player or read-along view). Stored as JSON: { bookId: string, view: 'player' | 'read' }.
 */
const LAST_BOOK_VIEW_KEY = "lastBookView";

const parseStored = (raw: unknown): any => {
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
};

/** Same rule as the library's finished badge (BookCard). */
async function isLastBookFinished(session: any): Promise<boolean> {
  if (session?.book?.status === 3) return true;
  const durationSec = session?.book?.abook?.time ? session.book.abook.time / 1000000 : 0;
  const local = await readLocalPosition(session.consumableId || session.bookId);
  return durationSec > 0 && !!local && local.position / 1000 >= durationSec * 0.98;
}

const useMemoryRouter =
  import.meta.env.VITE_REACT_APP_USE_MEMORY_ROUTER === "true";
const Router = useMemoryRouter ? MemoryRouter : BrowserRouter;

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
  const navigate = useNavigate();
  const isPlayerView = location.pathname.startsWith('/player/');
  const isSearchPage = location.pathname === '/search';

  // Remember the last book page visited.
  useEffect(() => {
    const match = location.pathname.match(/^\/(player|read)\/([^/]+)$/);
    if (match) {
      storage.set(LAST_BOOK_VIEW_KEY, JSON.stringify({ view: match[1], bookId: match[2] })).catch(() => undefined);
    }
  }, [location.pathname]);

  // On launch: reopen the last played book, unless it is finished, in the view
  // it was left in (read along or player). Opening it never starts playback.
  const restoredRef = useRef(false);
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    (async () => {
      const session = parseStored(await storage.get("last_played_session"));
      if (!session?.bookId || (await isLastBookFinished(session))) return;
      const last = parseStored(await storage.get(LAST_BOOK_VIEW_KEY));
      const view = last?.bookId === String(session.bookId) && last.view === "read" ? "read" : "player";
      // Only if the developer hasn't navigated away from the library meanwhile.
      if (pathnameRef.current === "/") {
        navigate(`/${view}/${session.bookId}`, { state: { book: session.book } });
      }
    })().catch((err) => console.warn("Could not reopen the last book:", err));
  }, [navigate]);

  // Global Cmd+K / Ctrl+K shortcut: open the catalog search from any page.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!isSearchPage) navigate('/search');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchPage, navigate]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0A0A0A] text-white select-none">
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative flex flex-col">
        {children}
      </main>
      {!isPlayerView && <PlayerBar />}
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
              <Route path="/search" element={<SearchView />} />
              <Route path="/player/:bookId" element={<PlayerView />} />
              {/* No separate book page: old links (search) open the full player. */}
              <Route path="/book/:bookId" element={<BookToPlayer />} />
              <Route path="/read/:bookId" element={<ReadingView />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>

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
