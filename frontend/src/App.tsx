import { lazy, Suspense, type ComponentType } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth } from "~/auth/RequireAuth";
import { RequireAdvisor } from "~/auth/RequireAdvisor";
import { RequireImpersonation } from "~/auth/RequireImpersonation";
import { AppBootScreen } from "~/components/ui/AppBootScreen";
import { RouteMetadata } from "~/app/RouteMetadata";

const lazyNamed = <T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K
) => lazy(async () => ({ default: (await loader())[name] as ComponentType }));

const LoginPage = lazyNamed(() => import("~/pages/Login"), "LoginPage");
const AuthCallbackPage = lazyNamed(() => import("~/pages/AuthCallback"), "AuthCallbackPage");
const FamilyWorkbookPage = lazyNamed(() => import("~/pages/FamilyWorkbook"), "FamilyWorkbookPage");
const ClientLayout = lazyNamed(() => import("~/app/ClientLayout"), "ClientLayout");
const MobileLayout = lazyNamed(() => import("~/app/MobileLayout"), "MobileLayout");
const NotFoundPage = lazy(() => import("~/pages/NotFound"));

// Every screen is a route-level chunk. Shared layout/auth code stays eager so
// route transitions retain the existing shell and authorization guarantees.
const ClientDashboardPage = lazy(
  () => import("@/frontend/src/reused-pages/(client)/dashboard/page")
);
const BudgetPage = lazy(() => import("@/frontend/src/reused-pages/(client)/budget/page"));
const BalancePage = lazy(() => import("@/frontend/src/reused-pages/(client)/balance/page"));
const FilesPage = lazy(() => import("@/frontend/src/reused-pages/(client)/files/page"));
const InvestmentsPage = lazy(() => import("@/frontend/src/reused-pages/(client)/investments/page"));
const DebtPage = lazy(() => import("@/frontend/src/reused-pages/(client)/debt/page"));
const GoalsPage = lazy(() => import("@/frontend/src/reused-pages/(client)/goals/page"));
const PlanPage = lazy(() => import("@/frontend/src/reused-pages/(client)/plan/page"));
const InsurancePage = lazy(() => import("@/frontend/src/reused-pages/(client)/insurance/page"));
const OnboardingPage = lazy(() => import("@/frontend/src/reused-pages/(client)/onboarding/page"));
const ToolsPage = lazy(() => import("@/frontend/src/reused-pages/(client)/tools/page"));
const RoadmapPage = lazy(() => import("@/frontend/src/reused-pages/(client)/roadmap/page"));
const DepositsPage = lazy(() => import("@/frontend/src/reused-pages/(client)/deposits/page"));
const EquityPage = lazy(() => import("@/frontend/src/reused-pages/(client)/equity/page"));
const RetirementPage = lazy(() => import("@/frontend/src/reused-pages/(client)/retirement/page"));
const RealestatePage = lazy(() => import("@/frontend/src/reused-pages/(client)/realestate/page"));
const ReportPage = lazy(() => import("@/frontend/src/reused-pages/(client)/report/page"));
const PensionPage = lazy(() => import("@/frontend/src/reused-pages/(client)/pension/page"));
const SettingsPage = lazy(() => import("@/frontend/src/reused-pages/(client)/settings/page"));
const SettingsSubscriptionsPage = lazy(
  () => import("@/frontend/src/reused-pages/(client)/settings/subscriptions/page")
);
const SettingsHiddenMerchantsPage = lazy(
  () => import("@/frontend/src/reused-pages/(client)/settings/hidden-merchants/page")
);
const AdminCitiesPage = lazy(
  () => import("@/frontend/src/reused-pages/(client)/admin/cities/page")
);

// CRM routes
const CrmPage = lazy(() => import("@/frontend/src/reused-pages/crm/page"));
const CrmSettingsPage = lazy(() => import("@/frontend/src/reused-pages/crm/settings/page"));
const CrmParsersPage = lazy(() => import("@/frontend/src/reused-pages/crm/settings/parsers/page"));
const CrmPensionParsersPage = lazy(
  () => import("@/frontend/src/reused-pages/crm/settings/pension-parsers/page")
);
const CrmSubscriptionsPage = lazy(
  () => import("@/frontend/src/reused-pages/crm/settings/subscriptions/page")
);
const CrmCitiesPage = lazy(() => import("@/frontend/src/reused-pages/crm/settings/cities/page"));
const CrmHiddenMerchantsPage = lazy(
  () => import("@/frontend/src/reused-pages/crm/settings/hidden-merchants/page")
);
const CrmMappingsPage = lazy(
  () => import("@/frontend/src/reused-pages/crm/settings/mappings/page")
);

// Mobile routes
const MobileDashboardPage = lazy(() => import("@/frontend/src/reused-pages/m/page"));
const MobileBalancePage = lazy(() => import("@/frontend/src/reused-pages/m/balance/page"));
const MobileBudgetPage = lazy(() => import("@/frontend/src/reused-pages/m/budget/page"));
const MobileGoalsPage = lazy(() => import("@/frontend/src/reused-pages/m/goals/page"));

// Public routes
const PrivacyPage = lazy(() => import("@/frontend/src/reused-pages/privacy/page"));
const TermsPage = lazy(() => import("@/frontend/src/reused-pages/terms/page"));
const ForgotPasswordPage = lazy(
  () => import("@/frontend/src/reused-pages/login/forgot-password/page")
);
const ResetPasswordPage = lazy(
  () => import("@/frontend/src/reused-pages/login/reset-password/page")
);
const ClearStoragePage = lazy(() => import("@/frontend/src/reused-pages/clear-storage/page"));

/**
 * Top-level route table. Replaces the Next.js file-based app/ routing.
 * - Public routes render bare.
 * - The /crm advisor dashboard is a Lovable-rebuilt page.
 * - The (client) area reuses the original pages under ClientLayout.
 */
export function App() {
  return (
    <>
      <RouteMetadata />
      <Suspense fallback={<AppBootScreen />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/login/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/login/reset-password" element={<ResetPasswordPage />} />
          <Route path="/clear-storage" element={<ClearStoragePage />} />

          <Route path="/crm">
            <Route
              index
              element={
                <RequireAdvisor>
                  <CrmPage />
                </RequireAdvisor>
              }
            />
            <Route
              path="settings"
              element={
                <RequireAdvisor>
                  <CrmSettingsPage />
                </RequireAdvisor>
              }
            />
            <Route
              path="settings/parsers"
              element={
                <RequireAdvisor>
                  <CrmParsersPage />
                </RequireAdvisor>
              }
            />
            <Route
              path="settings/pension-parsers"
              element={
                <RequireAdvisor>
                  <CrmPensionParsersPage />
                </RequireAdvisor>
              }
            />
            <Route
              path="settings/subscriptions"
              element={
                <RequireAdvisor>
                  <CrmSubscriptionsPage />
                </RequireAdvisor>
              }
            />
            <Route
              path="settings/cities"
              element={
                <RequireAdvisor>
                  <CrmCitiesPage />
                </RequireAdvisor>
              }
            />
            <Route
              path="settings/hidden-merchants"
              element={
                <RequireAdvisor>
                  <CrmHiddenMerchantsPage />
                </RequireAdvisor>
              }
            />
            <Route
              path="settings/mappings"
              element={
                <RequireAdvisor>
                  <CrmMappingsPage />
                </RequireAdvisor>
              }
            />
          </Route>

          <Route
            path="/m"
            element={
              <RequireAuth>
                <MobileLayout />
              </RequireAuth>
            }
          >
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
            <Route
              path="/plan"
              element={
                <RequireImpersonation>
                  <PlanPage />
                </RequireImpersonation>
              }
            />
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
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
