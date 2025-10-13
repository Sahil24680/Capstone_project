// dev/testWebJsonLd.ts

/**
 * UNIT TEST -- NOT AN INTEGRATION TEST
 * USAGE: npx tsx dev/testWebText.ts
 */

import { extractWebFeaturesFromText } from "../lib/normalizers/web";

function runCase(label: string, text: string, expected: any) {
  const features = extractWebFeaturesFromText(text);

  console.log(`\nCase: ${label}`);
  console.log("features:", features);

  if (expected.salary_min && features.salary_min !== expected.salary_min) {
    console.error(`salary_min expected ${expected.salary_min}, got ${features.salary_min}`);
  }
  if (expected.salary_max && features.salary_max !== expected.salary_max) {
    console.error(`salary_max expected ${expected.salary_max}, got ${features.salary_max}`);
  }
  if (expected.salary_mid && features.salary_mid !== expected.salary_mid) {
    console.error(`salary_mid expected ${expected.salary_mid}, got ${features.salary_mid}`);
  }
}

runCase(
  "Range with $",
  "Compensation: $20 - $30 per hour.",
  { salary_min: 20, salary_max: 30, salary_mid: 25 }
);

runCase(
  "Range with k",
  "Base salary: 100k - 150k annually",
  { salary_min: 100000, salary_max: 150000, salary_mid: 125000 }
);

runCase(
  "Single hourly",
  "Hourly pay: $19.30",
  { salary_min: 19.3, salary_max: 19.3, salary_mid: 19.3 }
);
