const { fetch } = require('undici');
const env = require('../../config/env');

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

function normalizeValue(value) {
  return String(value || '').trim();
}

function buildOpenAiHeaders() {
  const headers = {
    Authorization: `Bearer ${normalizeValue(env.OPENAI_API_KEY)}`,
    'Content-Type': 'application/json'
  };

  if (normalizeValue(env.OPENAI_ORG_ID)) {
    headers['OpenAI-Organization'] = normalizeValue(env.OPENAI_ORG_ID);
  }

  if (normalizeValue(env.OPENAI_PROJECT_ID)) {
    headers['OpenAI-Project'] = normalizeValue(env.OPENAI_PROJECT_ID);
  }

  return headers;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const chunk of content) {
      const text = normalizeValue(chunk?.text || chunk?.output_text);
      if (text) parts.push(text);
    }
  }

  return parts.join('\n').trim();
}

async function generateApplyPlan(repoKey, workOrder, fileSnapshots) {
  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: buildOpenAiHeaders(),
    body: JSON.stringify({
      model: normalizeValue(env.OPENAI_CODEX_MODEL) || 'gpt-5-codex',
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'You are an exacting remote coding runner. Work only from the provided work order and file snapshots. Do not invent files or architecture outside the supplied content. If the task is too ambiguous or unsafe, return outcome=blocked with a precise blockedReason. Otherwise return minimal production-ready code changes with full updated contents for changed files only.'
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                repoKey,
                workOrder,
                allowedPaths: fileSnapshots.map((item) => item.path),
                fileSnapshots
              })
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'remote_runner_apply_result',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['outcome', 'summary', 'commitMessage', 'blockedReason', 'changes', 'verificationHints'],
            properties: {
              outcome: {
                type: 'string',
                enum: ['apply', 'blocked']
              },
              summary: {
                type: 'string'
              },
              commitMessage: {
                type: 'string'
              },
              blockedReason: {
                anyOf: [{ type: 'string' }, { type: 'null' }]
              },
              verificationHints: {
                type: 'array',
                items: {
                  type: 'string'
                }
              },
              changes: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['path', 'content', 'rationale'],
                  properties: {
                    path: { type: 'string' },
                    content: { type: 'string' },
                    rationale: { type: 'string' }
                  }
                }
              }
            }
          },
          strict: true
        }
      },
      reasoning: {
        effort: 'medium'
      },
      max_output_tokens: 16000
    })
  });

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI request failed with status ${response.status}`);
  }

  const text = extractResponseText(payload);
  if (!text) {
    throw new Error('OpenAI returned empty apply plan');
  }

  return JSON.parse(text);
}

function validateChanges(plan, allowedPaths) {
  const allowed = new Set(allowedPaths);
  const changes = Array.isArray(plan?.changes) ? plan.changes : [];

  return changes.map((change) => {
    const safePath = normalizeValue(change?.path).replace(/^\/+/, '');
    if (!allowed.has(safePath)) {
      throw new Error(`Runner refused to modify non-allowed path: ${safePath || '<empty>'}`);
    }

    return {
      path: safePath,
      content: String(change?.content || '')
    };
  });
}

module.exports = {
  generateApplyPlan,
  validateChanges
};
