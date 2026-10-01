import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const languages = ['en', 'ru', 'uz', 'tr', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ar', 'hi', 'ja', 'zh-CN', 'ko'];
const privacyKey = 'Private, encrypted on this device. Not sent to the recipient or blockchain. Your recovery phrase does not restore notes.';
const require = createRequire(import.meta.url);
const modules = new Map();

// Execute the real dictionary imports/merge loops and translation function.
// Only native language persistence is unavailable (and unused) in these tests.
function loadModule(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  assert.ok(existsSync(url), `Missing production module: ${url.pathname}`);
  const code = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  modules.set(url.href, module.exports);
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '@react-native-async-storage/async-storage') {
      return {
        getItem: () => assert.fail('Translation must not read native storage'),
        setItem: () => assert.fail('Translation must not write native storage'),
      };
    }
    if (name.startsWith('.')) return loadModule(new URL(`${name}.ts`, url));
    return require(name);
  }, module, module.exports);
  return module.exports;
}

const { dictionaries } = loadModule(new URL('./dictionaries.ts', import.meta.url));
const { translateNow, getLanguageOptions } = loadModule(new URL('./index.tsx', import.meta.url));
const loadSlices = () => loadModule(new URL('./transaction-notes-slices.ts', import.meta.url));

function usedKeys() {
  const keys = new Set();
  function addArgument(node) {
    if (ts.isStringLiteralLike(node)) keys.add(node.text);
    else if (ts.isConditionalExpression(node)) {
      addArgument(node.whenTrue);
      addArgument(node.whenFalse);
    } else assert.fail(`Uncovered dynamic translation key: ${node.getText()}`);
  }
  function visitCalls(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
      addArgument(node.arguments[0]);
    }
    ts.forEachChild(node, visitCalls);
  }
  for (const file of ['transaction-card.tsx', 'history-note.tsx', 'use-transaction-card.ts']) {
    const url = new URL(`../features/transaction-notes/${file}`, import.meta.url);
    visitCalls(ts.createSourceFile(file, readFileSync(url, 'utf8'), ts.ScriptTarget.Latest, true));
  }
  for (const file of ['wallet.tsx', 'token-details.tsx']) {
    const url = new URL(`../../app/${file}`, import.meta.url);
    const source = ts.createSourceFile(file, readFileSync(url, 'utf8'), ts.ScriptTarget.Latest, true);
    let statuses = 0;
    function visit(node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'statusLabel') {
        statuses++;
        visitCalls(node.initializer);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(statuses > 0, `Missing card status input in ${file}`);
  }
  return keys;
}

const requiredKeys = usedKeys();

test('every note/card/action/status key resolves from each actual locale dictionary without fallback', () => {
  assert.deepEqual(getLanguageOptions().map(option => option.code).sort(), [...languages].sort());
  for (const language of languages) {
    if (language === 'en') {
      for (const key of requiredKeys) assert.equal(translateNow(key, undefined, language), key);
      continue;
    }
    assert.ok(dictionaries[language], `Missing ${language} dictionary`);
    for (const key of requiredKeys) {
      assert.ok(Object.hasOwn(dictionaries[language], key), `Missing ${language}: ${key}`);
      const value = dictionaries[language][key];
      assert.equal(typeof value, 'string', `${language}: ${key}`);
      assert.ok(value.trim(), `Empty ${language}: ${key}`);
      assert.equal(translateNow(key, undefined, language), value, `Wrong translation for ${language}: ${key}`);
      assert.equal(value, value.trim(), `Untrimmed ${language}: ${key}`);
      assert.notEqual(value, key, `English fallback in ${language}: ${key}`);
    }
  }
});

test('exported slices cover note-specific copy in all sixteen locales', () => {
  const { TRANSACTION_NOTES_KEYS, TRANSACTION_NOTES_LOCALIZED_KEYS, TRANSACTION_NOTES_SLICES } = loadSlices();
  assert.deepEqual([...TRANSACTION_NOTES_KEYS].sort(), [...requiredKeys].sort());
  assert.equal(new Set(TRANSACTION_NOTES_KEYS).size, TRANSACTION_NOTES_KEYS.length, 'Duplicate keys');
  assert.equal(new Set(TRANSACTION_NOTES_LOCALIZED_KEYS).size, TRANSACTION_NOTES_LOCALIZED_KEYS.length, 'Duplicate localized keys');
  assert.deepEqual(Object.keys(TRANSACTION_NOTES_SLICES).sort(), [...languages].sort());
  for (const language of languages) {
    const slice = TRANSACTION_NOTES_SLICES[language];
    const expected = language === 'en' || language === 'ru' ? requiredKeys : TRANSACTION_NOTES_LOCALIZED_KEYS;
    assert.deepEqual(Object.keys(slice).sort(), [...expected].sort(), `${language} key coverage`);
    for (const key of expected) {
      assert.equal(typeof slice[key], 'string', `Missing ${language}: ${key}`);
      assert.ok(slice[key].trim(), `Empty ${language}: ${key}`);
      if (language === 'en') assert.equal(slice[key], key);
      else assert.equal(dictionaries[language][key], slice[key], `Slice not integrated for ${language}: ${key}`);
    }
  }
});

test('Russian note heading and add/edit actions use the requested personal-note terminology', () => {
  for (const [key, expected] of [
    ['Personal note', 'Личная заметка'],
    ['Add note', 'Добавить заметку'],
    ['Edit note', 'Изменить заметку'],
  ]) assert.equal(translateNow(key, undefined, 'ru'), expected);
});

test('privacy copy retains local encryption, recipient/blockchain exclusion and no recovery-phrase restore', () => {
  assert.ok(requiredKeys.has(privacyKey), 'The card must display the privacy warning');
  assert.equal(translateNow(privacyKey, undefined, 'en'), privacyKey);
  assert.equal(
    translateNow(privacyKey, undefined, 'ru'),
    'Личная заметка хранится в зашифрованном виде только на этом устройстве. Она не отправляется получателю или в блокчейн. Фраза восстановления не восстанавливает заметки.',
  );
  for (const language of languages) {
    if (language === 'en') continue;
    assert.ok(Object.hasOwn(dictionaries[language], privacyKey), `Missing ${language} privacy warning`);
    assert.ok(Object.hasOwn(dictionaries[language], 'Only on this device'), `Missing ${language} device notice`);
  }
});
