// app/scoring/nlp.ts
import { analyzeAdapterJob, Combined, pickContent } from "@/lib/nlp/client"; 
import { analysis, analysisWithLLM } from "@/lib/nlp/index";           
import { htmlToPlainText } from "@/lib/normalizers/greenhouse";        
import type { AdapterJob } from "@/lib/adapters/types";      


export type scoringTypes = {
    featuresNormalized: Partial<Combined>; 
    analysis: analysis;                     
};

export async function analyzeAndScoreJob(jobData: AdapterJob): Promise<scoringTypes> {
    
    // This gives us the database fields 
    const features: Combined = await analyzeAdapterJob(jobData);

    // Re-extract the clean text from the job object for the second LLM call.
    const html = pickContent(jobData); 
    const plainText = htmlToPlainText(html)


    const analysisResult = await analysisWithLLM({
        text: plainText,
        metadata: {
            time_type: features.time_type ?? null,
            currency: (features.currency ?? null) as string | null,
        },
    });

    return {
        featuresNormalized: features,
        analysis: analysisResult,
    };
}