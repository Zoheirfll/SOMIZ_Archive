import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { KeyboardShortcutsProvider } from "./context/KeyboardShortcutsContext";
import GlobalShortcuts from "./components/GlobalShortcuts";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Employees from "./pages/Employees";
import EmployeeDetail from "./pages/EmployeeDetail";
import EmployeeForm from "./pages/EmployeeForm";
import Dashboard from "./pages/Dashboard";
import Statistiques from "./pages/Statistiques";
import Users from "./pages/Users";
import UserPerimetre from "./pages/UserPerimetre";
import AuditLogs from "./pages/AuditLogs";
import Parametres from "./pages/Parametres";
import Import from "./pages/Import";
import Profil from "./pages/Profil";
import ContratDetail from "./pages/ContratDetail";
import Organigramme from "./pages/Organigramme";
import Consentement from "./pages/Consentement";

function App() {
  return (
    <AuthProvider>
      <KeyboardShortcutsProvider>
      <BrowserRouter>
        <GlobalShortcuts />
        <Routes>
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
          <Route path="*" element={<Navigate to="/login" replace />} />
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
      </BrowserRouter>
      </KeyboardShortcutsProvider>
    </AuthProvider>
  );
}

export default App;
