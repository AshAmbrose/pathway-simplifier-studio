/**
 * Turning a label as drawn into the terms the databases are searched with. Pure, so it runs the same on the
 * server and in the offline checks.
 *  - Spellings: Greek letters as the gene symbols write them (IKKβ → IKKB, IκBα → IKBA, PKCθ → PKCQ) and as words
 *    (IKKbeta); sub- and superscript digits (H₂O₂ → H2O2); with and without hyphens and spaces (IL-1β → IL1B).
 *  - Splitting: one label naming several molecules (IRAK1/4 → IRAK1 + IRAK4, TRAF2/5, Elongin B/C, LTA LTB).
 *    Process and outcome boxes are never split: "Survival, inflammation, and immune response" is one outcome.
 *  - Generic words: labels that name a class of molecules ("Receptor", "Cytokine/Growth factor", "PTPs"), each
 *    with the name of the class term to look up (the term's ID always comes from the database, never from here).
 */

/** Greek letters → the Latin letter gene symbols use (θ → Q as in PRKCQ), and the spelled-out word. */
const GREEK: Record<string, [string, string]> = {
  α: ['A', 'alpha'], β: ['B', 'beta'], γ: ['G', 'gamma'], δ: ['D', 'delta'], ε: ['E', 'epsilon'], ζ: ['Z', 'zeta'],
  η: ['H', 'eta'], θ: ['Q', 'theta'], ι: ['I', 'iota'], κ: ['K', 'kappa'], λ: ['L', 'lambda'], μ: ['M', 'mu'],
  ν: ['N', 'nu'], ξ: ['X', 'xi'], π: ['P', 'pi'], ρ: ['R', 'rho'], σ: ['S', 'sigma'], τ: ['T', 'tau'], φ: ['F', 'phi'], ω: ['W', 'omega'],
};
const SUB = '₀₁₂₃₄₅₆₇₈₉', SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Sub- and superscript digits as plain digits, spaces tidied. */
export function plainDigits(s: string): string {
  return [...s].map((c) => (SUB.includes(c) ? String(SUB.indexOf(c)) : SUP.includes(c) ? String(SUP.indexOf(c)) : c)).join('').replace(/\s+/g, ' ').trim();
}

/** The spellings a term is searched under, most literal first, without repeats. */
export function spellings(term: string): string[] {
  const t = plainDigits(term);
  const letter = [...t].map((c) => GREEK[c.toLowerCase()]?.[0] ?? c).join('');
  const word = [...t].map((c) => GREEK[c.toLowerCase()]?.[1] ?? c).join('');
  const squash = (s: string) => s.replace(/[-\s]/g, '');
  return [...new Set([t, letter, squash(letter), word, squash(t)])].filter((s) => s.length > 0);
}

/** Kinds whose boxes name one process or outcome, never a list of molecules. */
const WHOLE = new Set(['process', 'phenotype', 'heading']);
/** Looks like a gene or protein symbol: short, no spaces, a capital or digit in it. */
const symbolish = (s: string) => /^[A-Za-z0-9α-ωΑ-Ω-]{2,10}$/.test(s) && /[A-Z0-9]/.test(s);

/**
 * The molecules one label names. "IRAK1/4" → IRAK1, IRAK4 (a bare suffix takes the first part's stem);
 * "Elongin B/C" → Elongin B, Elongin C; "LTA LTB" → LTA, LTB; "Cytokine/Growth factor" → Cytokine, Growth factor.
 * A label that names one thing comes back as itself.
 */
export function splitLabel(label: string, kind: string): string[] {
  const t0 = plainDigits(label);
  if (WHOLE.has(kind)) return [t0];
  // "Elongin B/C complex": the members are what's split; the word "complex" belongs to the whole.
  const t = /\/|,/.test(t0) ? t0.replace(/\s+complex$/i, '') : t0;
  const parts = t.split(/\s*[/,]\s*|\s+and\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    // Two symbols side by side with a space ("LTA LTB").
    const words = t.split(' ');
    return words.length > 1 && words.every((w) => symbolish(w) && /^[A-Z0-9]+$/.test(w.replace(/[α-ω]/g, ''))) ? words : [t];
  }
  const first = parts[0];
  return parts.map((p, i) => {
    if (i === 0) return p;
    // A bare number or letter after the first part reuses its stem: IRAK1/4, TAB1/2, cIAP1/2, Elongin B/C.
    if (/^\d+[A-Za-z]?$/.test(p) && /\d+[A-Za-z]?$/.test(first)) return first.replace(/\d+[A-Za-z]?$/, '') + p;
    if (/^[A-Za-zα-ω]$/.test(p) && /(^|[\s-])[A-Za-zα-ω]$/.test(first)) return first.replace(/[A-Za-zα-ω]$/, '') + p;
    return p;
  });
}

/**
 * Words for a class of molecules rather than one, and the class term looked up for each (by its exact name, in
 * Gene Ontology or ChEBI). Matched on the whole label, ignoring case and a plural "s".
 */
export const GENERIC: Record<string, { ontology: 'go' | 'chebi'; term: string }> = {
  receptor: { ontology: 'go', term: 'signaling receptor activity' },
  cytokine: { ontology: 'go', term: 'cytokine activity' },
  'growth factor': { ontology: 'go', term: 'growth factor activity' },
  ligand: { ontology: 'go', term: 'signaling receptor binding' },
  antigen: { ontology: 'chebi', term: 'antigen' },
  kinase: { ontology: 'go', term: 'protein kinase activity' },
  phosphatase: { ontology: 'go', term: 'phosphoprotein phosphatase activity' },
  ptp: { ontology: 'go', term: 'protein tyrosine phosphatase activity' },
  'ubiquitin ligase': { ontology: 'go', term: 'ubiquitin-protein transferase activity' },
  'transcription factor': { ontology: 'go', term: 'DNA-binding transcription factor activity' },
  'second messenger': { ontology: 'chebi', term: 'second messenger' },
  stimulus: { ontology: 'go', term: 'response to stimulus' },
};

/** The generic word a term is, if any ("Receptors" → receptor, "PTPs" → ptp). */
export function genericWord(term: string): string | null {
  const t = plainDigits(term).toLowerCase().replace(/[-_]/g, ' ').trim();
  for (const w of [t, t.replace(/s$/, ''), t.replace(/es$/, '')]) if (GENERIC[w]) return w;
  return null;
}
