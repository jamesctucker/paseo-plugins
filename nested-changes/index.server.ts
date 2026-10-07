import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  addComment,
  getFileDiff,
  listComments,
  listRepos,
  removeComment,
  searchChangedFiles,
} from "./shared/diff";
import {
  handleAddComment,
  handleFileDiff,
  handleListComments,
  handleListRepos,
  handleRemoveComment,
  handleSearchChangedFiles,
} from "./server/handlers";

export default function contribute(server: PluginServerContext) {
  server.handle(listRepos, handleListRepos);
  server.handle(getFileDiff, handleFileDiff);
  server.handle(listComments, handleListComments);
  server.handle(addComment, handleAddComment);
  server.handle(removeComment, handleRemoveComment);
  server.handle(searchChangedFiles, handleSearchChangedFiles);
  return () => {};
}
