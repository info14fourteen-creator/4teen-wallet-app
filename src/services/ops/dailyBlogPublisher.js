const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const env = require('../../config/env');
const { recordOpsEvent, resolveOpsEvent, writeOpsHeartbeat } = require('./events');
const { getRuntimeState, setRuntimeState } = require('./store');

const STATE_KEY = 'website_blog_daily_publish';
const TARGET_EVENT = {
  source: 'website-blog',
  category: 'content',
  type: 'blog_publish_failed',
  title: 'Daily website blog publish failed'
};

function normalizeValue(value) {
  return String(value || '').trim();
}

function isEnabled() {
  return normalizeValue(env.WEBSITE_BLOG_AUTOPUBLISH_ENABLED).toLowerCase() === 'true';
}

function hasDispatchConfig() {
  return Boolean(
    isEnabled() &&
      normalizeValue(env.GITHUB_REMOTE_TOKEN) &&
      normalizeValue(env.GITHUB_REMOTE_OWNER) &&
      normalizeValue(env.GITHUB_WEBSITE_REPO) &&
      normalizeValue(env.OPENAI_API_KEY) &&
      normalizeValue(env.DATABASE_URL) &&
      normalizeValue(env.OPS_REMOTE_CLOUDFLARE_API_TOKEN)
  );
}

function getTimeParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year || 0),
    month: Number(lookup.month || 0),
    day: Number(lookup.day || 0),
    hour: Number(lookup.hour || 0),
    minute: Number(lookup.minute || 0),
    second: Number(lookup.second || 0)
  };
}

function buildDateKey(parts) {
  const year = String(parts.year).padStart(4, '0');
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hasReachedTarget(parts) {
  const targetHour = Number(env.WEBSITE_BLOG_DAILY_HOUR);
  const targetMinute = Number(env.WEBSITE_BLOG_DAILY_MINUTE);

  if (parts.hour > targetHour) {
    return true;
  }

  if (parts.hour < targetHour) {
    return false;
  }

  return parts.minute >= targetMinute;
}

function findNextTargetDate(now = new Date()) {
  const timeZone = normalizeValue(env.WEBSITE_BLOG_DAILY_TIMEZONE) || 'Asia/Tashkent';
  const targetHour = Number(env.WEBSITE_BLOG_DAILY_HOUR);
  const targetMinute = Number(env.WEBSITE_BLOG_DAILY_MINUTE);

  let probe = new Date(now.getTime());
  probe.setUTCSeconds(0, 0);
  probe = new Date(probe.getTime() + 60_000);

  for (let index = 0; index < 60 * 48; index += 1) {
    const parts = getTimeParts(probe, timeZone);
    if (parts.hour === targetHour && parts.minute === targetMinute) {
      return probe;
    }
    probe = new Date(probe.getTime() + 60_000);
  }

  throw new Error(`Could not find next target time for ${timeZone}`);
}

function buildDispatchPayload() {
  return {
    databaseUrl: normalizeValue(env.DATABASE_URL),
    openAiApiKey: normalizeValue(env.OPENAI_API_KEY),
    openAiOrgId: normalizeValue(env.OPENAI_ORG_ID),
    openAiProjectId: normalizeValue(env.OPENAI_PROJECT_ID),
    cloudflareApiToken: normalizeValue(env.OPS_REMOTE_CLOUDFLARE_API_TOKEN),
    feedUrl: normalizeValue(env.WEBSITE_BLOG_FEED_URL),
    triageModel: normalizeValue(env.WEBSITE_BLOG_TRIAGE_MODEL),
    analysisModel: normalizeValue(env.WEBSITE_BLOG_ANALYSIS_MODEL),
    writerModel: normalizeValue(env.WEBSITE_BLOG_WRITER_MODEL),
    writerEffort: normalizeValue(env.WEBSITE_BLOG_WRITER_EFFORT),
    metadataModel: normalizeValue(env.WEBSITE_BLOG_METADATA_MODEL),
    imageMode: normalizeValue(env.WEBSITE_BLOG_IMAGE_MODE),
    scanArticles: Number(env.WEBSITE_BLOG_SCAN_ARTICLES),
    deepAnalysisArticles: Number(env.WEBSITE_BLOG_DEEP_ANALYSIS_ARTICLES),
    maxArticles: Number(env.WEBSITE_BLOG_MAX_ARTICLES),
    lookbackHours: Number(env.WEBSITE_BLOG_LOOKBACK_HOURS),
    signature: normalizeValue(env.WEBSITE_BLOG_SIGNATURE) || 'Stan At, 4teen Founder'
  };
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...(options.env || {})
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const message = stderr.trim() || stdout.trim() || `${command} exited with code ${code}`;
      reject(new Error(message));
    });
  });
}

async function prepareWebsiteWorkspace() {
  const rootDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), '4teen-website-publish-'));
  const archivePath = path.join(rootDir, 'website.tar.gz');
  const repoDir = path.join(rootDir, 'repo');

  await fsPromises.mkdir(repoDir, { recursive: true });

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(normalizeValue(env.GITHUB_REMOTE_OWNER))}/${encodeURIComponent(normalizeValue(env.GITHUB_WEBSITE_REPO))}/tarball/main`,
    {
      headers: {
        Authorization: `Bearer ${normalizeValue(env.GITHUB_REMOTE_TOKEN)}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': '4teen-heroku-clock'
      }
    }
  );

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new Error(`Could not download website archive: ${response.status}${text ? ` ${text}` : ''}`);
  }

  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(archivePath));
  await runCommand('tar', ['-xzf', archivePath, '-C', repoDir, '--strip-components=1']);

  return {
    rootDir,
    repoDir
  };
}

async function ensurePnpmAvailable() {
  await runCommand('bash', [
    '-lc',
    [
      'if command -v pnpm >/dev/null 2>&1; then',
      '  pnpm --version',
      'elif command -v corepack >/dev/null 2>&1; then',
      '  corepack enable >/dev/null 2>&1 || true',
      '  corepack prepare pnpm@10.33.0 --activate >/dev/null 2>&1',
      '  pnpm --version',
      'else',
      '  npm install --global pnpm@10.33.0 >/dev/null 2>&1',
      '  pnpm --version',
      'fi'
    ].join('\n')
  ]);
}

async function runWebsitePublisher({ trigger, localDate, timeZone }) {
  const workspace = await prepareWebsiteWorkspace();
  const publishEnv = {
    DATABASE_URL: normalizeValue(env.DATABASE_URL),
    BLOG_DATABASE_URL: normalizeValue(env.DATABASE_URL),
    OPENAI_API_KEY: normalizeValue(env.OPENAI_API_KEY),
    OPENAI_ORG_ID: normalizeValue(env.OPENAI_ORG_ID),
    OPENAI_PROJECT_ID: normalizeValue(env.OPENAI_PROJECT_ID),
    CLOUDFLARE_API_TOKEN: normalizeValue(env.OPS_REMOTE_CLOUDFLARE_API_TOKEN),
    DAILY_DIGEST_FEED_URL: normalizeValue(env.WEBSITE_BLOG_FEED_URL),
    DAILY_DIGEST_TRIAGE_MODEL: normalizeValue(env.WEBSITE_BLOG_TRIAGE_MODEL),
    DAILY_DIGEST_ANALYSIS_MODEL: normalizeValue(env.WEBSITE_BLOG_ANALYSIS_MODEL),
    DAILY_DIGEST_WRITER_MODEL: normalizeValue(env.WEBSITE_BLOG_WRITER_MODEL),
    DAILY_DIGEST_WRITER_EFFORT: normalizeValue(env.WEBSITE_BLOG_WRITER_EFFORT),
    DAILY_DIGEST_METADATA_MODEL: normalizeValue(env.WEBSITE_BLOG_METADATA_MODEL),
    DAILY_DIGEST_IMAGE_MODE: normalizeValue(env.WEBSITE_BLOG_IMAGE_MODE),
    DAILY_DIGEST_SCAN_ARTICLES: String(env.WEBSITE_BLOG_SCAN_ARTICLES),
    DAILY_DIGEST_DEEP_ANALYSIS_ARTICLES: String(env.WEBSITE_BLOG_DEEP_ANALYSIS_ARTICLES),
    DAILY_DIGEST_MAX_ARTICLES: String(env.WEBSITE_BLOG_MAX_ARTICLES),
    DAILY_DIGEST_LOOKBACK_HOURS: String(env.WEBSITE_BLOG_LOOKBACK_HOURS),
    DAILY_DIGEST_SIGNATURE: normalizeValue(env.WEBSITE_BLOG_SIGNATURE),
    BLOG_ADMIN_CHAT_ID: '',
    DIGEST_ADMIN_CHAT_ID: '',
    CI: 'true'
  };

  try {
    await ensurePnpmAvailable();
    await runCommand('pnpm', ['install', '--frozen-lockfile'], {
      cwd: workspace.repoDir,
      env: publishEnv
    });

    await runCommand('pnpm', ['blog:daily-digest', '--skip-notify'], {
      cwd: workspace.repoDir,
      env: publishEnv
    });

    await setRuntimeState(STATE_KEY, {
      localDate,
      publishedAt: new Date().toISOString(),
      trigger,
      timeZone
    });

    await writeOpsHeartbeat('website_blog.daily_publish', {
      status: 'published',
      localDate,
      trigger,
      timeZone
    }).catch(() => null);
  } finally {
    await fsPromises.rm(workspace.rootDir, { recursive: true, force: true }).catch(() => null);
  }
}

async function publishWebsiteArticle(context) {
  const { trigger, localDate, timeZone } = context;

  console.info('[airdrop-clock] daily blog publish started', {
    trigger,
    localDate,
    timeZone
  });

  await runWebsitePublisher({ trigger, localDate, timeZone });

  console.info('[airdrop-clock] daily blog publish completed', {
    trigger,
    localDate,
    timeZone
  });
}

async function dispatchWorkflow() {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(normalizeValue(env.GITHUB_REMOTE_OWNER))}/${encodeURIComponent(normalizeValue(env.GITHUB_WEBSITE_REPO))}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${normalizeValue(env.GITHUB_REMOTE_TOKEN)}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': '4teen-heroku-clock'
      },
      body: JSON.stringify({
        event_type: 'daily-blog-publish',
        client_payload: buildDispatchPayload()
      })
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub dispatch failed with status ${response.status}${text ? `: ${text}` : ''}`);
  }
}

async function maybeDispatchDailyBlogPublish(trigger = 'clock') {
  const timeZone = normalizeValue(env.WEBSITE_BLOG_DAILY_TIMEZONE) || 'Asia/Tashkent';
  const now = new Date();
  const nowParts = getTimeParts(now, timeZone);
  const localDate = buildDateKey(nowParts);
  const lastDispatchRow = await getRuntimeState(STATE_KEY).catch(() => null);
  const lastDispatch = lastDispatchRow?.value_json && typeof lastDispatchRow.value_json === 'object'
    ? lastDispatchRow.value_json
    : {};

  if (!isEnabled()) {
    return {
      ok: true,
      skipped: true,
      reason: 'disabled',
      localDate
    };
  }

  if (!hasDispatchConfig()) {
    const error = new Error('Daily blog publish is enabled but dispatch config is incomplete');
    await recordOpsEvent({
      ...TARGET_EVENT,
      severity: 'warning',
      message: error.message,
      details: {
        trigger,
        localDate,
        timeZone
      }
    }).catch(() => null);
    throw error;
  }

  if (normalizeValue(lastDispatch.localDate) === localDate) {
    return {
      ok: true,
      skipped: true,
      reason: 'already_dispatched_today',
      localDate
    };
  }

  if (!hasReachedTarget(nowParts)) {
    return {
      ok: true,
      skipped: true,
      reason: 'before_target_time',
      localDate
    };
  }

  try {
    await publishWebsiteArticle({ trigger, localDate, timeZone });
    await resolveOpsEvent({
      ...TARGET_EVENT,
      message: `Daily website blog publish recovered for ${localDate}`
    }).catch(() => null);

    return {
      ok: true,
      skipped: false,
      localDate
    };
  } catch (error) {
    await recordOpsEvent({
      ...TARGET_EVENT,
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
      details: {
        trigger,
        localDate,
        timeZone
      }
    }).catch(() => null);
    await writeOpsHeartbeat('website_blog.daily_publish', {
      status: 'error',
      localDate,
      trigger,
      timeZone,
      error: error instanceof Error ? error.message : String(error)
    }).catch(() => null);
    throw error;
  }
}

function scheduleDailyBlogPublish() {
  async function scheduleNext() {
    let nextRun;

    try {
      nextRun = findNextTargetDate(new Date());
    } catch (error) {
      console.error('[airdrop-clock] could not schedule website blog publish', {
        error: error instanceof Error ? error.message : String(error)
      });
      setTimeout(() => {
        void scheduleNext();
      }, 10 * 60 * 1000);
      return;
    }

    const delayMs = Math.max(5_000, nextRun.getTime() - Date.now());
    console.info('[airdrop-clock] next website blog publish scheduled', {
      nextRun: nextRun.toISOString(),
      inMinutes: Math.round(delayMs / 60_000)
    });

    setTimeout(async () => {
      try {
        await maybeDispatchDailyBlogPublish('scheduled');
      } catch (error) {
        console.error('[airdrop-clock] scheduled website blog publish failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        void scheduleNext();
      }
    }, delayMs);
  }

  setTimeout(() => {
    void maybeDispatchDailyBlogPublish('startup').catch((error) => {
      console.error('[airdrop-clock] startup website blog publish check failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }, 20_000);

  void scheduleNext();
}

module.exports = {
  hasDailyBlogPublishDispatchConfig: hasDispatchConfig,
  maybeDispatchDailyBlogPublish,
  scheduleDailyBlogPublish
};
