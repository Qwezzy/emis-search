/**
 * EMIS Search – Bedrock AI Lambda
 *
 * Handles two actions:
 *   1. "parse"  – converts a natural-language query into structured filters
 *   2. "chat"   – answers a free-form question about the school data
 *
 * Environment variables:
 *   BEDROCK_REGION   – AWS region (default: us-east-1)
 *   MODEL_ID         – Bedrock model ID (default: Claude 3 Haiku)
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const REGION = process.env.BEDROCK_REGION ?? "us-east-1";
const MODEL_ID =
  process.env.MODEL_ID ?? "anthropic.claude-3-haiku-20240307-v1:0";

const client = new BedrockRuntimeClient({ region: REGION });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROVINCES = {
  EC: "Eastern Cape", FS: "Free State", GT: "Gauteng", KZN: "KwaZulu-Natal",
  LP: "Limpopo", MP: "Mpumalanga", NC: "Northern Cape", NW: "North West", WC: "Western Cape",
};

const PARSE_SYSTEM = `You are a search-filter parser for the South African national schools register (EMIS).

Your job is to read a user's natural-language query and return a JSON object that maps to the available filter fields. Return ONLY valid JSON – no explanation, no markdown fences.

Available filter fields and their valid values:
- "p"  : province code – one of: ${Object.keys(PROVINCES).join(", ")} (${Object.entries(PROVINCES).map(([k,v])=>`${k}=${v}`).join(", ")})
- "ph" : school phase – one of: "Primary School", "Secondary School", "Combined School", "Special Needs Education School"
- "se" : sector – "P" for public, "I" for independent/private
- "q"  : quintile – one of: "Q1", "Q2", "Q3", "Q4", "Q5"
- "f"  : fee status – "0" for no-fee school, "1" for fee-charging
- "u"  : setting – "0" for rural, "1" for urban
- "freeText": any remaining search term (name, town, district, EMIS number) that doesn't map to the above filters

Rules:
- Only include fields that the query clearly implies.
- If the user mentions a place name that could be a town/district (not a province), put it in "freeText".
- For quintile: Q1 is the poorest, Q5 is the least poor. "poor" or "low quintile" → Q1. "wealthy" or "affluent" → Q5.
- "no-fee" or "free school" → f: "0". "fee-paying" → f: "1". "private" or "independent" → se: "I".
- Return {} if no filters can be confidently extracted.

Examples:
  Query: "rural no-fee primary schools in Eastern Cape"
  Response: {"p":"EC","ph":"Primary School","f":"0","u":"0"}

  Query: "Gauteng secondary schools with high quintile"
  Response: {"p":"GT","ph":"Secondary School","q":"Q5"}

  Query: "Bizana schools"
  Response: {"freeText":"Bizana"}

  Query: "full service schools in Limpopo"
  Response: {"p":"LP","freeText":"full service"}
`;

const CHAT_SYSTEM = `You are a helpful assistant for the South African national EMIS schools register.
You help users understand school data, interpret statistics, and navigate the register.

The register contains ~25,000 public and independent schools across all 9 provinces.
Key data fields per school: name, EMIS number, province, phase (primary/secondary/combined),
sector (public/independent), quintile (Q1=poorest to Q5=least poor), fee status,
urban/rural setting, learner count, educator count, district, municipality, address, coordinates.

Be concise and factual. If asked something you cannot answer from general knowledge of South African
schools or the data description above, say so clearly rather than guessing.`;

async function invokeClaude(system, userMsg, maxTokens = 512) {
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMsg }],
  });

  const cmd = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body,
  });

  const response = await client.send(cmd);
  const parsed = JSON.parse(Buffer.from(response.body).toString("utf-8"));
  return parsed.content?.[0]?.text ?? "";
}

async function handleParse(query) {
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return { filters: {}, freeText: "", rawQuery: query };
  }

  const raw = await invokeClaude(PARSE_SYSTEM, query.trim(), 256);

  let parsed;
  try {
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { filters: {}, freeText: query.trim(), rawQuery: query, parseError: raw };
  }

  const { freeText, ...filters } = parsed;
  return { filters, freeText: freeText ?? "", rawQuery: query };
}

async function handleChat(message, context) {
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    throw new Error("message is required");
  }

  let userMsg = message.trim();

  if (context && typeof context === "object") {
    userMsg = `Context about the user's current view:\n${JSON.stringify(context, null, 2)}\n\nUser question: ${userMsg}`;
  }

  const text = await invokeClaude(CHAT_SYSTEM, userMsg, 1024);
  return { answer: text };
}

export const handler = async (event) => {
  // Handle CORS preflight
  const method = event.requestContext?.http?.method ?? event.httpMethod;
  if (method === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body ?? {});
    const { action, query, message, context } = body;

    let result;

    switch (action) {
      case "parse":
        result = await handleParse(query);
        break;
      case "chat":
        result = await handleChat(message, context);
        break;
      default:
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ error: `Unknown action: "${action}". Use "parse" or "chat".` }),
        };
    }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("Lambda error:", err);
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message ?? "Internal server error" }),
    };
  }
};
