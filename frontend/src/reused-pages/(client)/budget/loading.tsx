import { RouteLoadingSkeleton } from "@/components/ui/RouteLoadingSkeleton";

export default function BudgetLoading() {
  return <RouteLoadingSkeleton titleWidth="w-40" rows={6} cards={4} />;
}
