import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth } from "~/auth/RequireAuth";
import { RequireAdvisor } from "~/auth/RequireAdvisor";
import { RequireImpersonation } from "~/auth/RequireImpersonation";
import { ClientLayout } from "~/app/ClientLayout";
import { LoginPage } from "~/pages/Login";
import { DashboardPage } from "~/pages/Dashboard";
import { AuthCallbackPage } from "~/pages/AuthCallback";
import { MobileLayout } from "~/app/MobileLayout";

// Reused reused-pages/(client) pages — run verbatim via the router adapters + @/ → repo
// root alias. Each is a default export.
import ClientDashboardPage from "@/frontend/src/reused-pages/(client)/dashboard/page";
import BudgetPage from "@/frontend/src/reused-pages/(client)/budget/page";
import BalancePage from "@/frontend/src/reused-pages/(client)/balance/page";
import FilesPage from "@/frontend/src/reused-pages/(client)/files/page";
import InvestmentsPage from "@/frontend/src/reused-pages/(client)/investments/page";
import DebtPage from "@/frontend/src/reused-pages/(client)/debt/page";
import GoalsPage from "@/frontend/src/reused-pages/(client)/goals/page";
import PlanPage from "@/frontend/src/reused-pages/(client)/plan/page";
import InsurancePage from "@/frontend/src/reused-pages/(client)/insurance/page";
import OnboardingPage from "@/frontend/src/reused-pages/(client)/onboarding/page";
import ToolsPage from "@/frontend/src/reused-pages/(client)/tools/page";
import RoadmapPage from "@/frontend/src/reused-pages/(client)/roadmap/page";
import DepositsPage from "@/frontend/src/reused-pages/(client)/deposits/page";
import EquityPage from "@/frontend/src/reused-pages/(client)/equity/page";
import RetirementPage from "@/frontend/src/reused-pages/(client)/retirement/page";
import RealestatePage from "@/frontend/src/reused-pages/(client)/realestate/page";
import ReportPage from "@/frontend/src/reused-pages/(client)/report/page";
import PensionPage from "@/frontend/src/reused-pages/(client)/pension/page";
import SettingsPage from "@/frontend/src/reused-pages/(client)/settings/page";
import SettingsSubscriptionsPage from "@/frontend/src/reused-pages/(client)/settings/subscriptions/page";
import SettingsHiddenMerchantsPage from "@/frontend/src/reused-pages/(client)/settings/hidden-merchants/page";
import AdminCitiesPage from "@/frontend/src/reused-pages/(client)/admin/cities/page";

// CRM routes
import CrmPage from "@/frontend/src/reused-pages/crm/page";
import CrmSettingsPage from "@/frontend/src/reused-pages/crm/settings/page";
import CrmParsersPage from "@/frontend/src/reused-pages/crm/settings/parsers/page";
import CrmPensionParsersPage from "@/frontend/src/reused-pages/crm/settings/pension-parsers/page";
import CrmSubscriptionsPage from "@/frontend/src/reused-pages/crm/settings/subscriptions/page";
import CrmCitiesPage from "@/frontend/src/reused-pages/crm/settings/cities/page";
import CrmHiddenMerchantsPage from "@/frontend/src/reused-pages/crm/settings/hidden-merchants/page";
import CrmMappingsPage from "@/frontend/src/reused-pages/crm/settings/mappings/page";

// Mobile routes
import MobileDashboardPage from "@/frontend/src/reused-pages/m/page";
import MobileBalancePage from "@/frontend/src/reused-pages/m/balance/page";
import MobileBudgetPage from "@/frontend/src/reused-pages/m/budget/page";
import MobileGoalsPage from "@/frontend/src/reused-pages/m/goals/page";

// Public routes
import PrivacyPage from "@/frontend/src/reused-pages/privacy/page";
import TermsPage from "@/frontend/src/reused-pages/terms/page";
import ForgotPasswordPage from "@/frontend/src/reused-pages/login/forgot-password/page";
import ResetPasswordPage from "@/frontend/src/reused-pages/login/reset-password/page";
import ClearStoragePage from "@/frontend/src/reused-pages/clear-storage/page";
import { FamilyWorkbookPage } from "~/pages/FamilyWorkbook";

/**
 * Top-level route table. Replaces the Next.js file-based app/ routing.
 * - Public routes render bare.
 * - The /crm advisor dashboard is a Lovable-rebuilt page.
 * - The (client) area reuses the original pages under ClientLayout.
 */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/login/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/login/reset-password" element={<ResetPasswordPage />} />
      <Route path="/clear-storage" element={<ClearStoragePage />} />

      <Route path="/crm">
        <Route index element={<RequireAdvisor><CrmPage /></RequireAdvisor>} />
        <Route path="settings" element={<RequireAdvisor><CrmSettingsPage /></RequireAdvisor>} />
        <Route path="settings/parsers" element={<RequireAdvisor><CrmParsersPage /></RequireAdvisor>} />
        <Route path="settings/pension-parsers" element={<RequireAdvisor><CrmPensionParsersPage /></RequireAdvisor>} />
        <Route path="settings/subscriptions" element={<RequireAdvisor><CrmSubscriptionsPage /></RequireAdvisor>} />
        <Route path="settings/cities" element={<RequireAdvisor><CrmCitiesPage /></RequireAdvisor>} />
        <Route path="settings/hidden-merchants" element={<RequireAdvisor><CrmHiddenMerchantsPage /></RequireAdvisor>} />
        <Route path="settings/mappings" element={<RequireAdvisor><CrmMappingsPage /></RequireAdvisor>} />
      </Route>

      <Route path="/m" element={<RequireAuth><MobileLayout /></RequireAuth>}>
        <Route index element={<MobileDashboardPage />} />
        <Route path="balance" element={<MobileBalancePage />} />
        <Route path="budget" element={<MobileBudgetPage />} />
        <Route path="goals" element={<MobileGoalsPage />} />
      </Route>

      {/* Client area — reused pages under the original shell. */}
      <Route
        element={
          <RequireAuth>
            <ClientLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<ClientDashboardPage />} />
        <Route path="/budget" element={<BudgetPage />} />
        <Route path="/balance" element={<BalancePage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/investments" element={<InvestmentsPage />} />
        <Route path="/debt" element={<DebtPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/plan" element={<RequireImpersonation><PlanPage /></RequireImpersonation>} />
        <Route path="/family-workbook" element={<FamilyWorkbookPage />} />
        <Route path="/insurance" element={<InsurancePage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/deposits" element={<DepositsPage />} />
        <Route path="/equity" element={<EquityPage />} />
        <Route path="/retirement" element={<RetirementPage />} />
        <Route path="/realestate" element={<RealestatePage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/pension" element={<PensionPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/subscriptions" element={<SettingsSubscriptionsPage />} />
        <Route path="/settings/hidden-merchants" element={<SettingsHiddenMerchantsPage />} />
        <Route path="/admin/cities" element={<AdminCitiesPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
