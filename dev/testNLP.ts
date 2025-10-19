// dev/testNLP.ts

import { scoreItems } from "../lib/scoring/nlp";

(async () => {
  try{
  const data = await scoreItems(
   // "https://jobs.nyulangone.org/job/22543655/ultrasound-technician-fgp-brooklyn-brooklyn-ny/?utm_campaign=google_jobs_apply&utm_source=google_jobs_apply&utm_medium=organic"
    //"https://www.disneycareers.com/en/job/lake-buena-vista/senior-manager-electric-operations/391/87376529808"
    //"https://explore.jobs.netflix.net/careers?pid=790304901333&domain=netflix.com&sort_by=relevance"
     "https://job-boards.greenhouse.io/doordashusa/jobs/7258239"
  );

  if (!data) {
    console.log("not fetched :(");
    return;
  }

  console.log("Combined features:");
  console.dir(data, { depth: null });

  // upsert `data` into job_features here
} catch (error) {
    console.error("Test failed to score item.");
    console.error(error);
  }
})();
