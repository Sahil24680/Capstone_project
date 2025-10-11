// dev/testWebJsonLd.ts

/**
 * UNIT TEST -- NOT AN INTEGRATION TEST
 * USAGE: npx tsx dev/testWebJsonLd.ts
 */
import { extractWebFeaturesFromJsonLd } from "../lib/normalizers/web";

type Case = {
  name: string;
  jsonld: any;
  expect: {
    currency?: string;
    period?: "hour" | "year";
    min?: number;
    max?: number;
    mid?: number;
    source?: string;
  };
};

function approxEq(a: number | undefined, b: number | undefined, tol = 1e-6) {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= tol;
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    throw new Error("Assertion failed: " + msg);
  }
}

const cases: Case[] = [
  {
    name: "Hourly range (USD, 20–30/hr)",
    jsonld: {
      "@context": "http://schema.org",
      "@type": "JobPosting",
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "USD",
        value: {
          "@type": "QuantitativeValue",
          unitText: "HOUR",
          minValue: 20,
          maxValue: 30,
        },
      },
      title: "Warehouse Associate",
      hiringOrganization: { "@type": "Organization", name: "ExampleCo" },
    },
    expect: { currency: "USD", period: "hour", min: 20, max: 30, source: "jsonld" },
  },
  {
    name: "Annual single value (USD, 120000/yr)",
    jsonld: {
      "@context": "http://schema.org",
      "@type": "JobPosting",
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "USD",
        value: {
          "@type": "QuantitativeValue",
          unitText: "YEAR",
          value: 120000,
        },
      },
      title: "Senior Engineer",
      hiringOrganization: { "@type": "Organization", name: "Acme" },
    },
    expect: { currency: "USD", period: "year", mid: 120000, source: "jsonld" },
  },
  {
    name: "Annual range with stringy numbers ('100000'–'150000')",
    jsonld: {
      "@context": "http://schema.org",
      "@type": "JobPosting",
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "USD",
        value: {
          "@type": "QuantitativeValue",
          unitText: "YEAR",
          minValue: "100000",
          maxValue: "150000",
        },
      },
      title: "Product Manager",
      hiringOrganization: { "@type": "Organization", name: "BetaCorp" },
    },
    expect: { currency: "USD", period: "year", min: 100000, max: 150000, source: "jsonld" },
  },
  {
    name: "Array wrapper (as many sites embed multiple JSON-LD blocks)",
    jsonld: [
      { "@context": "http://schema.org", "@type": "BreadcrumbList" },
      {
        "@context": "http://schema.org",
        "@type": "JobPosting",
        baseSalary: {
          "@type": "MonetaryAmount",
          currency: "USD",
          value: {
            "@type": "QuantitativeValue",
            unitText: "HOUR",
            minValue: 26.46,
            maxValue: 38.94,
          },
        },
        title: "Territory Account Executive",
      },
    ],
    expect: { currency: "USD", period: "hour", min: 26.46, max: 38.94, source: "jsonld" },
  },
];

function runOne(c: Case) {
  const features = extractWebFeaturesFromJsonLd(c.jsonld) || {};
  // Log for eyeballing
  console.log(`\nCase: ${c.name}`);
  console.log("features:", features);

  if (c.expect.currency) {
    assert(features.currency === c.expect.currency, `currency expected ${c.expect.currency}, got ${features.currency}`);
  }
  if (c.expect.period) {
    assert(features.comp_period === c.expect.period, `comp_period expected ${c.expect.period}, got ${features.comp_period}`);
  }
  if (typeof c.expect.min === "number") {
    assert(approxEq(features.salary_min, c.expect.min), `salary_min ~== ${c.expect.min}, got ${features.salary_min}`);
  }
  if (typeof c.expect.max === "number") {
    assert(approxEq(features.salary_max, c.expect.max), `salary_max ~== ${c.expect.max}, got ${features.salary_max}`);
  }
  if (typeof c.expect.mid === "number") {
    assert(approxEq(features.salary_mid, c.expect.mid), `salary_mid ~== ${c.expect.mid}, got ${features.salary_mid}`);
  }
  if (c.expect.source) {
    assert(features.salary_source === c.expect.source, `salary_source expected ${c.expect.source}, got ${features.salary_source}`);
  }

  // sanity: if both min & max present, min <= max
  if (typeof features.salary_min === "number" && typeof features.salary_max === "number") {
    assert(features.salary_min <= features.salary_max, `min (${features.salary_min}) should be <= max (${features.salary_max})`);
  }
}

(function main() {
  try {
    cases.forEach(runOne);
    console.log("\n All JSON-LD salary parsing checks passed.");
  } catch (err) {
    console.error("\n Test failed:", (err as Error).message);
    process.exit(1);
  }
})();
