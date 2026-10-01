import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cache = new Map();
function load(url) {
  if (cache.has(url.href)) return cache.get(url.href);
  const code = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  cache.set(url.href, module.exports);
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '@react-native-async-storage/async-storage') return { getItem: async () => null, setItem: async () => {} };
    if (name.startsWith('.')) return load(new URL(`${name}.ts`, url));
    return require(name);
  }, module, module.exports);
  return module.exports;
}

const root = new URL('../src/i18n/', import.meta.url);
const { dictionaries } = load(new URL('dictionaries.ts', root));
const { TRANSACTION_NOTES_KEYS } = load(new URL('transaction-notes-slices.ts', root));
for (const language of ['ru', 'uz', 'tr', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ar', 'hi', 'ja', 'zh-CN', 'ko']) {
  const missing = TRANSACTION_NOTES_KEYS.filter(key => !dictionaries[language]?.[key]);
  process.stdout.write(`${language}: ${missing.join(' | ')}\n`);
}
