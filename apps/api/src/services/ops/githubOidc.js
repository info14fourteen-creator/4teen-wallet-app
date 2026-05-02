const { createRemoteJWKSet, jwtVerify } = require('jose');
const env = require('../../config/env');

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_AUDIENCE = env.OPS_GITHUB_OIDC_AUDIENCE || '4teen-ops-runner';
const GITHUB_OIDC_JWKS = createRemoteJWKSet(new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`));

function normalizeValue(value) {
  return String(value || '').trim();
}

function resolveRepositoryForRepoKey(repoKey) {
  const owner = normalizeValue(env.GITHUB_REMOTE_OWNER) || 'info14fourteen-creator';
  const safeRepoKey = normalizeValue(repoKey).toLowerCase();
  const repoName =
    safeRepoKey === 'website'
      ? normalizeValue(env.GITHUB_WEBSITE_REPO) || '4teen-website'
      : normalizeValue(env.GITHUB_WALLET_REPO) || '4teen-wallet-app';

  return `${owner}/${repoName}`;
}

function inferRepoKeyFromRepository(repository) {
  const safe = normalizeValue(repository).toLowerCase();
  const website = resolveRepositoryForRepoKey('website').toLowerCase();
  const walletApp = resolveRepositoryForRepoKey('wallet-app').toLowerCase();

  if (safe === website) {
    return 'website';
  }

  if (safe === walletApp) {
    return 'wallet-app';
  }

  return '';
}

function readWorkflowClaim(payload) {
  return normalizeValue(payload?.job_workflow_ref || payload?.workflow_ref || payload?.workflow || '');
}

async function verifyGithubActionsOidcToken(token, options = {}) {
  const safeToken = normalizeValue(token);
  if (!safeToken) {
    const error = new Error('Missing GitHub Actions OIDC token');
    error.status = 401;
    throw error;
  }

  const { payload } = await jwtVerify(safeToken, GITHUB_OIDC_JWKS, {
    issuer: GITHUB_OIDC_ISSUER,
    audience: GITHUB_OIDC_AUDIENCE
  });

  const repository = normalizeValue(payload?.repository);
  const repoKey = inferRepoKeyFromRepository(repository);
  const expectedRepoKey = normalizeValue(options?.repoKey).toLowerCase();
  const workflowClaim = readWorkflowClaim(payload);
  const ref = normalizeValue(payload?.ref);

  if (!repoKey) {
    const error = new Error('GitHub Actions token is not from an allowed repository');
    error.status = 403;
    throw error;
  }

  if (expectedRepoKey && repoKey !== expectedRepoKey) {
    const error = new Error(`GitHub Actions token repo mismatch: expected ${expectedRepoKey}, got ${repoKey}`);
    error.status = 403;
    throw error;
  }

  if (workflowClaim && !/\.github\/workflows\/ops-remote-runner\.yml@/i.test(workflowClaim)) {
    const error = new Error('GitHub Actions token is not from the ops remote runner workflow');
    error.status = 403;
    throw error;
  }

  if (ref && !/refs\/heads\/main$/i.test(ref)) {
    const error = new Error('GitHub Actions token is not from the main branch workflow');
    error.status = 403;
    throw error;
  }

  return {
    kind: 'github-runner',
    repoKey,
    repository,
    workflowRef: workflowClaim || null,
    subject: normalizeValue(payload?.sub) || null,
    ref: ref || null,
    rawClaims: payload
  };
}

module.exports = {
  GITHUB_OIDC_AUDIENCE,
  inferRepoKeyFromRepository,
  resolveRepositoryForRepoKey,
  verifyGithubActionsOidcToken
};
