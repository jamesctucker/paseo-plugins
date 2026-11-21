import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listRequestedReviews } from "./server/review-requests";
import { listReviewRequests, spawnConfigDoc } from "./shared/review-requests";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(spawnConfigDoc);
  server.handle(listReviewRequests, (_input, context) => listRequestedReviews(context));
  return () => {};
}
