import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth } from "~/auth/RequireAuth";
import { RequireAdvisor } from "~/auth/RequireAdvisor";
import { RequireImpersonation } from "~/auth/RequireImpersonation";
import { ClientLayout } from "~/app/ClientLayout";
import { LoginPage } from "~/pages/Login";
import { DashboardPage } from "~/pages/Dashboard";
import { AuthCallbackPage } from "~/pages/AuthCallback";
import { MobileLayout } from "~/app/MobileLayout";

// Reused app/(client) pages — run verbatim via the next/* shims + @/ → repo
// root alias. Each is a default export.
import ClientDashboardPage from "@/app/(client)/dashboard/page";
import BudgetPage from "@/app/(client)/budget/page";
import BalancePage from "@/app/(client)/balance/page";
import FilesPage from "@/app/(client)/files/page";
import InvestmentsPage from "@/app/(client)/investments/page";
import DebtPage from "@/app/(client)/debt/page";
import GoalsPage from "@/app/(client)/goals/page";
import PlanPage from "@/app/(client)/plan/page";
import InsurancePage from "@/app/(client)/insurance/page";
import OnboardingPage from "@/app/(client)/onboarding/page";
import ToolsPage from "@/app/(client)/tools/page";
import RoadmapPage from "@/app/(client)/roadmap/page";
import DepositsPage from "@/app/(client)/deposits/page";
import EquityPage from "@/app/(client)/equity/page";
import RetirementPage from "@/app/(client)/retirement/page";
import RealestatePage from "@/app/(client)/realestate/page";
import ReportPage from "@/app/(client)/report/page";
import PensionPage from "@/app/(client)/pension/page";
import SettingsPage from "@/app/(client)/settings/page";
import SettingsSubscriptionsPage from "@/app/(client)/settings/subscriptions/page";
import SettingsHiddenMerchantsPage from "@/app/(client)/settings/hidden-merchants/page";
import AdminCitiesPage from "@/app/(client)/admin/cities/page";

// CRM routes
import CrmPage from "@/app/crm/page";
import CrmSettingsPage from "@/app/crm/settings/page";
import CrmParsersPage from "@/app/crm/settings/parsers/page";
import CrmPensionParsersPage from "@/app/crm/settings/pension-parsers/page";
import CrmSubscriptionsPage from "@/app/crm/settings/subscriptions/page";
import CrmCitiesPage from "@/app/crm/settings/cities/page";
import CrmHiddenMerchantsPage from "@/app/crm/settings/hidden-merchants/page";
import CrmMappingsPage from "@/app/crm/settings/mappings/page";

// Mobile routes
import MobileDashboardPage from "@/app/m/page";
import MobileBalancePage from "@/app/m/balance/page";
import MobileBudgetPage from "@/app/m/budget/page";
import MobileGoalsPage from "@/app/m/goals/page";

// Public routes
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import ForgotPasswordPage from "@/app/login/forgot-password/page";
import ResetPasswordPage from "@/app/login/reset-password/page";
import ClearStoragePage from "@/app/clear-storage/page";

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
