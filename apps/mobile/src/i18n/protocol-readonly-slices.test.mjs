import assert from 'node:assert/strict';
import test from 'node:test';
import { PROTOCOL_READONLY_SLICES } from './protocol-readonly-slices.ts';

const languages = ['en', 'ru', 'uz', 'tr', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ar', 'hi', 'ja', 'zh-CN', 'ko'];
const readonlyKey = 'View on-chain records, balances and contract details. This section does not create or sign transactions.';
const oldKey = 'This section displays records only. Transactions and participation are unavailable in this iOS version.';

// Pin complete translations so placeholders or a dropped transaction restriction
// cannot satisfy coverage merely by being nonempty.
const expectedTranslations = {
  en: readonlyKey,
  ru: 'Просматривайте записи в блокчейне, балансы и сведения о контрактах. В этом разделе транзакции не создаются и не подписываются.',
  uz: 'Blokcheyndagi yozuvlar, balanslar va kontrakt tafsilotlarini ko‘ring. Bu bo‘lim tranzaksiyalarni yaratmaydi va imzolamaydi.',
  tr: 'Zincir üzerindeki kayıtları, bakiyeleri ve sözleşme ayrıntılarını görüntüleyin. Bu bölüm işlem oluşturmaz veya imzalamaz.',
  de: 'Sehen Sie sich On-Chain-Aufzeichnungen, Guthaben und Vertragsdetails an. In diesem Bereich werden keine Transaktionen erstellt oder signiert.',
  fr: 'Consultez les enregistrements sur la blockchain, les soldes et les détails des contrats. Cette section ne crée ni ne signe de transactions.',
  es: 'Consulta los registros en la cadena de bloques, los saldos y los detalles de los contratos. Esta sección no crea ni firma transacciones.',
  it: 'Visualizza i registri sulla blockchain, i saldi e i dettagli dei contratti. Questa sezione non crea né firma transazioni.',
  pt: 'Veja os registros na blockchain, os saldos e os detalhes dos contratos. Esta seção não cria nem assina transações.',
  nl: 'Bekijk on-chain gegevens, saldi en contractdetails. In dit onderdeel worden geen transacties aangemaakt of ondertekend.',
  pl: 'Przeglądaj zapisy w łańcuchu bloków, salda i szczegóły kontraktów. Ta sekcja nie tworzy ani nie podpisuje transakcji.',
  ar: 'اطّلع على السجلات على سلسلة الكتل والأرصدة وتفاصيل العقود. هذا القسم لا ينشئ المعاملات ولا يوقّعها.',
  hi: 'ब्लॉकचेन पर मौजूद रिकॉर्ड, शेष राशि और कॉन्ट्रैक्ट का विवरण देखें। यह अनुभाग न तो लेनदेन बनाता है और न ही उन पर हस्ताक्षर करता है।',
  ja: 'オンチェーンの記録、残高、コントラクトの詳細を確認できます。このセクションではトランザクションの作成や署名は行いません。',
  'zh-CN': '查看链上记录、余额和合约详情。此部分不会创建或签署交易。',
  ko: '온체인 기록, 잔액 및 컨트랙트 세부 정보를 확인하세요. 이 섹션에서는 트랜잭션을 생성하거나 서명하지 않습니다.',
};

test('read-only slice covers exactly all sixteen supported languages', () => {
  assert.equal(languages.length, 16);
  assert.deepEqual(Object.keys(PROTOCOL_READONLY_SLICES).sort(), [...languages].sort());
  assert.deepEqual(Object.keys(expectedTranslations).sort(), [...languages].sort());
});

for (const language of languages) {
  test(`${language}: new copy describes analytics and excludes creating or signing transactions`, () => {
    const slice = PROTOCOL_READONLY_SLICES[language];
    assert.ok(Object.hasOwn(slice, readonlyKey), `Missing ${language} read-only key`);
    const translation = slice[readonlyKey];
    assert.equal(typeof translation, 'string');
    assert.ok(translation.trim(), `Empty ${language} translation`);
    assert.equal(translation, translation.trim(), `Untrimmed ${language} translation`);
    assert.equal(translation, expectedTranslations[language], `Incorrect ${language} read-only copy`);
    if (language !== 'en') assert.notEqual(translation, readonlyKey, `English fallback in ${language}`);
    assert.doesNotMatch(translation, /iOS/i, `Version-specific availability wording in ${language}`);
  });
}

test('old version-specific key is absent from every read-only slice', () => {
  for (const [language, slice] of Object.entries(PROTOCOL_READONLY_SLICES)) {
    assert.equal(Object.hasOwn(slice, oldKey), false, `Obsolete key in ${language}`);
    assert.ok(!Object.values(slice).includes(oldKey), `Obsolete English copy in ${language}`);
  }
});

test('asset-management footer label is translated in all sixteen languages', () => {
  for (const language of languages) {
    const label = PROTOCOL_READONLY_SLICES[language].ASSETS;
    assert.equal(typeof label, 'string', language);
    assert.ok(label.trim(), language);
    if (language !== 'en') assert.notEqual(label, 'ASSETS', language);
  }
});
