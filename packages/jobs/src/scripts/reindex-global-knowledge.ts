import {
  extractGraph,
  hasLegacyKnowledgeGraph,
  type KnowledgeGraphDocumentInput,
  migrateQdrantChunksToOrg,
  replaceKnowledgeGraph,
} from "@acme/ai";
import {
  asc,
  eq,
  GameKnowledgeChunk,
  GameKnowledgeDocument,
  GLOBAL_KNOWLEDGE_ORG_ID,
} from "@acme/db";
import { db } from "@acme/db/client";

async function rebuildLegacyGraph(documents: { id: string }[]): Promise<void> {
  const hasLegacyGraph = await hasLegacyKnowledgeGraph(
    GLOBAL_KNOWLEDGE_ORG_ID,
    documents.map((document) => document.id),
  );
  if (hasLegacyGraph === undefined) {
    console.info("Neo4j is not configured; skipping knowledge graph reindex");
    return;
  }
  if (!hasLegacyGraph) {
    console.info("Neo4j knowledge graph already uses the global organization");
    return;
  }

  const chunks = await db
    .select({
      documentId: GameKnowledgeChunk.documentId,
      index: GameKnowledgeChunk.chunkIndex,
      text: GameKnowledgeChunk.text,
      audience: GameKnowledgeChunk.audience,
    })
    .from(GameKnowledgeChunk)
    .where(eq(GameKnowledgeChunk.orgId, GLOBAL_KNOWLEDGE_ORG_ID))
    .orderBy(
      asc(GameKnowledgeChunk.documentId),
      asc(GameKnowledgeChunk.chunkIndex),
    );
  const chunksByDocument = new Map<string, { index: number; text: string }[]>();
  for (const chunk of chunks) {
    if (chunk.audience === "judge") continue;
    const existing = chunksByDocument.get(chunk.documentId) ?? [];
    existing.push({ index: chunk.index, text: chunk.text });
    chunksByDocument.set(chunk.documentId, existing);
  }

  const graphDocuments: KnowledgeGraphDocumentInput[] = [];
  for (const document of documents) {
    const extracted = await extractGraph(
      chunksByDocument.get(document.id) ?? [],
    );
    const entities = new Map<
      string,
      { id: string; type: string; label: string }
    >();
    const relations: KnowledgeGraphDocumentInput["relations"] = [];
    for (const chunk of extracted) {
      for (const entity of chunk.entities) entities.set(entity.id, entity);
      relations.push(...chunk.relations);
    }
    graphDocuments.push({
      documentId: document.id,
      entities: [...entities.values()],
      relations,
    });
  }

  await replaceKnowledgeGraph(GLOBAL_KNOWLEDGE_ORG_ID, graphDocuments);
  console.info(`Reindexed ${graphDocuments.length} documents in Neo4j`);
}

async function main(): Promise<void> {
  const documents = await db
    .select({ id: GameKnowledgeDocument.id })
    .from(GameKnowledgeDocument)
    .where(eq(GameKnowledgeDocument.orgId, GLOBAL_KNOWLEDGE_ORG_ID));
  const documentIds = documents.map((document) => document.id);
  const qdrant = await migrateQdrantChunksToOrg(
    GLOBAL_KNOWLEDGE_ORG_ID,
    documentIds,
  );
  console.info(
    qdrant.configured
      ? `Reindexed ${qdrant.migratedPoints} Qdrant points`
      : "Qdrant is not configured; skipping vector reindex",
  );
  await rebuildLegacyGraph(documents);
}

await main();
