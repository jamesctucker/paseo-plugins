import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listRequestedReviews } from "./server/review-requests";
import { listReviewRequests } from "./shared/review-requests";

export default function contribute(server: PluginServerContext) {
  server.handle(listReviewRequests, () => listRequestedReviews());
  return () => {};
}
