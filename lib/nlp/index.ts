//lib/nlp/index.ts
import OpenAI from "openai";

// Extra analysis with NLP


export type skillType = { name: string; weight: number };

export type analysis = {
  skills: skillType[]; // up to 20
  contradictions: {
    count: number;
    examples: Array<{ field: string; metadata: string | null; text: string | null }>;
  };
  vagueness: number; // 0..1
  buzzwords: { hits: string[]; count: number };
  comp_period_detected: "hour" | "year" | null;
};




// Helpers 

export function hintBuzzwords(text: string, list: string[] = []) {
  const base = ["rockstar","ninja","guru","synergy","hustle","wear many hats","disrupt","game-changing","wizard"];
  const bag = Array.from(new Set([...base, ...list].map(s => s.toLowerCase())));
  const t = text.toLowerCase();
  const hits = bag.filter(w => t.includes(w));
  return { buzzwords: hits.slice(0, 30) };
}

export function hintCompPeriod(text: string): "hour" | "year" | null {
  const s = text.toLowerCase();
  if (/\b(hourly|\/\s*hr|\$?\d+\s*\/\s*h|\bper\s*hour\b|\bhrly\b)\b/.test(s)) return "hour";
  if (/\b(annual|salary|per\s*yr|per\s*year|\/\s*yr|\/\s*year)\b/.test(s)) return "year";
  return null;
}



const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function analysisWithLLM(
  {
    text,                          // cleaned HTML->text, capped (e.g., 10–20k chars before passing)
    metadata,                      // minimal DB-ish fields to compare (time_type, currency)
    buzzwordList = [],             // your custom buzzwords
    model = "gpt-4o-mini",         // keep small/cheap
    temperature = 0.2
  }: {
    text: string;
    metadata: { time_type?: string|null; currency?: string|null };
    buzzwordList?: string[];
    model?: string;
    temperature?: number;
  }
): Promise<analysis> {

  // ---- build lightweight hints (optional but helpful) ----
  const { buzzwords } = hintBuzzwords(text, buzzwordList);
  const compPeriodHint = hintCompPeriod(text);

  // ---- JSON schema ONLY for insights (small) ----
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      schema_version: { type: "integer", enum: [1] },
      skills: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            weight: { type: "number" } // 0..1 relevance/confidence
          },
          required: ["name","weight"]
        }
      },
      contradictions: {
        type: "object",
        additionalProperties: false,
        properties: {
          count: { type: "integer" },
          examples: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                field: { type: "string" },
                metadata: { type: ["string","null"] },
                text: { type: ["string","null"] }
              },
              required: ["field","metadata","text"]
            }
          }
        },
        required: ["count","examples"]
      },
      vagueness: { type: "number" }, // 0..1
      buzzwords: {
        type: "object",
        additionalProperties: false,
        properties: {
          hits: { type: "array", items: { type: "string" } },
          count: { type: "integer" }
        },
        required: ["hits","count"]
      },
      comp_period_detected: { type: ["string","null"], enum: ["hour","year"] }
    },
    required: ["schema_version","skills","contradictions","vagueness","buzzwords","comp_period_detected"]
  } as const;

  const system = [
    "You extract scoring-only signals from job postings.",
    "Use the provided HINTS to guide you, but verify against the text.",
    "Return ONLY valid JSON matching the schema.",
    "Guidelines:",
    "- skills: up to 20 canonical skills (e.g., 'SQL', 'Python', 'AWS', 'Stakeholder management'), with weight in [0,1].",
    "- contradictions: compare provided metadata vs what TEXT actually says.",
    "- vagueness: scalar 0..1 (0 precise; 1 very vague).",
    "- buzzwords: list and count actual occurrences in text (cross-check given hints).",
    "- comp_period_detected: 'hour' or 'year' if clearly implied; else null."
  ].join("\n");

  const user = JSON.stringify({
    TEXT: text.slice(0, 10_000), // cap to save tokens
    METADATA: { time_type: metadata.time_type ?? null, currency: metadata.currency ?? null },
    HINTS: { buzzword_candidates: buzzwords, comp_period_hint: compPeriodHint }
  });

  const resp = await client.responses.create({
    model,
    temperature,
    input: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    text : {
        format : {
            type: 'json_schema',
            name: 'analysis',
            schema,
            strict: true,

        },
    },
  });

  const parsed = JSON.parse(resp.output_text ?? "{}");

  // Lightweight sanitization
  const coerce = (n: any) => Math.max(0, Math.min(1, Number(n) || 0));
  parsed.schema_version = 1;
  parsed.vagueness = coerce(parsed.vagueness);
  if (!Array.isArray(parsed.skills)) parsed.skills = [];
  parsed.skills = parsed.skills
    .filter((s: any) => typeof s?.name === "string")
    .map((s: any) => ({ name: String(s.name).slice(0,64), weight: coerce(s.weight) }))
    .slice(0, 20);
  if (!parsed.buzzwords || !Array.isArray(parsed.buzzwords.hits)) {
    parsed.buzzwords = { hits: [], count: 0 };
  } else {
    parsed.buzzwords = { hits: parsed.buzzwords.hits.slice(0,50), count: Number(parsed.buzzwords.count || parsed.buzzwords.hits.length) };
  }
  if (!["hour","year",null].includes(parsed.comp_period_detected)) parsed.comp_period_detected = null;
  if (!parsed.contradictions?.examples) parsed.contradictions = { count: 0, examples: [] };

  return parsed as analysis;
}