import { RouteLoadingSkeleton } from "@/components/ui/RouteLoadingSkeleton";

export default function DebtLoading() {
  return <RouteLoadingSkeleton titleWidth="w-36" rows={6} cards={3} />;
}
