import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { listReviewRequests } from "../shared/review-requests";

const REFETCH_INTERVAL_MS = 60_000;

export function useReviewRequests() {
  const list = useRpc(listReviewRequests);
  return useQuery({
    queryKey: ["review-requests"],
    queryFn: () => list({}),
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}
