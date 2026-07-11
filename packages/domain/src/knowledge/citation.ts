import type { KnowledgeChunkId, KnowledgeReleaseId } from "../shared/ids.ts";

export type KnowledgeCitation = Readonly<{
  releaseId: KnowledgeReleaseId;
  chunkId: KnowledgeChunkId;
  sourceTitle: string;
  excerpt: string;
  version: number;
}>;
