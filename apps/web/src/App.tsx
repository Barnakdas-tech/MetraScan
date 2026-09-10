import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AppLayout from "./layouts/AppLayout";
import RequireAuth from "./components/RequireAuth";
import RequireRole from "./components/RequireRole";
import DashboardPage from "./pages/app/DashboardPage";
import NewInspectionPage from "./pages/app/NewInspectionPage";
import InspectionDetailPage from "./pages/app/InspectionDetailPage";
import ScanPage from "./pages/app/ScanPage";
import InspectionsPage from "./pages/app/InspectionsPage";
import InspectionHistoryDetailPage from "./pages/app/InspectionHistoryDetailPage";
import ProductsPage from "./pages/app/ProductsPage";
import ProductDetailPage from "./pages/app/ProductDetailPage";
import ViolationsPage from "./pages/app/ViolationsPage";
import ViolationDetailPage from "./pages/app/ViolationDetailPage";
import ReportsPage from "./pages/app/ReportsPage";
import ReportDetailPage from "./pages/app/ReportDetailPage";
import RulesPage from "./pages/app/RulesPage";
import RuleDetailPage from "./pages/app/RuleDetailPage";
import AnalyticsPage from "./pages/app/AnalyticsPage";
import RepositoryPage from "./pages/app/RepositoryPage";
import SettingsPage from "./pages/app/SettingsPage";
import AppRedirect from "./pages/AppRedirect";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="inspection/new" element={<RequireRole roles={["ADMIN", "INSPECTOR"]}><NewInspectionPage /></RequireRole>} />
        <Route path="inspection/:inspectionId" element={<InspectionDetailPage />} />
        <Route path="scan" element={<RequireRole roles={["ADMIN", "INSPECTOR"]}><ScanPage /></RequireRole>} />
        <Route path="inspections" element={<InspectionsPage />} />
        <Route path="inspections/:inspectionId" element={<InspectionHistoryDetailPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:productId" element={<ProductDetailPage />} />
        <Route path="violations" element={<ViolationsPage />} />
        <Route path="violations/:violationId" element={<ViolationDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports/:reportId" element={<ReportDetailPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="rules/:ruleId" element={<RuleDetailPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="repository" element={<RepositoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
