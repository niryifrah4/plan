import { RouteLoadingSkeleton } from "@/components/ui/RouteLoadingSkeleton";

export default function BalanceLoading() {
  return <RouteLoadingSkeleton titleWidth="w-36" rows={5} cards={3} />;
}
