const keys = [
  'Read-only',
  'View on-chain records, balances and contract details. This section does not create or sign transactions.',
  'This operation is unavailable in the iOS app.',
  'No matching records in the loaded history.',
  'Some older records have not been loaded yet.',
  'Data could not be loaded. Please try again.',
  'Protocol overview',
  'Received distributions',
] as const;
function slice(values: string[]) { return Object.fromEntries(keys.map((key, index) => [key, values[index]])); }
export const PROTOCOL_READONLY_SLICES: Record<string, Record<string, string>> = {
  en: slice([...keys]),
  ru: slice(['Только просмотр', 'Просматривайте записи в блокчейне, балансы и сведения о контрактах. В этом разделе транзакции не создаются и не подписываются.', 'Эта операция недоступна в приложении для iOS.', 'В загруженной истории нет подходящих записей.', 'Более старые записи загружены не полностью.', 'Не удалось загрузить данные. Повторите попытку.', 'Обзор протокола', 'Полученные распределения']),
  uz: slice(['Faqat ko‘rish', 'Blokcheyndagi yozuvlar, balanslar va kontrakt tafsilotlarini ko‘ring. Bu bo‘lim tranzaksiyalarni yaratmaydi va imzolamaydi.', 'Bu amal iOS ilovasida mavjud emas.', 'Yuklangan tarixda mos yozuvlar yo‘q.', 'Ayrim eski yozuvlar hali yuklanmagan.', 'Ma’lumotlarni yuklab bo‘lmadi. Qayta urinib ko‘ring.', 'Protokol haqida', 'Olingan taqsimotlar']),
  tr: slice(['Salt okunur', 'Zincir üzerindeki kayıtları, bakiyeleri ve sözleşme ayrıntılarını görüntüleyin. Bu bölüm işlem oluşturmaz veya imzalamaz.', 'Bu işlem iOS uygulamasında kullanılamaz.', 'Yüklenen geçmişte eşleşen kayıt yok.', 'Bazı eski kayıtlar henüz yüklenmedi.', 'Veriler yüklenemedi. Tekrar deneyin.', 'Protokole genel bakış', 'Alınan dağıtımlar']),
  de: slice(['Nur Ansicht', 'Sehen Sie sich On-Chain-Aufzeichnungen, Guthaben und Vertragsdetails an. In diesem Bereich werden keine Transaktionen erstellt oder signiert.', 'Diese Aktion ist in der iOS-App nicht verfügbar.', 'Keine passenden Einträge im geladenen Verlauf.', 'Einige ältere Einträge wurden noch nicht geladen.', 'Daten konnten nicht geladen werden. Bitte erneut versuchen.', 'Protokollübersicht', 'Erhaltene Ausschüttungen']),
  fr: slice(['Lecture seule', 'Consultez les enregistrements sur la blockchain, les soldes et les détails des contrats. Cette section ne crée ni ne signe de transactions.', 'Cette opération n’est pas disponible dans l’application iOS.', 'Aucun enregistrement correspondant dans l’historique chargé.', 'Certains enregistrements anciens ne sont pas encore chargés.', 'Impossible de charger les données. Réessayez.', 'Aperçu du protocole', 'Distributions reçues']),
  es: slice(['Solo lectura', 'Consulta los registros en la cadena de bloques, los saldos y los detalles de los contratos. Esta sección no crea ni firma transacciones.', 'Esta operación no está disponible en la aplicación de iOS.', 'No hay registros coincidentes en el historial cargado.', 'Algunos registros antiguos aún no se han cargado.', 'No se pudieron cargar los datos. Inténtalo de nuevo.', 'Resumen del protocolo', 'Distribuciones recibidas']),
  it: slice(['Sola lettura', 'Visualizza i registri sulla blockchain, i saldi e i dettagli dei contratti. Questa sezione non crea né firma transazioni.', 'Questa operazione non è disponibile nell’app iOS.', 'Nessun record corrispondente nella cronologia caricata.', 'Alcuni record precedenti non sono ancora stati caricati.', 'Impossibile caricare i dati. Riprova.', 'Panoramica del protocollo', 'Distribuzioni ricevute']),
  pt: slice(['Somente leitura', 'Veja os registros na blockchain, os saldos e os detalhes dos contratos. Esta seção não cria nem assina transações.', 'Esta operação não está disponível no aplicativo iOS.', 'Nenhum registro correspondente no histórico carregado.', 'Alguns registros antigos ainda não foram carregados.', 'Não foi possível carregar os dados. Tente novamente.', 'Visão geral do protocolo', 'Distribuições recebidas']),
  nl: slice(['Alleen-lezen', 'Bekijk on-chain gegevens, saldi en contractdetails. In dit onderdeel worden geen transacties aangemaakt of ondertekend.', 'Deze handeling is niet beschikbaar in de iOS-app.', 'Geen overeenkomende gegevens in de geladen geschiedenis.', 'Sommige oudere gegevens zijn nog niet geladen.', 'Gegevens konden niet worden geladen. Probeer opnieuw.', 'Protocoloverzicht', 'Ontvangen uitkeringen']),
  pl: slice(['Tylko odczyt', 'Przeglądaj zapisy w łańcuchu bloków, salda i szczegóły kontraktów. Ta sekcja nie tworzy ani nie podpisuje transakcji.', 'Ta operacja jest niedostępna w aplikacji iOS.', 'Brak pasujących wpisów we wczytanej historii.', 'Niektóre starsze wpisy nie zostały jeszcze wczytane.', 'Nie udało się wczytać danych. Spróbuj ponownie.', 'Przegląd protokołu', 'Otrzymane dystrybucje']),
  ar: slice(['للقراءة فقط', 'اطّلع على السجلات على سلسلة الكتل والأرصدة وتفاصيل العقود. هذا القسم لا ينشئ المعاملات ولا يوقّعها.', 'هذه العملية غير متاحة في تطبيق iOS.', 'لا توجد سجلات مطابقة في السجل المحمّل.', 'لم تُحمّل بعض السجلات القديمة بعد.', 'تعذر تحميل البيانات. حاول مرة أخرى.', 'نظرة عامة على البروتوكول', 'التوزيعات المستلمة']),
  hi: slice(['केवल देखने के लिए', 'ब्लॉकचेन पर मौजूद रिकॉर्ड, शेष राशि और कॉन्ट्रैक्ट का विवरण देखें। यह अनुभाग न तो लेनदेन बनाता है और न ही उन पर हस्ताक्षर करता है।', 'यह कार्य iOS ऐप में उपलब्ध नहीं है।', 'लोड किए गए इतिहास में कोई मेल खाने वाला रिकॉर्ड नहीं है।', 'कुछ पुराने रिकॉर्ड अभी लोड नहीं हुए हैं।', 'डेटा लोड नहीं हो सका। फिर से कोशिश करें।', 'प्रोटोकॉल अवलोकन', 'प्राप्त वितरण']),
  ja: slice(['閲覧専用', 'オンチェーンの記録、残高、コントラクトの詳細を確認できます。このセクションではトランザクションの作成や署名は行いません。', 'この操作はiOSアプリでは利用できません。', '読み込んだ履歴に一致する記録はありません。', '一部の古い記録はまだ読み込まれていません。', 'データを読み込めませんでした。もう一度お試しください。', 'プロトコル概要', '受領した配布']),
  'zh-CN': slice(['仅供查看', '查看链上记录、余额和合约详情。此部分不会创建或签署交易。', 'iOS 应用暂不支持此操作。', '已加载的历史记录中没有匹配项。', '部分较早的记录尚未加载。', '无法加载数据，请重试。', '协议概览', '已收到的分发']),
  ko: slice(['읽기 전용', '온체인 기록, 잔액 및 컨트랙트 세부 정보를 확인하세요. 이 섹션에서는 트랜잭션을 생성하거나 서명하지 않습니다.', 'iOS 앱에서는 이 작업을 사용할 수 없습니다.', '불러온 내역에 일치하는 기록이 없습니다.', '일부 이전 기록은 아직 불러오지 않았습니다.', '데이터를 불러오지 못했습니다. 다시 시도하세요.', '프로토콜 개요', '수령한 배포 내역']),
};

const assetLabels: Record<string, string> = {
  en: 'ASSETS', ru: 'АКТИВЫ', uz: 'AKTIVLAR', tr: 'VARLIKLAR',
  de: 'VERMÖGEN', fr: 'ACTIFS', es: 'ACTIVOS', it: 'ASSET', pt: 'ATIVOS',
  nl: 'ACTIVA', pl: 'AKTYWA', ar: 'الأصول', hi: 'संपत्तियाँ',
  ja: '資産', 'zh-CN': '资产', ko: '자산',
};
for (const [language, label] of Object.entries(assetLabels)) {
  PROTOCOL_READONLY_SLICES[language].ASSETS = label;
}
