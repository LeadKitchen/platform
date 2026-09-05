import { env } from "@acme/config";
import type { Driver, Session } from "neo4j-driver";

/**
 * Neo4j client for `org-fusion-rag`'s graph channel
 * (`packages/ai/src/strategies/knowledge/org-fusion-rag.ts`) — a real
 * deployed graph database, separate from the built-in in-memory `graph-rag`
 * strategy (`./graph.ts`), which needs no database because the reference
 * catalog it walks is small and fixed. Org-uploaded documents don't have
 * that guarantee.
 *
 * Every node/relationship carries an `orgId` property (Neo4j Community has
 * no per-tenant database isolation), and every query filters on it — the
 * same pattern `org-rag`'s SQL `where` clause uses for Postgres. All
 * relationships share one Neo4j relationship type (`RELATES_TO`) with a
 * `type` property carrying the semantic edge type: Cypher can't parameterize
 * a relationship *type*, only property values, so encoding the LLM-derived
 * edge type as data rather than as a dynamic relationship type avoids
 * building Cypher from untrusted strings.
 *
 * The driver is created lazily on first use (dynamic `import()`, mirroring
 * `qdrant.ts` and `strategies/knowledge/org-rag.ts`'s pattern for
 * `@acme/db`) — `env.NEO4J_URL` unset means every export here is a no-op,
 * so this channel contributes nothing to the fusion rather than failing
 * the dialog, and nothing that only exercises built-in strategies needs a
 * live Neo4j instance.
 *
 * Safety note: unlike `GameKnowledgeChunk` (one Postgres row `org-rag`/
 * `org-fusion-rag` read live, audience filtered at query time) there is no
 * per-item audience filter here — the caller
 * (`packages/jobs/src/trigger/ingest-knowledge-document.ts`) never sends a
 * `judge`-labeled chunk to extraction in the first place, so nothing
 * judge-derived is ever written to this graph at all.
 */

export interface GraphEntityInput {
  id: string;
  type: string;
  label: string;
}

export interface GraphRelationInput {
  from: string;
  to: string;
  type: string;
  label: string;
}

export interface GraphFact {
  id: string;
  text: string;
  hops: number;
}

export interface GraphTraversalResult {
  facts: GraphFact[];
  visited: string[];
}

export interface KnowledgeGraphDocumentInput {
  documentId: string;
  entities: GraphEntityInput[];
  relations: GraphRelationInput[];
}

let driverPromise: Promise<Driver | undefined> | undefined;
let schemaPromise: Promise<void> | undefined;

async function getDriver(): Promise<Driver | undefined> {
  const url = env.NEO4J_URL;
  if (!url) return undefined;
  driverPromise ??= (async () => {
    try {
      const neo4j = await import("neo4j-driver");
      return neo4j.default.driver(
        url,
        neo4j.default.auth.basic(
          env.NEO4J_USER ?? "neo4j",
          env.NEO4J_PASSWORD ?? "",
        ),
      );
    } catch (error) {
      driverPromise = undefined;
      throw error;
    }
  })();
  return driverPromise;
}

function ensureSchema(session: Session): Promise<void> {
  schemaPromise ??= session
    .run(
      `CREATE CONSTRAINT entity_org_id_unique IF NOT EXISTS
       FOR (n:Entity) REQUIRE (n.orgId, n.id) IS UNIQUE`,
    )
    .then(() => undefined)
    .catch((error: unknown) => {
      schemaPromise = undefined;
      throw error;
    });
  return schemaPromise;
}

async function withSession<T>(
  run: (session: Session) => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    const driver = await getDriver();
    if (!driver) return fallback;
    const session = driver.session();
    try {
      return await run(session);
    } finally {
      await session.close();
    }
  } catch (error) {
    console.warn(
      `Neo4j operation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return fallback;
  }
}

/**
 * Upserts a document's extracted entities/relations, scoped by `orgId` and
 * `documentId`. A failure here costs this channel's recall for the
 * document, never the whole ingestion — same graceful-degradation
 * contract as the rest of the pipeline (docs/ai-module.md).
 */
export async function upsertEntities(
  orgId: string,
  documentId: string,
  entities: GraphEntityInput[],
  relations: GraphRelationInput[],
): Promise<void> {
  await withSession(async (session) => {
    await ensureSchema(session);

    await session.run(
      `MATCH (a:Entity {orgId: $orgId})-[r:RELATES_TO {documentId: $documentId}]-(b:Entity {orgId: $orgId})
       WITH DISTINCT r
       DELETE r`,
      { orgId, documentId },
    );
    await session.run(
      `MATCH (n:Entity {orgId: $orgId, documentId: $documentId})
       DETACH DELETE n`,
      { orgId, documentId },
    );

    if (entities.length > 0) {
      await session.run(
        `UNWIND $entities AS entity
         MERGE (n:Entity {orgId: $orgId, id: entity.id})
         SET n.type = entity.type, n.label = entity.label, n.documentId = $documentId`,
        { orgId, documentId, entities },
      );
    }
    if (relations.length > 0) {
      await session.run(
        `UNWIND $relations AS rel
         MATCH (a:Entity {orgId: $orgId, id: rel.from})
         MATCH (b:Entity {orgId: $orgId, id: rel.to})
         MERGE (a)-[r:RELATES_TO {type: rel.type}]->(b)
         SET r.label = rel.label, r.documentId = $documentId`,
        { orgId, documentId, relations },
      );
    }
  }, undefined);
}

/**
 * Returns whether per-team graph data still needs the one-time global-org
 * rebuild. `undefined` means Neo4j is intentionally not configured.
 * Operational failures propagate so the migration command can be retried.
 */
export async function hasLegacyKnowledgeGraph(
  orgId: string,
  documentIds: string[],
): Promise<boolean | undefined> {
  const driver = await getDriver();
  if (!driver) return undefined;
  if (documentIds.length === 0) return false;
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (n:Entity)
       WHERE n.documentId IN $documentIds
         AND (n.orgId IS NULL OR n.orgId <> $orgId)
       RETURN count(n) > 0 AS found`,
      { documentIds, orgId },
    );
    return Boolean(result.records[0]?.get("found"));
  } finally {
    await session.close();
  }
}

/**
 * Atomically rebuilds the uploaded-document graph under one organization.
 * Rebuilding, instead of changing `orgId` in place, safely coalesces entity
 * ids that were unique only within their former per-team namespaces.
 */
export async function replaceKnowledgeGraph(
  orgId: string,
  documents: KnowledgeGraphDocumentInput[],
): Promise<boolean> {
  const driver = await getDriver();
  if (!driver) return false;
  const session = driver.session();
  try {
    await ensureSchema(session);
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (n:Entity)
         WHERE n.documentId IN $documentIds
         DETACH DELETE n`,
        { documentIds: documents.map((document) => document.documentId) },
      );
      for (const document of documents) {
        if (document.entities.length > 0) {
          await tx.run(
            `UNWIND $entities AS entity
             MERGE (n:Entity {orgId: $orgId, id: entity.id})
             SET n.type = entity.type, n.label = entity.label, n.documentId = $documentId`,
            {
              orgId,
              documentId: document.documentId,
              entities: document.entities,
            },
          );
        }
        if (document.relations.length > 0) {
          await tx.run(
            `UNWIND $relations AS rel
             MATCH (a:Entity {orgId: $orgId, id: rel.from})
             MATCH (b:Entity {orgId: $orgId, id: rel.to})
             MERGE (a)-[r:RELATES_TO {type: rel.type}]->(b)
             SET r.label = rel.label, r.documentId = $documentId`,
            {
              orgId,
              documentId: document.documentId,
              relations: document.relations,
            },
          );
        }
      }
    });
    return true;
  } finally {
    await session.close();
  }
}

/**
 * Finds entities whose label mentions any of the given terms — org-uploaded
 * documents have no fixed id scheme the way the built-in catalog does
 * (`./graph.ts` seeds with deterministic ids like `employee:${id}`), so
 * `org-fusion-rag` seeds its traversal from a lexical match on entity
 * labels instead.
 */
export async function findSeedEntities(
  orgId: string,
  terms: string[],
  limit: number,
): Promise<string[]> {
  if (terms.length === 0) return [];
  // Same reasoning as the hop-count literal below: bounded and inlined,
  // not passed as a query parameter for the LIMIT clause.
  const boundedLimit = Math.max(1, Math.min(20, Math.trunc(limit) || 1));

  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (n:Entity {orgId: $orgId})
       WHERE any(term IN $terms WHERE toLower(n.label) CONTAINS toLower(term))
       RETURN DISTINCT n.id AS id
       LIMIT ${boundedLimit}`,
      { orgId, terms },
    );
    return result.records.map((record) => String(record.get("id")));
  }, []);
}

/**
 * Breadth-outward walk from the dialog's seed entities, scoped to the org.
 * Returns the same `{facts, visited}` shape as the built-in in-memory
 * `traverse()` in `./graph.ts`, so `org-fusion-rag`'s graph channel reads
 * exactly like the built-in `graph-rag` strategy's does — deduped to the
 * minimum hop count per fact, since Neo4j can return the same relationship
 * across several paths.
 */
export async function traverseOrgGraph(
  orgId: string,
  seeds: string[],
  maxHops: number,
): Promise<GraphTraversalResult> {
  if (seeds.length === 0) return { facts: [], visited: [] };
  // Cypher variable-length path bounds must be literal integers, not query
  // parameters — clamped so a bad caller can't inflate the traversal cost.
  const hops = Math.max(1, Math.min(5, Math.trunc(maxHops) || 1));

  return withSession(
    async (session) => {
      const result = await session.run(
        `MATCH (start:Entity {orgId: $orgId})
         WHERE start.id IN $seeds
         MATCH path = (start)-[:RELATES_TO*1..${hops}]-(other:Entity {orgId: $orgId})
         WITH relationships(path) AS pathRels, nodes(path) AS pathNodes
         UNWIND range(0, size(pathRels) - 1) AS idx
         RETURN DISTINCT
           pathNodes[idx].id AS fromId,
           pathNodes[idx + 1].id AS toId,
           pathRels[idx].label AS label,
           idx + 1 AS hop`,
        { orgId, seeds },
      );

      const visited = new Set<string>(seeds);
      const facts = new Map<string, GraphFact>();
      for (const record of result.records) {
        const fromId = String(record.get("fromId"));
        const toId = String(record.get("toId"));
        const label = String(record.get("label"));
        const hop = Number(record.get("hop"));
        const key = `${fromId}->${toId}`;
        const existing = facts.get(key);
        if (!existing || hop < existing.hops) {
          facts.set(key, { id: key, text: label, hops: hop });
        }
        visited.add(fromId);
        visited.add(toId);
      }
      return { facts: [...facts.values()], visited: [...visited] };
    },
    { facts: [], visited: [] },
  );
}
