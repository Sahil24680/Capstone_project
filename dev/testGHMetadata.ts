// dev/testGhMetadata.ts

/**
 * UNIT TEST -- NOT AN INTEGRATION TEST
 * USAGE: npx tsx dev/testGHMetadata.ts
 */

import {
  extractGhFeaturesFromMetadata,
  extractSalaryFromText,
} from "../lib/normalizers/greenhouse";

// Tiny assert helper (no test framework required)
function assertEqual<T>(label: string, actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${label} expected ${expected}, got ${actual}`);
  }
}

function show(label: string, features: Record<string, any>) {
  console.log(`\nCase: ${label}`);
  console.log("features:", features);
}

function runCase(
  label: string,
  raw: any,
  expected: Partial<Record<string, any>>,
  textFallback?: string // optional plain-text (decoded) description to exercise extractSalaryFromText
) {
  // 1) Parse features from GH metadata (non-mutating; returns a fresh object)
  const features = extractGhFeaturesFromMetadata(raw);

  // 2) Optional text fallback to fill any gaps (mutates features in-place)
  if (textFallback) {
    extractSalaryFromText(textFallback, features);
  }

  show(label, features);

  // Minimal assertions (only check keys present in `expected`)
  for (const [k, v] of Object.entries(expected)) {
    const actual = (features as any)[k];
    if (v === undefined) {
      if (actual !== undefined) {
        throw new Error(`Assertion failed: ${k} expected undefined, got ${actual}`);
      }
    } else {
      assertEqual(k, actual, v);
    }
  }
}

/* ---------------------------- Sample Fixtures ---------------------------- */

// 1) Hourly base min + midpoint in metadata (like DoorDash hourly roles)
const GH_HOURLY_MIN_MID = {
  metadata: [
    { name: "Time Type", value: "Full time", value_type: "single_select" },
    { name: "Careers Page Sorting: Department", value: "DashMart", value_type: "single_select" },
    {
      name: "US4 - Base Salary Band Minimum",
      value_type: "currency",
      value: { unit: "USD", amount: "26.46" },
    },
    {
      name: "US1 - Base Salary Band Midpoint",
      value_type: "currency",
      value: { unit: "USD", amount: "38.94" },
    },
    {
      name: "US1 - Equity Band Midpoint",
      value_type: "currency",
      value: { unit: "USD", amount: "49900.0" },
    },
  ],
};

// 2) Annual base min + max (no midpoint)
const GH_ANNUAL_MIN_MAX = {
  metadata: [
    { name: "Job Family", value: "Engineering", value_type: "single_select" },
    {
      name: "Base Salary Minimum",
      value_type: "currency",
      value: { unit: "USD", amount: "120000" },
    },
    {
      name: "Base Salary Maximum",
      value_type: "currency",
      value: { unit: "USD", amount: "180000" },
    },
    {
      name: "US1 - Equity Band Midpoint",
      value_type: "currency",
      value: { unit: "USD", amount: "10000" },
    },
  ],
};

// 3) Only midpoint is present (leave min/max undefined)
const GH_ONLY_MIDPOINT = {
  metadata: [
    { name: "Job Family", value: "Sales", value_type: "single_select" },
    {
      name: "US1 - Base Salary Band Midpoint",
      value_type: "currency",
      value: { unit: "USD", amount: "71.0" },
    },
    // OTE present but should be ignored for base
    {
      name: "On-Target Earnings",
      value_type: "currency",
      value: { unit: "USD", amount: "90.0" },
    },
    // Equity should be ignored
    {
      name: "Equity Band",
      value_type: "currency",
      value: { unit: "USD", amount: "40000" },
    },
  ],
};

// 4) Nothing in metadata; rely on text fallback (e.g., "$100k - $150k")
const GH_NONE_USE_TEXT = {
  metadata: [],
};
const TEXT_ANNUAL_RANGE = "Compensation: $100,000 - $150,000 per year.";

/* --------------------------------- Runs --------------------------------- */

try {
  runCase(
    "Hourly base with min + midpoint",
    GH_HOURLY_MIN_MID,
    {
      department: "DashMart",
      time_type: "Full time",
      currency: "USD",
      comp_period: "hour", // inferred from small numbers
      salary_min: 26.46,
      salary_mid: 38.94,
      // max intentionally undefined (no inference)
    }
  );

  runCase(
    "Annual base with min + max (derive mid)",
    GH_ANNUAL_MIN_MAX,
    {
      department: "Engineering",
      currency: "USD",
      comp_period: "year",
      salary_min: 120000,
      salary_max: 180000,
      salary_mid: 150000, // midpoint computed only because both min & max exist
    }
  );

  runCase(
    "Only midpoint present (no min/max)",
    GH_ONLY_MIDPOINT,
    {
      department: "Sales",
      currency: "USD",
      comp_period: "hour",
      salary_mid: 71,
      // min/max should remain undefined
    }
  );

  runCase(
    "No metadata; use text fallback",
    GH_NONE_USE_TEXT,
    {
      currency: "USD",
      comp_period: undefined,
      salary_min: 100000,
      salary_max: 150000,
      salary_mid: 125000,
      salary_source: "text",
    },
    TEXT_ANNUAL_RANGE
  );

  console.log("\n All GH metadata parsing checks passed.");
} catch (err: any) {
  console.error("\n Test failed:", err?.message ?? err);
  process.exit(1);
}
