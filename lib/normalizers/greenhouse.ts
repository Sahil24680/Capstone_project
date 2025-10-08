// lib/normalizers/greenhouse.ts
export type GHCanon = {
  time_type?: string;
  salary_min?: number;
  salary_mid?: number;
  salary_max?: number;
  currency?: string;
  department?: string;
  salary_source?: 'metadata' | 'text';
};

export function extractGhFeaturesFromMetadata(raw: any): GHCanon {
  const features: GHCanon = {};

  // helper to safely set salary + currency
  const setCurrencyAmt = (field: keyof GHCanon, val: any) => {
    if (val && typeof val.amount === 'string') {
      const num = parseFloat(val.amount);
      if (!Number.isNaN(num)) {
        (features as any)[field] = num;
        if (val.unit) features.currency ??= val.unit;
        features.salary_source ??= 'metadata';
      }
    }
  };

  if (Array.isArray(raw?.metadata)) {
    for (const m of raw.metadata) {
      const label = (m.name ?? '').toLowerCase();
      const vt = m.value_type;

      // salary/comp fields (exclude equity/stock/rsu)
      if (vt === 'currency' || /salary|pay|compensation|base/.test(label)) {
        const looksLikeSalary =
          /salary|pay|compensation|base/.test(label) &&
          !/equity|stock|rsu/.test(label);

        if (looksLikeSalary && /minimum|min\b/.test(label)) {
          setCurrencyAmt('salary_min', m.value);
        } else if (looksLikeSalary && /maximum|max\b/.test(label)) {
          setCurrencyAmt('salary_max', m.value);
        } else if (looksLikeSalary && /midpoint|median/.test(label)) {
          setCurrencyAmt('salary_mid', m.value);
        }
      }

      // time type
      if (m.name === 'Time Type' && typeof m.value === 'string') {
        features.time_type = m.value;
      }

      // department
      if (
        (m.name === 'Job Family' ||
          m.name === 'Careers Page Sorting: Department') &&
        typeof m.value === 'string'
      ) {
        features.department = m.value;
      }
    }
  }

  return features;
}

/** Convert (possibly entity-escaped) HTML to readable plain text. */
export function htmlToPlainText(html: string): string {
  if (!html) return "";

  // 1) Decode a few common named entities & numeric entities
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  const decodeEntities = (s: string) =>
    s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_m, g1: string) => {
      // numeric: &#NN; or &#xNN;
      if (g1[0] === "#") {
        const hex = g1[1]?.toLowerCase() === "x";
        const code = parseInt(hex ? g1.slice(2) : g1.slice(1), hex ? 16 : 10);
        if (Number.isFinite(code)) return String.fromCodePoint(code);
        return _m;
      }
      // named: &nbsp; &amp; etc.
      return Object.prototype.hasOwnProperty.call(named, g1) ? named[g1] : _m;
    });

  let text = decodeEntities(html);

  // 2) Convert some block-ish tags to line breaks before stripping
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n");

  // 3) Strip all remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // 4) Collapse whitespace nicely
  text = text
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")  
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

// Text fallback: only fills fields that metadata didn’t already populate
export function extractSalaryFromText(text: string, features: GHCanon) {
  if (!text) return;

  // Normalize a bit (already stripping HTML outside)
  const s = String(text);

  // Patterns:
  // 1) "$170,000 - $250,000" or "170,000 to 250,000"
  const dollarsRange = /\$?\s?(\d{2,3}(?:,\d{3})?)\s*(?:-|–|to)\s*\$?\s?(\d{2,3}(?:,\d{3})?)/i;
  // 2) "170k - 250k"
  const kRange = /(\d{2,3})\s*k\s*(?:-|–|to)\s*(\d{2,3})\s*k/i;

  let loNum: number | null = null;
  let hiNum: number | null = null;
  let sawDollarSymbol = false;

  const m1 = s.match(dollarsRange);
  if (m1) {
    loNum = parseFloat(m1[1].replace(/,/g, ''));
    hiNum = parseFloat(m1[2].replace(/,/g, ''));
    sawDollarSymbol = /\$/.test(m1[0]);
  } else {
    const m2 = s.match(kRange);
    if (m2) {
      const lo = parseFloat(m2[1]);
      const hi = parseFloat(m2[2]);
      if (!Number.isNaN(lo) && !Number.isNaN(hi)) {
        loNum = lo * 1000;
        hiNum = hi * 1000;
      }
    }
  }

  if (loNum == null || hiNum == null || Number.isNaN(loNum) || Number.isNaN(hiNum)) {
    return; // nothing to set
  }

  // Only set values that metadata didn’t already provide
  let changed = false;
  if (features.salary_min == null) {
    features.salary_min = loNum;
    changed = true;
  }
  if (features.salary_max == null) {
    features.salary_max = hiNum;
    changed = true;
  }
  if (!features.currency && sawDollarSymbol) {
    features.currency = 'USD';
    changed = true;
  }

  // Mark provenance only if something new is set (or metadata wasn’t set)
  if (changed && features.salary_source !== 'metadata') {
    features.salary_source = 'text';
  }
}
