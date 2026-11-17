/**
 * What step 1 says a shape is: the records it was matched to in public databases, and why. Shared by the lookup
 * service (server/identify.ts), the matcher (candidates.ts), the change that stores a choice (`identify`), and the
 * Issues panel. Every record names its database and its own ID, so it can be opened and checked; nothing here is
 * ever made up: a label with no record stays unidentified.
 */
import { z } from 'zod';

export const DATABASES = ['HGNC', 'UniProt', 'GO', 'ChEBI', 'Complex Portal', 'HGNC gene group'] as const;
export type Database = (typeof DATABASES)[number];

/**
 * Which field of the record the label matched, in the database's own terms. Shown to the user, so an alias is
 * never mistaken for the record's own name.
 */
export const FIELDS = ['approved symbol', 'approved name', 'alias', 'previous symbol', 'gene name', 'gene synonym', 'protein name',
  'term name', 'exact synonym', 'related synonym', 'complex name', 'symbol stem', 'gene group', 'class term'] as const;
export type Field = (typeof FIELDS)[number];

export const RecordSchema = z.object({
  db: z.enum(DATABASES),
  /** The database's own ID: HGNC:6859, O43318, GO:0010467, CHEBI:16240, CPX-3269, or the gene group's number. */
  id: z.string(),
  /** The record's name: an approved symbol, a term or complex name. */
  name: z.string(),
  /** A gene's full approved name, or a term's definition-free label. */
  full: z.string().nullable().optional(),
  /** UniProt accessions, for genes. */
  uniprot: z.array(z.string()).optional(),
  /** Members, for a gene group or a family found by its symbol stem. */
  members: z.array(z.string()).optional(),
  url: z.string(),
});
export type DbRecord = z.infer<typeof RecordSchema>;

/** One record a label matched, and how. */
export interface Hit {
  record: DbRecord;
  field: Field;
  /** The text in the record that matched (an alias as the database writes it). */
  matched: string;
}

/** What the lookups found for one term (a label, or one part of a split label such as "IRAK1/4"). */
export interface TermLookup {
  term: string;
  hits: Hit[];
  /** The services asked, and those that could not be reached (nothing is filled in for those). */
  tried: string[];
  failed: string[];
  /** The term is a word for a class of molecules ("Receptor", "Cytokine"), with its class term when found. */
  generic: { word: string; classTerm: Hit | null } | null;
}

/** What the server returns for one label. */
export interface LabelLookup {
  label: string;
  kind: string;
  /** One entry per part: a single label has one; "IRAK1/4" has IRAK1 and IRAK4. */
  parts: TermLookup[];
}

/**
 * A shape's identity, as stored by the `identify` change (and on the element once applied).
 *  - molecule, process, chemical, complex: one record;
 *  - set: one record per part ("IRAK1/4" → IRAK1 + IRAK4);
 *  - family: a gene group or symbol stem ("JAK");
 *  - generic: a class of molecules, with its class term if there is one;
 *  - not a molecule: a heading, a symbol, a word; unidentified: looked at, and left without a record.
 */
export const IDENTITY_KINDS = ['molecule', 'set', 'family', 'complex', 'process', 'chemical', 'generic', 'not a molecule', 'unidentified'] as const;
export const IdentitySchema = z.object({
  kind: z.enum(IDENTITY_KINDS),
  records: z.array(RecordSchema),
  /** Why each record was chosen, in the database's terms ("HGNC lists TAK1 as an alias of MAP3K7"). */
  how: z.array(z.string()),
  /** Chosen by the user, or an exact approved-symbol match taken as found. */
  by: z.enum(['you', 'exact match']),
});
export type Identity = z.infer<typeof IdentitySchema>;
