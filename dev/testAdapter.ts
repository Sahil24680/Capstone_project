// lib/testAdapter.ts
import { adapters, type AtsProvider } from "../lib/adapters";

// WEB normalizer
import {
  htmlToPlainText as webHtmlToPlainText,
  extractWebFeaturesFromText,
  extractWebFeaturesFromJsonLd,
  mergeWebFeatures,
  type WebFeatures,
} from "../lib/normalizers/web";

let ghHtmlToPlainText: ((html: string) => string) | undefined;
let extractGhFeaturesFromMetadata:
  | ((raw: any) => Record<string, any>)
  | undefined;
let extractSalaryFromText:
  | ((text: string, features: Record<string, any>) => void)
  | undefined;

try {
  const gh = require("./normalizers/greenhouse");
  ghHtmlToPlainText = gh.htmlToPlainText;
  extractGhFeaturesFromMetadata = gh.extractGhFeaturesFromMetadata;
  extractSalaryFromText = gh.extractSalaryFromText;
} catch {
}

function usageAndExit(): never {
  console.error(
    "Usage:\n" +
      "  greenhouse: tsx lib/testAdapter.ts greenhouse <tenant> <jobId>\n" +
      "  web:        tsx lib/testAdapter.ts web '<url>'"
  );
  process.exit(1);
}

async function main() {
  const [arg1, arg2, arg3] = process.argv.slice(2);

  if (!arg1) usageAndExit();

  let job: any;

  if (arg1 === "web") {
    const url = arg2;
    if (!url) usageAndExit();
    if (!adapters.web) throw new Error("Web adapter not registered");
    job = await adapters.web(url);

    const text = webHtmlToPlainText(job?.content ?? "");
    const textFeatures = extractWebFeaturesFromText(text) as WebFeatures;
    const jsonldFeatures = extractWebFeaturesFromJsonLd(job?.raw_json?.jsonld) as WebFeatures;

    const features = mergeWebFeatures(jsonldFeatures, textFeatures);
    console.log({ ...job, features });
    return;
  }

  // Otherwise assume greenhouse
  if (arg1 === "greenhouse") {
    const tenant = arg2;
    const jobId = arg3;
    if (!tenant || !jobId) usageAndExit();
    if (!adapters.greenhouse) throw new Error("Greenhouse adapter not registered");

    job = await adapters.greenhouse(tenant, jobId);

  
    let features: Record<string, any> = {};
    try {
      if (extractGhFeaturesFromMetadata) {
        const meta = extractGhFeaturesFromMetadata(job?.raw_json);
        if (meta && typeof meta === "object") {
          features = { ...features, ...meta };
        }
      }
      if (extractSalaryFromText) {
        const toText =
          ghHtmlToPlainText ??
          webHtmlToPlainText;
        const text = toText(job?.content ?? job?.raw_json?.content ?? "");
        extractSalaryFromText(text, features);
      }
    } catch {
    }

    console.log({ ...job, features });
    return;
  }

  {
    const tenant = arg1;
    const jobId = arg2;
    if (!tenant || !jobId) usageAndExit();
    if (!adapters.greenhouse) throw new Error("Greenhouse adapter not registered");

    job = await adapters.greenhouse(tenant, jobId);

    let features: Record<string, any> = {};
    try {
      if (extractGhFeaturesFromMetadata) {
        const meta = extractGhFeaturesFromMetadata(job?.raw_json);
        if (meta && typeof meta === "object") {
          features = { ...features, ...meta };
        }
      }
      if (extractSalaryFromText) {
        const toText =
          ghHtmlToPlainText ??
          webHtmlToPlainText;
        const text = toText(job?.content ?? job?.raw_json?.content ?? "");
        extractSalaryFromText(text, features);
      }
    } catch {
    }

    console.log({ ...job, features });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
