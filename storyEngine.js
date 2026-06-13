// storyEngine.js — Now a thin compatibility layer.
// The actual story generation is handled by getUnifiedAIResponse() in aiInsight.js.
// These functions are kept for backward compatibility but are no longer called individually.

async function generateStory(summary, anomalies) {
  // Deprecated: use getUnifiedAIResponse() instead.
  console.warn('generateStory() is deprecated. Use getUnifiedAIResponse() for single-call AI.');
  return { setup: '', conflict: '', resolution: '' };
}

async function generateTitle(summary, anomalies) {
  // Deprecated: use getUnifiedAIResponse() instead.
  console.warn('generateTitle() is deprecated. Use getUnifiedAIResponse() for single-call AI.');
  return '';
}
