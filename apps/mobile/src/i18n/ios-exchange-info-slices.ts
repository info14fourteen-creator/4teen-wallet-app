const keys = [
  '4TEEN contract minting',
  'Token exchange overview',
  'The 4TEEN contract issues tokens according to its on-chain rules. This page shows your confirmed contract records; it does not submit a mint transaction.',
  'Review your wallet assets here. This page does not quote, connect to, or execute an exchange.',
  'Contract mint records',
  'Wallet assets',
] as const;

const translations: Record<string, string[]> = {
  en: [...keys],
  ru: ['Эмиссия по контракту 4TEEN', 'Обзор обмена токенов', 'Контракт 4TEEN выпускает токены по правилам блокчейна. Здесь показаны подтверждённые записи контракта; создать транзакцию эмиссии на этом экране нельзя.', 'Здесь можно посмотреть активы кошелька. Экран не рассчитывает курс, не подключается к бирже и не проводит обмен.', 'Записи об эмиссии', 'Активы кошелька'],
  uz: ['4TEEN kontrakti emissiyasi', 'Token almashinuvi sharhi', '4TEEN kontrakti tokenlarni blokcheyn qoidalari asosida chiqaradi. Bu sahifa tasdiqlangan yozuvlarni ko‘rsatadi, emissiya tranzaksiyasini yubormaydi.', 'Bu yerda hamyon aktivlarini ko‘ring. Sahifa kurs bermaydi, birjaga ulanmaydi va almashinuvni bajarmaydi.', 'Emissiya yozuvlari', 'Hamyon aktivlari'],
  tr: ['4TEEN sözleşme basımı', 'Token takasına genel bakış', '4TEEN sözleşmesi tokenleri zincir üstü kurallara göre üretir. Bu sayfa onaylanmış kayıtları gösterir; basım işlemi göndermez.', 'Cüzdan varlıklarınızı burada görüntüleyin. Bu sayfa fiyat teklifi vermez, borsaya bağlanmaz veya takas yapmaz.', 'Basım kayıtları', 'Cüzdan varlıkları'],
  de: ['4TEEN-Vertragsprägung', 'Token-Tauschübersicht', 'Der 4TEEN-Vertrag gibt Token nach On-Chain-Regeln aus. Diese Seite zeigt bestätigte Vertragsdaten und sendet keine Prägungstransaktion.', 'Sehen Sie hier Ihre Wallet-Assets. Diese Seite bietet keine Kurse an, verbindet sich nicht mit einer Börse und führt keinen Tausch aus.', 'Prägungsdaten', 'Wallet-Assets'],
  fr: ['Émission par contrat 4TEEN', 'Aperçu des échanges', 'Le contrat 4TEEN émet des jetons selon ses règles sur chaîne. Cette page affiche vos données confirmées et ne soumet aucune transaction de création.', 'Consultez ici les actifs du portefeuille. Cette page ne fournit pas de devis, ne se connecte pas à une bourse et ne réalise aucun échange.', 'Données d’émission', 'Actifs du portefeuille'],
  es: ['Emisión del contrato 4TEEN', 'Resumen de intercambios', 'El contrato 4TEEN emite tokens según sus reglas en cadena. Esta página muestra registros confirmados y no envía transacciones de emisión.', 'Consulta aquí los activos de tu cartera. Esta página no ofrece cotizaciones, no conecta con exchanges ni ejecuta intercambios.', 'Registros de emisión', 'Activos de la cartera'],
  it: ['Emissione del contratto 4TEEN', 'Panoramica degli scambi', 'Il contratto 4TEEN emette token secondo regole on-chain. Questa pagina mostra i dati confermati e non invia transazioni di emissione.', 'Visualizza qui gli asset del wallet. La pagina non fornisce quotazioni, non si collega a exchange e non esegue scambi.', 'Dati di emissione', 'Asset del wallet'],
  pt: ['Emissão pelo contrato 4TEEN', 'Visão geral de troca', 'O contrato 4TEEN emite tokens conforme regras on-chain. Esta página mostra registros confirmados e não envia transações de emissão.', 'Veja aqui os ativos da carteira. Esta página não fornece cotações, não se conecta a corretoras e não executa trocas.', 'Registros de emissão', 'Ativos da carteira'],
  nl: ['4TEEN-contractuitgifte', 'Overzicht van tokenruil', 'Het 4TEEN-contract geeft tokens uit volgens on-chain regels. Deze pagina toont bevestigde gegevens en verstuurt geen uitgiftetransactie.', 'Bekijk hier uw walletactiva. Deze pagina geeft geen koers, maakt geen verbinding met een beurs en voert geen ruil uit.', 'Uitgiftegegevens', 'Walletactiva'],
  pl: ['Emisja kontraktu 4TEEN', 'Przegląd wymiany tokenów', 'Kontrakt 4TEEN emituje tokeny według zasad on-chain. Ta strona pokazuje potwierdzone zapisy i nie wysyła transakcji emisji.', 'Zobacz tu aktywa portfela. Strona nie podaje kursów, nie łączy z giełdą i nie wykonuje wymiany.', 'Zapisy emisji', 'Aktywa portfela'],
  ar: ['إصدار عقد 4TEEN', 'نظرة عامة على تبادل الرموز', 'يصدر عقد 4TEEN الرموز وفق قواعده على السلسلة. تعرض هذه الصفحة السجلات المؤكدة ولا ترسل معاملة إصدار.', 'اعرض أصول محفظتك هنا. لا تعرض الصفحة أسعاراً ولا تتصل بمنصة تداول ولا تنفذ تبادلاً.', 'سجلات الإصدار', 'أصول المحفظة'],
  hi: ['4TEEN अनुबंध जारीकरण', 'टोकन विनिमय अवलोकन', '4TEEN अनुबंध ऑन-चेन नियमों के अनुसार टोकन जारी करता है। यह पृष्ठ पुष्टि किए गए रिकॉर्ड दिखाता है; जारीकरण लेनदेन नहीं भेजता।', 'यहाँ वॉलेट संपत्तियाँ देखें। यह पृष्ठ दर नहीं देता, एक्सचेंज से नहीं जुड़ता और विनिमय नहीं करता।', 'जारीकरण रिकॉर्ड', 'वॉलेट संपत्तियाँ'],
  ja: ['4TEENコントラクト発行', 'トークン交換の概要', '4TEENコントラクトはオンチェーンの規則に従ってトークンを発行します。この画面は確定済みの記録を表示し、発行取引は送信しません。', 'ウォレットの資産を確認できます。この画面では見積もり、取引所への接続、交換の実行は行いません。', '発行記録', 'ウォレット資産'],
  'zh-CN': ['4TEEN 合约铸造', '代币兑换概览', '4TEEN 合约按链上规则发行代币。本页显示已确认的合约记录，不提交铸造交易。', '在此查看钱包资产。本页不提供报价、不连接交易所，也不执行兑换。', '铸造记录', '钱包资产'],
  ko: ['4TEEN 계약 발행', '토큰 교환 개요', '4TEEN 계약은 온체인 규칙에 따라 토큰을 발행합니다. 이 화면은 확인된 기록을 보여주며 발행 거래를 제출하지 않습니다.', '여기에서 지갑 자산을 확인하세요. 이 화면은 견적, 거래소 연결 또는 교환 실행을 제공하지 않습니다.', '발행 기록', '지갑 자산'],
};

export const IOS_EXCHANGE_INFO_SLICES: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(translations).map(([language, values]) => [language, Object.fromEntries(keys.map((key, index) => [key, values[index]]))]),
);
