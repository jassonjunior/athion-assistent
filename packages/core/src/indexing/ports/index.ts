/** @module ports
 * Descrição: Barrel file das interfaces (ports) do módulo de indexação.
 * Re-exporta VectorStorePort e TextSearchPort para uso pelo domínio.
 */

export type {
  VectorStorePort,
  VectorPoint,
  VectorSearchQuery,
  VectorSearchResult,
  VectorFilter,
  FieldCondition,
} from './vector-store.port'

export type { TextSearchPort, TextDocument, TextSearchResult } from './text-search.port'
