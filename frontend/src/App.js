import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { KeyboardShortcutsProvider } from "./context/KeyboardShortcutsContext";
import GlobalShortcuts from "./components/GlobalShortcuts";
import ProtectedRoute from "./components/ProtectedRoute";
import RouteFallback from "./components/RouteFallback";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// Chargées à la demande (par route) plutôt qu'au premier accès — le
// bundle unique dépassait 400 kB gzip (react-pdf, Chart.js et une
// vingtaine de pages tous chargés d'un coup dès /login). Login et
// NotFound restent en import direct : ce sont les toutes premières pages
// vues, pas de bénéfice à les découper.
const Employees = lazy(() => import("./pages/Employees"));
const EmployeeDetail = lazy(() => import("./pages/EmployeeDetail"));
const EmployeeForm = lazy(() => import("./pages/EmployeeForm"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Statistiques = lazy(() => import("./pages/Statistiques"));
const Users = lazy(() => import("./pages/Users"));
const UserPerimetre = lazy(() => import("./pages/UserPerimetre"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const Parametres = lazy(() => import("./pages/Parametres"));
const Import = lazy(() => import("./pages/Import"));
const Profil = lazy(() => import("./pages/Profil"));
const ContratDetail = lazy(() => import("./pages/ContratDetail"));
const Organigramme = lazy(() => import("./pages/Organigramme"));
const Consentement = lazy(() => import("./pages/Consentement"));
const RechercheDocuments = lazy(() => import("./pages/RechercheDocuments"));

// Route racine "/" — jamais un vrai écran, juste un aiguillage vers la
// connexion ou l'accueil selon l'état de session.
const RootRedirect = () => {
  const { authenticated, authChecked } = useAuth();
  if (!authChecked) return null;
  return <Navigate to={authenticated ? "/employees" : "/login"} replace />;
};

function App() {
  return (
    <AuthProvider>
      <KeyboardShortcutsProvider>
      <BrowserRouter>
        <GlobalShortcuts />
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/consentement"
            element={
              <ProtectedRoute>
                <Consentement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees"
            element={
              <ProtectedRoute>
                <Employees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/nouveau"
            element={
              <ProtectedRoute adminOnly>
                <EmployeeForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:id"
            element={
              <ProtectedRoute>
                <EmployeeDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:id/modifier"
            element={
              <ProtectedRoute adminOnly>
                <EmployeeForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organigramme"
            element={
              <ProtectedRoute>
                <Organigramme />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute adminOnly>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/statistiques"
            element={
              <ProtectedRoute adminOnly>
                <Statistiques />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recherche-documents"
            element={
              <ProtectedRoute adminOnly>
                <RechercheDocuments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute adminOnly>
                <Users />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users/:id/perimetre"
            element={
              <ProtectedRoute adminOnly>
                <UserPerimetre />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute adminOnly>
                <AuditLogs />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
          <Route
            path="/parametres"
            element={
              <ProtectedRoute adminOnly>
                <Parametres />
              </ProtectedRoute>
            }
          />
          <Route
            path="/import"
            element={
              <ProtectedRoute adminOnly>
                <Import />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profil"
            element={
              <ProtectedRoute>
                <Profil />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contrats/:id"
            element={
              <ProtectedRoute>
                <ContratDetail />
              </ProtectedRoute>
            }
          />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </KeyboardShortcutsProvider>
    </AuthProvider>
  );
}

export default App;
