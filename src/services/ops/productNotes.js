const { pool } = require('../../db/pool');
const { ensureOpsTables } = require('./store');

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function normalizePriority(value) {
  const safe = normalizeValue(value).toLowerCase();
  if (['low', 'normal', 'high', 'critical'].includes(safe)) {
    return safe;
  }

  return 'normal';
}

function normalizeNoteType(value) {
  const safe = normalizeValue(value).toLowerCase();
  if (['change', 'bug', 'ux', 'feature', 'content', 'infra', 'voice_memo'].includes(safe)) {
    return safe;
  }

  return 'change';
}

function normalizeStatus(value) {
  const safe = normalizeValue(value).toLowerCase();
  if (['open', 'planned', 'done', 'archived'].includes(safe)) {
    return safe;
  }

  return 'open';
}

async function createProductNote(input) {
  await ensureOpsTables();

  const result = await pool.query(
    `
      INSERT INTO ops_product_notes (
        source,
        note_type,
        status,
        priority,
        title,
        body,
        transcript_text,
        target_release,
        created_by_chat_id,
        details_json,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
      RETURNING *
    `,
    [
      normalizeValue(input?.source) || 'telegram',
      normalizeNoteType(input?.noteType),
      normalizeStatus(input?.status),
      normalizePriority(input?.priority),
      normalizeValue(input?.title) || 'Untitled product note',
      normalizeValue(input?.body) || 'No details provided',
      normalizeValue(input?.transcriptText) || null,
      normalizeValue(input?.targetRelease) || null,
      normalizeValue(input?.createdByChatId) || null,
      normalizeJson(input?.details)
    ]
  );

  return result.rows[0] || null;
}

async function listProductNotes(limit = 10, options = {}) {
  await ensureOpsTables();

  const safeLimit = Math.max(1, Math.min(Number(limit || 10) || 10, 50));
  const onlyOpen = options?.onlyOpen !== false;
  const result = await pool.query(
    `
      SELECT *
      FROM ops_product_notes
      ${onlyOpen ? "WHERE resolved_at IS NULL AND status IN ('open', 'planned')" : ''}
      ORDER BY updated_at DESC, id DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

function buildProductNotesMarkdown(notes) {
  const lines = [
    '# Next Release Notes',
    '',
    '> Generated from `ops_product_notes`.',
    ''
  ];

  if (!Array.isArray(notes) || notes.length === 0) {
    lines.push('No open notes right now.');
    lines.push('');
    return lines.join('\n');
  }

  for (const note of notes) {
    lines.push(`## ${normalizeValue(note.title) || 'Untitled note'}`);
    lines.push(`- type: ${normalizeNoteType(note.note_type)}`);
    lines.push(`- priority: ${normalizePriority(note.priority)}`);
    lines.push(`- status: ${normalizeStatus(note.status)}`);

    if (normalizeValue(note.target_release)) {
      lines.push(`- target_release: ${normalizeValue(note.target_release)}`);
    }

    lines.push('');
    lines.push(normalizeValue(note.body) || 'No details provided.');

    if (normalizeValue(note.transcript_text)) {
      lines.push('');
      lines.push('Transcript:');
      lines.push(normalizeValue(note.transcript_text));
    }

    lines.push('');
  }

  return lines.join('\n');
}

module.exports = {
  buildProductNotesMarkdown,
  createProductNote,
  listProductNotes
};
