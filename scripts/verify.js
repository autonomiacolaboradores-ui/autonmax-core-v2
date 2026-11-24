'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PromptPin } = require('../core/ai/PromptPin');
const { buildWeb } = require('./build_web');

const VNEXT_ROOT = path.resolve(__dirname, '..');

function collectJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function runPromptPinCheck() {
  const promptPin = new PromptPin();
  const res = promptPin.verifyAtBoot({ strict: true });
  console.log(`[verify 1/4] PromptPin OK (sha256=${res.sha256.slice(0, 16)}...)`);
}

function runStaticBoundaryAudit() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(VNEXT_ROOT, 'package.json'), 'utf8')
  );
  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };
  const forbiddenDeps = [
    'better-sqlite3',
    'sqlite3',
    'puppeteer',
    'openai',
    '@google/generative-ai',
    'groq-sdk',
    '@anthropic-ai/sdk',
    'express',
    'fastify',
  ];
  for (const dep of forbiddenDeps) {
    if (Object.prototype.hasOwnProperty.call(allDeps, dep)) {
      throw new Error(`Forbidden dependency in package.json: ${dep}`);
    }
  }

  const coreJsFiles = collectJsFiles(path.join(VNEXT_ROOT, 'core'));
  const forbiddenImportRe =
    /\brequire\s*\(\s*['"](?:better-sqlite3|sqlite3|puppeteer|express|fastify|openai|@google\/generative-ai)['"]\s*\)/;
  const rawSqlRe =
    /\b(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i;

  for (const filePath of coreJsFiles) {
    const rel = path.relative(VNEXT_ROOT, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf8');

    if (forbiddenImportRe.test(content)) {
      throw new Error(`Forbidden require() found in ${rel}`);
    }

    const isRepoOrMigration =
      rel.startsWith('core/storage/repositories/') ||
      rel.startsWith('core/storage/migrations/');

    if (!isRepoOrMigration && rawSqlRe.test(content)) {
      throw new Error(`Raw SQL found outside repositories/migrations in ${rel}`);
    }
  }

  const uiDirs = [
    path.join(VNEXT_ROOT, 'app-web', 'src', 'views'),
    path.join(VNEXT_ROOT, 'app-web', 'src', 'components'),
  ];
  const hexColorRe = /#[0-9a-fA-F]{3,8}\b/;
  const runtimeImportRe = /@capacitor\/|indexedDB|localStorage/i;
  const fixedFontRe = /font-family\s*:(?!\s*var\(--)/i;

  for (const dir of uiDirs) {
    for (const filePath of collectJsFiles(dir)) {
      const rel = path.relative(VNEXT_ROOT, filePath).replace(/\\/g, '/');
      const content = fs.readFileSync(filePath, 'utf8');
      if (hexColorRe.test(content)) {
        throw new Error(`Hardcoded hex color found in ${rel}`);
      }
      if (runtimeImportRe.test(content)) {
        throw new Error(`Direct runtime/Capacitor/IDB reference found in ${rel}`);
      }
      if (fixedFontRe.test(content)) {
        throw new Error(`Hardcoded font-family found in ${rel}`);
      }
    }
  }

  console.log(
    `[verify 2/4] Static Boundary Audit OK (${coreJsFiles.length} core files checked)`
  );
}

function runWebBuildCheck() {
  const res = buildWeb();
  const distIndex = path.join(res.distDir, 'index.html');
  const distCss = path.join(res.distDir, 'src', 'theme', 'tokens.css');
  if (!fs.existsSync(distIndex) || !fs.existsSync(distCss)) {
    throw new Error('SPA build check failed: missing dist/index.html or tokens.css');
  }
  console.log(
    `[verify 3/4] Web Build OK (${res.filesCopied} files -> app-web/dist)`
  );
}

function runContractTestSuite() {
  const testFiles = [
    'tests/layer1_storage.test.js',
    'tests/layer2_domain.test.js',
    'tests/layer3_agent.test.js',
    'tests/layer4_messaging.test.js',
    'tests/layer5_gateway.test.js',
    'tests/layer6_offline_deploy.test.js',
  ];

  console.log('[verify 4/4] Running Layers 1..6 contract test suite...');
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: VNEXT_ROOT,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    throw new Error(`Test suite exited with status ${result.status}`);
  }
}

function main() {
  runPromptPinCheck();
  runStaticBoundaryAudit();
  runWebBuildCheck();
  runContractTestSuite();
  console.log('[verify] ALL CHECKS AND TESTS PASSED (exit 0)');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('[verify] FAILED:', err.message);
    process.exitCode = process.exitCode || 1;
  }
}

module.exports = {
  runPromptPinCheck,
  runStaticBoundaryAudit,
  runWebBuildCheck,
  runContractTestSuite,
};
