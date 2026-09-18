const keys = {
  title: 'Swap via SUN.io',
  role: 'SUN.io is an independent third-party decentralized protocol.',
  custody: '4TEEN does not operate SUN.io, act as your counterparty, or take custody of your assets.',
  signature: 'You review and sign every blockchain transaction with your own wallet.',
  protocol: 'THIRD-PARTY PROTOCOL',
  router: 'SMART ROUTER',
  contract: 'View contract on Tronscan',
  minimum: 'Protected minimum',
  resources: 'Network / resource estimate',
  review: 'Review transaction',
  sign: 'Sign transaction',
} as const;

function slice(values: readonly string[]) {
  return Object.fromEntries(Object.values(keys).map((key, index) => [key, values[index]]));
}

export const SWAP_DISCLOSURE_SLICES: Record<string, Record<string, string>> = {
  ru: slice(['Свап через SUN.io', 'SUN.io — независимый сторонний децентрализованный протокол.', '4TEEN не управляет SUN.io, не выступает вашей стороной сделки и не хранит ваши активы.', 'Вы проверяете и подписываете каждую блокчейн-транзакцию своим кошельком.', 'СТОРОННИЙ ПРОТОКОЛ', 'СМАРТ-РОУТЕР', 'Посмотреть контракт в Tronscan', 'Защищённый минимум', 'Оценка сети / ресурсов', 'Проверить транзакцию', 'Подписать транзакцию']),
  uz: slice(['SUN.io orqali svop', 'SUN.io — mustaqil uchinchi tomon markazlashmagan protokoli.', '4TEEN SUN.io’ni boshqarmaydi, bitim tomoni bo‘lmaydi va aktivlaringizni saqlamaydi.', 'Har bir blokcheyn tranzaksiyasini o‘z hamyoningizda tekshirasiz va imzolaysiz.', 'UCHINCHI TOMON PROTOKOLI', 'SMART-ROUTER', 'Shartnomani Tronscan’da ko‘rish', 'Himoyalangan minimum', 'Tarmoq / resurs bahosi', 'Tranzaksiyani tekshirish', 'Tranzaksiyani imzolash']),
  tr: slice(['SUN.io üzerinden takas', 'SUN.io bağımsız bir üçüncü taraf merkeziyetsiz protokoldür.', '4TEEN, SUN.io’yu işletmez, işlemin karşı tarafı olmaz veya varlıklarınızı saklamaz.', 'Her blok zinciri işlemini kendi cüzdanınızla inceler ve imzalarsınız.', 'ÜÇÜNCÜ TARAF PROTOKOLÜ', 'AKILLI YÖNLENDİRİCİ', 'Sözleşmeyi Tronscan’da görüntüle', 'Korunan minimum', 'Ağ / kaynak tahmini', 'İşlemi incele', 'İşlemi imzala']),
  de: slice(['Swap über SUN.io', 'SUN.io ist ein unabhängiges dezentrales Drittanbieterprotokoll.', '4TEEN betreibt SUN.io nicht, ist nicht Ihre Gegenpartei und verwahrt Ihre Vermögenswerte nicht.', 'Sie prüfen und signieren jede Blockchain-Transaktion mit Ihrer eigenen Wallet.', 'DRITTANBIETERPROTOKOLL', 'INTELLIGENTER ROUTER', 'Vertrag auf Tronscan ansehen', 'Geschütztes Minimum', 'Netzwerk-/Ressourcenschätzung', 'Transaktion prüfen', 'Transaktion signieren']),
  fr: slice(['Swap via SUN.io', 'SUN.io est un protocole décentralisé tiers indépendant.', '4TEEN n’exploite pas SUN.io, n’est pas votre contrepartie et ne conserve pas vos actifs.', 'Vous vérifiez et signez chaque transaction blockchain avec votre propre portefeuille.', 'PROTOCOLE TIERS', 'ROUTEUR INTELLIGENT', 'Voir le contrat sur Tronscan', 'Minimum protégé', 'Estimation réseau / ressources', 'Vérifier la transaction', 'Signer la transaction']),
  es: slice(['Swap mediante SUN.io', 'SUN.io es un protocolo descentralizado independiente de terceros.', '4TEEN no opera SUN.io, no actúa como su contraparte ni custodia sus activos.', 'Usted revisa y firma cada transacción blockchain con su propia cartera.', 'PROTOCOLO DE TERCEROS', 'ENRUTADOR INTELIGENTE', 'Ver contrato en Tronscan', 'Mínimo protegido', 'Estimación de red / recursos', 'Revisar transacción', 'Firmar transacción']),
  it: slice(['Swap tramite SUN.io', 'SUN.io è un protocollo decentralizzato indipendente di terze parti.', '4TEEN non gestisce SUN.io, non è la tua controparte e non custodisce i tuoi asset.', 'Esamini e firmi ogni transazione blockchain con il tuo portafoglio.', 'PROTOCOLLO DI TERZE PARTI', 'ROUTER INTELLIGENTE', 'Visualizza contratto su Tronscan', 'Minimo protetto', 'Stima rete / risorse', 'Esamina transazione', 'Firma transazione']),
  pt: slice(['Swap via SUN.io', 'A SUN.io é um protocolo descentralizado independente de terceiros.', 'A 4TEEN não opera a SUN.io, não é sua contraparte e não mantém a custódia dos seus ativos.', 'Você revisa e assina cada transação blockchain com sua própria carteira.', 'PROTOCOLO DE TERCEIROS', 'ROTEADOR INTELIGENTE', 'Ver contrato no Tronscan', 'Mínimo protegido', 'Estimativa de rede / recursos', 'Revisar transação', 'Assinar transação']),
  nl: slice(['Swap via SUN.io', 'SUN.io is een onafhankelijk gedecentraliseerd protocol van een derde partij.', '4TEEN beheert SUN.io niet, is niet uw tegenpartij en bewaart uw activa niet.', 'U controleert en ondertekent elke blockchaintransactie met uw eigen wallet.', 'PROTOCOL VAN DERDE PARTIJ', 'SLIMME ROUTER', 'Contract bekijken op Tronscan', 'Beschermd minimum', 'Netwerk-/resource-inschatting', 'Transactie controleren', 'Transactie ondertekenen']),
  pl: slice(['Swap przez SUN.io', 'SUN.io jest niezależnym, zdecentralizowanym protokołem zewnętrznym.', '4TEEN nie obsługuje SUN.io, nie jest stroną transakcji ani nie przechowuje Twoich aktywów.', 'Każdą transakcję blockchain sprawdzasz i podpisujesz własnym portfelem.', 'PROTOKÓŁ ZEWNĘTRZNY', 'INTELIGENTNY ROUTER', 'Zobacz kontrakt w Tronscan', 'Chronione minimum', 'Szacunek sieci / zasobów', 'Sprawdź transakcję', 'Podpisz transakcję']),
  ar: slice(['المبادلة عبر SUN.io', 'SUN.io بروتوكول لامركزي مستقل تابع لجهة خارجية.', 'لا تدير 4TEEN منصة SUN.io ولا تعمل كطرف مقابل لك ولا تحتفظ بأصولك.', 'أنت تراجع كل معاملة على البلوك تشين وتوقّعها باستخدام محفظتك.', 'بروتوكول تابع لجهة خارجية', 'الموجّه الذكي', 'عرض العقد على Tronscan', 'الحد الأدنى المحمي', 'تقدير الشبكة / الموارد', 'مراجعة المعاملة', 'توقيع المعاملة']),
  hi: slice(['SUN.io के माध्यम से स्वैप', 'SUN.io एक स्वतंत्र तृतीय-पक्ष विकेंद्रीकृत प्रोटोकॉल है।', '4TEEN, SUN.io को संचालित नहीं करता, आपका प्रतिपक्ष नहीं बनता और आपकी संपत्तियों की अभिरक्षा नहीं करता।', 'आप हर ब्लॉकचेन लेनदेन को अपने वॉलेट से जाँचते और हस्ताक्षर करते हैं।', 'तृतीय-पक्ष प्रोटोकॉल', 'स्मार्ट राउटर', 'Tronscan पर अनुबंध देखें', 'सुरक्षित न्यूनतम', 'नेटवर्क / संसाधन अनुमान', 'लेनदेन की समीक्षा करें', 'लेनदेन पर हस्ताक्षर करें']),
  ja: slice(['SUN.io経由のスワップ', 'SUN.ioは独立した第三者の分散型プロトコルです。', '4TEENはSUN.ioを運営せず、取引相手にもならず、資産を預かりません。', 'すべてのブロックチェーン取引を、ご自身のウォレットで確認して署名します。', '第三者プロトコル', 'スマートルーター', 'Tronscanでコントラクトを表示', '保護された最小受取額', 'ネットワーク／リソース見積り', '取引を確認', '取引に署名']),
  'zh-CN': slice(['通过 SUN.io 兑换', 'SUN.io 是独立的第三方去中心化协议。', '4TEEN 不运营 SUN.io，不作为您的交易对手，也不托管您的资产。', '您使用自己的钱包审核并签署每笔区块链交易。', '第三方协议', '智能路由器', '在 Tronscan 查看合约', '受保护的最低金额', '网络／资源估算', '审核交易', '签署交易']),
  ko: slice(['SUN.io를 통한 스왑', 'SUN.io는 독립적인 제3자 탈중앙화 프로토콜입니다.', '4TEEN은 SUN.io를 운영하거나 거래 상대방이 되지 않으며 자산을 보관하지 않습니다.', '모든 블록체인 거래를 본인의 지갑에서 검토하고 서명합니다.', '제3자 프로토콜', '스마트 라우터', 'Tronscan에서 컨트랙트 보기', '보호된 최소 수령량', '네트워크 / 리소스 예상치', '거래 검토', '거래 서명']),
};
