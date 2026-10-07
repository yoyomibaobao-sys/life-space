/** SAF repository API used by the business facade in local-offline-db. */
export {
  commitSafContent, initializeSafSpace, readSafCommitted, visibleSafEntries,
} from "@/lib/local-saf-core";
export type { SafContent, SafState, SafStorage } from "@/lib/local-saf-core";
