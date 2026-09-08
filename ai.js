/**
 * ai.js  –  Frontend AI integration for EMIS Search
 *
 * Set AI_ENDPOINT to your API Gateway URL after deploying the Lambda.
 * Leave it as "" to disable AI features gracefully (app still works normally).
 */

// Replace with your actual API Gateway endpoint after deployment.
// e.g. "https://abc123.execute-api.us-east-1.amazonaws.com/prod/ai"
const AI_ENDPOINT = "";

async function callLambda(payload) {
  if (!AI_ENDPOINT) {
    throw new Error("AI_ENDPOINT is not configured. Set it in ai.js after deploying the Lambda.");
  }
  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lambda returned ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Parse a natural-language query into EMIS filter fields.
 *
 * @param {string} query  e.g. "rural no-fee primary schools in Eastern Cape"
 * @returns {Promise<{filters: object, freeText: string, rawQuery: string}>}
 *
 * filters keys match the select element IDs in index.html:
 *   p → fProv, ph → fPhase, se → fSector, q → fQ, f → fFee, u → fUrban
 * freeText goes into the #q search input.
 */
export async function aiParse(query) {
  return callLambda({ action: "parse", query });
}

/**
 * Ask a free-form question about South African schools.
 *
 * @param {string} message   The user's question
 * @param {object} [context] Optional context (e.g. current filter state)
 * @returns {Promise<{answer: string}>}
 */
export async function aiChat(message, context) {
  return callLambda({ action: "chat", message, context });
}

/**
 * Returns true if an AI endpoint has been configured.
 * Used by app.js to show/hide the AI search bar.
 */
export function aiAvailable() {
  return Boolean(AI_ENDPOINT);
}
