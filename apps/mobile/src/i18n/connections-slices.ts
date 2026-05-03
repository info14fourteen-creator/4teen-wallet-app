export const CONNECTIONS_SLICE_RU = {
  'Connected sites and token permissions': 'Подключенные сайты и разрешения токенов',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    'Этот экран разделяет подключения сайтов и ончейн-разрешения токенов. В блоке подключенных сайтов должны появляться домены, которым был выдан доступ к кошельку во встроенном браузере. Карточки разрешений показывают контракты-спендеры, уже получившие право тратить токены активного кошелька.',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    'Разрешения для swap в 4TEEN проходят через контракт SunSwap Smart Router.',
  'Unknown time': 'Время неизвестно',
  'Unknown amount': 'Неизвестная сумма',
  'Connections failed to load.': 'Не удалось загрузить подключения.',
  'Loading connections': 'Загрузка подключений',
  'No wallet connected': 'Кошелек не выбран',
  'Create or import a wallet to review connected sites and recent token approvals.':
    'Создайте или импортируйте кошелек, чтобы просматривать подключенные сайты и недавние разрешения токенов.',
  'CONNECTED SITES': 'ПОДКЛЮЧЕННЫЕ САЙТЫ',
  'No browser sessions are stored yet.': 'Сессии браузера пока не сохранены.',
  'APPROVED CONTRACTS': 'ОДОБРЕННЫЕ КОНТРАКТЫ',
  'Unique spender contracts in recent history.': 'Уникальные контракты-спендеры в недавней истории.',
  'APPROVED TOKENS': 'ОДОБРЕННЫЕ ТОКЕНЫ',
  'Successful approve events': 'Успешные события approve',
  'Approval tx waiting to finalize': 'Транзакция approve ждет финализации',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    'Подключенные сайты и ончейн-разрешения — это разные уровни. Эта сборка уже читает историю approve, но браузерные wallet-connect-сессии пока не сохраняются.',
  'No connected site cards yet.': 'Карточек подключенных сайтов пока нет.',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    'Встроенный браузер уже открывает сайты, но пока не хранит состояние доступа к кошельку для каждого домена. Когда браузерные connect-сессии появятся, этот блок будет показывать эти домены как карточки.',
  'ON-CHAIN APPROVALS': 'ОНЧЕЙН-РАЗРЕШЕНИЯ',
  'ACTIVE': 'АКТИВНО',
  'LATEST': 'ПОСЛЕДНЕЕ',
  'ok': 'ok',
  'wait': 'ожидание',
  'fail': 'ошибка',
  'Most recent approval in wallet history': 'Самое недавнее разрешение в истории кошелька',
  'OPEN CONTRACT': 'ОТКРЫТЬ КОНТРАКТ',
  'OPEN LATEST TX': 'ОТКРЫТЬ ПОСЛЕДНЮЮ TX',
  'No approval cards yet.': 'Карточек разрешений пока нет.',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    'В текущем окне истории у этого кошелька нет недавних событий approve. Когда dapp получает разрешение на расход токенов, он должен появиться здесь как карточка спендера.',
} as const;

export const CONNECTIONS_SLICE_UZ = {
  'Connected sites and token permissions': 'Ulangan saytlar va token ruxsatlari',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    'Bu ekran brauzer ulanishlarini on-chain token ruxsatlaridan ajratadi. Ulangan saytlar bo‘limida ichki brauzerda hamyon kirishi berilgan domenlar ko‘rinishi kerak. Approval kartalari esa faol hamyondan token sarflash huquqini allaqachon olgan spender kontraktlarini ko‘rsatadi.',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    '4TEEN swap approvallari SunSwap Smart Router kontrakti orqali o‘tadi.',
  'Unknown time': 'Vaqt noma’lum',
  'Unknown amount': 'Miqdor noma’lum',
  'Connections failed to load.': 'Ulanishlarni yuklab bo‘lmadi.',
  'Loading connections': 'Ulanishlar yuklanmoqda',
  'No wallet connected': 'Hamyon tanlanmagan',
  'Create or import a wallet to review connected sites and recent token approvals.':
    'Ulangan saytlar va yaqindagi token approvallarini ko‘rish uchun hamyon yarating yoki import qiling.',
  'CONNECTED SITES': 'ULANGAN SAYTLAR',
  'No browser sessions are stored yet.': 'Brauzer sessiyalari hali saqlanmagan.',
  'APPROVED CONTRACTS': 'TASDIQLANGAN KONTRAKTLAR',
  'Unique spender contracts in recent history.': 'Yaqindagi tarixdagi noyob spender kontraktlari.',
  'APPROVED TOKENS': 'TASDIQLANGAN TOKENLAR',
  'Successful approve events': 'Muvaffaqiyatli approve hodisalari',
  'Approval tx waiting to finalize': 'Approval tx yakunlanishini kutmoqda',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    'Ulangan saytlar va on-chain approvallar ikki xil qatlam. Bu build allaqachon approval tarixini o‘qiydi, lekin brauzer tomondagi wallet connect sessiyalari hali saqlanmaydi.',
  'No connected site cards yet.': 'Ulangan sayt kartalari hali yo‘q.',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    'Ichki brauzer saytlarni ochadi, ammo hozircha har bir domen bo‘yicha hamyon kirishi holatini saqlamaydi. Brauzer tomondagi connect sessiyalari paydo bo‘lgach, bu bo‘lim u domenlarni kartalar sifatida ko‘rsatadi.',
  'ON-CHAIN APPROVALS': 'ON-CHAIN APPROVALLAR',
  'ACTIVE': 'FAOL',
  'LATEST': 'SO‘NGGI',
  'ok': 'ok',
  'wait': 'kutish',
  'fail': 'xato',
  'Most recent approval in wallet history': 'Hamyon tarixidagi eng so‘nggi approval',
  'OPEN CONTRACT': 'KONTRAKTNI OCHISH',
  'OPEN LATEST TX': 'SO‘NGGI TX NI OCHISH',
  'No approval cards yet.': 'Approval kartalari hali yo‘q.',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    'Joriy tarix oynasida bu hamyonda yaqindagi approve hodisalari yo‘q. Dapp token sarflash ruxsatini olganda, u bu yerda spender kartasi sifatida ko‘rinishi kerak.',
} as const;

export const CONNECTIONS_SLICE_TR = {
  'Connected sites and token permissions': 'Bağlı siteler ve token izinleri',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    'Bu ekran tarayıcı bağlantılarını on-chain token izinlerinden ayırır. Bağlı siteler bölümünde, uygulama içi tarayıcıda cüzdan erişimi verilmiş alan adları görünmelidir. Approval kartları ise etkin cüzdandan token harcama izni almış spender kontratlarını gösterir.',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    '4TEEN swap onayları SunSwap Smart Router kontratı üzerinden gider.',
  'Unknown time': 'Zaman bilinmiyor',
  'Unknown amount': 'Tutar bilinmiyor',
  'Connections failed to load.': 'Bağlantılar yüklenemedi.',
  'Loading connections': 'Bağlantılar yükleniyor',
  'No wallet connected': 'Cüzdan seçilmedi',
  'Create or import a wallet to review connected sites and recent token approvals.':
    'Bağlı siteleri ve son token onaylarını görmek için bir cüzdan oluşturun veya içe aktarın.',
  'CONNECTED SITES': 'BAĞLI SİTELER',
  'No browser sessions are stored yet.': 'Henüz kayıtlı tarayıcı oturumu yok.',
  'APPROVED CONTRACTS': 'ONAYLI KONTRATLAR',
  'Unique spender contracts in recent history.': 'Son geçmişteki benzersiz spender kontratları.',
  'APPROVED TOKENS': 'ONAYLI TOKENLER',
  'Successful approve events': 'Başarılı approve olayları',
  'Approval tx waiting to finalize': 'Approval tx tamamlanmayı bekliyor',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    'Bağlı siteler ve on-chain onaylar farklı katmanlardır. Bu build approval geçmişini zaten okuyor, ancak tarayıcı tarafındaki wallet connect oturumları henüz kalıcı olarak saklanmıyor.',
  'No connected site cards yet.': 'Henüz bağlı site kartı yok.',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    'Uygulama içi tarayıcı siteleri açıyor, ancak alan adı bazında cüzdan erişim durumunu henüz saklamıyor. Tarayıcı tarafındaki connect oturumları oluştuğunda bu bölüm o alan adlarını kart olarak göstermelidir.',
  'ON-CHAIN APPROVALS': 'ON-CHAIN ONAYLAR',
  'ACTIVE': 'AKTİF',
  'LATEST': 'SON',
  'ok': 'ok',
  'wait': 'bekle',
  'fail': 'hata',
  'Most recent approval in wallet history': 'Cüzdan geçmişindeki en son approval',
  'OPEN CONTRACT': 'KONTRATI AÇ',
  'OPEN LATEST TX': 'SON TX İ AÇ',
  'No approval cards yet.': 'Henüz approval kartı yok.',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    'Bu cüzdanın mevcut geçmiş penceresinde son approve olayı yok. Bir dapp token harcama izni aldığında burada spender kartı olarak görünmelidir.',
} as const;

export const CONNECTIONS_SLICE_DE = {
  'Connected sites and token permissions': 'Verbundene Websites und Token-Berechtigungen',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    'Dieser Bildschirm trennt Browser-Verbindungen von On-Chain-Tokenfreigaben. Bei verbundenen Websites sollten die Domains erscheinen, denen im In-App-Browser Wallet-Zugriff gewährt wurde. Freigabekarten zeigen Spender-Verträge, die bereits eine Token-Ausgabeberechtigung vom aktiven Wallet erhalten haben.',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    '4TEEN-Swap-Freigaben laufen über den Vertrag SunSwap Smart Router.',
  'Unknown time': 'Zeit unbekannt',
  'Unknown amount': 'Betrag unbekannt',
  'Connections failed to load.': 'Verbindungen konnten nicht geladen werden.',
  'Loading connections': 'Verbindungen werden geladen',
  'No wallet connected': 'Kein Wallet ausgewählt',
  'Create or import a wallet to review connected sites and recent token approvals.':
    'Erstellen oder importieren Sie ein Wallet, um verbundene Websites und aktuelle Token-Freigaben zu prüfen.',
  'CONNECTED SITES': 'VERBUNDENE WEBSITES',
  'No browser sessions are stored yet.': 'Es sind noch keine Browser-Sitzungen gespeichert.',
  'APPROVED CONTRACTS': 'FREIGEGEBENE VERTRÄGE',
  'Unique spender contracts in recent history.': 'Eindeutige Spender-Verträge in der jüngsten Historie.',
  'APPROVED TOKENS': 'FREIGEGEBENE TOKEN',
  'Successful approve events': 'Erfolgreiche Approve-Ereignisse',
  'Approval tx waiting to finalize': 'Approve-Transaktion wartet auf Abschluss',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    'Verbundene Websites und On-Chain-Freigaben sind zwei verschiedene Ebenen. Diese Build liest die Approve-Historie bereits aus, speichert Browser-seitige Wallet-Connect-Sitzungen aber noch nicht dauerhaft.',
  'No connected site cards yet.': 'Es gibt noch keine Karten für verbundene Websites.',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    'Der In-App-Browser öffnet bereits Websites, speichert den Wallet-Zugriff pro Domain aber noch nicht. Sobald Browser-seitige Connect-Sitzungen existieren, sollte dieser Bereich diese Domains als Karten anzeigen.',
  'ON-CHAIN APPROVALS': 'ON-CHAIN-FREIGABEN',
  'ACTIVE': 'AKTIV',
  'LATEST': 'LETZTE',
  'ok': 'ok',
  'wait': 'wartet',
  'fail': 'fehler',
  'Most recent approval in wallet history': 'Neueste Freigabe in der Wallet-Historie',
  'OPEN CONTRACT': 'VERTRAG ÖFFNEN',
  'OPEN LATEST TX': 'LETZTE TX ÖFFNEN',
  'No approval cards yet.': 'Es gibt noch keine Freigabe-Karten.',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    'Dieses Wallet hat im aktuellen Verlaufsfenster keine aktuellen Approve-Ereignisse. Sobald eine dApp eine Token-Ausgabeberechtigung erhält, sollte sie hier als Spender-Karte erscheinen.',
} as const;

export const CONNECTIONS_SLICE_FR = {
  'Connected sites and token permissions': 'Sites connectés et permissions de jetons',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    'Cet écran sépare les connexions du navigateur des autorisations de jetons on-chain. Les sites connectés doivent afficher les domaines ayant reçu un accès au wallet dans le navigateur intégré. Les cartes d’autorisation montrent les contrats spender ayant déjà reçu une permission de dépense depuis le wallet actif.',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    'Les approbations de swap 4TEEN passent par le contrat SunSwap Smart Router.',
  'Unknown time': 'Heure inconnue',
  'Unknown amount': 'Montant inconnu',
  'Connections failed to load.': 'Impossible de charger les connexions.',
  'Loading connections': 'Chargement des connexions',
  'No wallet connected': 'Aucun wallet sélectionné',
  'Create or import a wallet to review connected sites and recent token approvals.':
    'Créez ou importez un wallet pour consulter les sites connectés et les autorisations de jetons récentes.',
  'CONNECTED SITES': 'SITES CONNECTÉS',
  'No browser sessions are stored yet.': 'Aucune session navigateur n’est encore enregistrée.',
  'APPROVED CONTRACTS': 'CONTRATS AUTORISÉS',
  'Unique spender contracts in recent history.': 'Contrats spender uniques dans l’historique récent.',
  'APPROVED TOKENS': 'JETONS AUTORISÉS',
  'Successful approve events': 'Événements approve réussis',
  'Approval tx waiting to finalize': 'Transaction d’approve en attente de finalisation',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    'Les sites connectés et les autorisations on-chain sont deux couches différentes. Cette build lit déjà l’historique des approve, mais les sessions wallet connect côté navigateur ne sont pas encore persistées.',
  'No connected site cards yet.': 'Aucune carte de site connecté pour le moment.',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    'Le navigateur intégré ouvre déjà les sites, mais il ne stocke pas encore l’état d’accès au wallet par domaine. Une fois les sessions de connexion côté navigateur en place, cette section devra afficher ces domaines sous forme de cartes.',
  'ON-CHAIN APPROVALS': 'AUTORISATIONS ON-CHAIN',
  'ACTIVE': 'ACTIF',
  'LATEST': 'PLUS RÉCENT',
  'ok': 'ok',
  'wait': 'attente',
  'fail': 'échec',
  'Most recent approval in wallet history': 'Autorisation la plus récente dans l’historique du wallet',
  'OPEN CONTRACT': 'OUVRIR LE CONTRAT',
  'OPEN LATEST TX': 'OUVRIR LA DERNIÈRE TX',
  'No approval cards yet.': 'Aucune carte d’autorisation pour le moment.',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    'Ce wallet n’a aucun événement approve récent dans la fenêtre d’historique actuelle. Lorsqu’une dApp reçoit une permission de dépense de jetons, elle devrait apparaître ici comme carte spender.',
} as const;

export const CONNECTIONS_SLICE_ES = {
  'Connected sites and token permissions': 'Sitios conectados y permisos de tokens',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    'Esta pantalla separa las conexiones del navegador de las aprobaciones on-chain de tokens. Los sitios conectados deben mostrar los dominios a los que se concedió acceso a la wallet dentro del navegador integrado. Las tarjetas de aprobación muestran los contratos spender que ya recibieron permiso para gastar tokens desde la wallet activa.',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    'Las aprobaciones de swap de 4TEEN pasan por el contrato SunSwap Smart Router.',
  'Unknown time': 'Hora desconocida',
  'Unknown amount': 'Cantidad desconocida',
  'Connections failed to load.': 'No se pudieron cargar las conexiones.',
  'Loading connections': 'Cargando conexiones',
  'No wallet connected': 'No hay wallet seleccionada',
  'Create or import a wallet to review connected sites and recent token approvals.':
    'Crea o importa una wallet para revisar los sitios conectados y las aprobaciones de tokens recientes.',
  'CONNECTED SITES': 'SITIOS CONECTADOS',
  'No browser sessions are stored yet.': 'Todavía no hay sesiones de navegador guardadas.',
  'APPROVED CONTRACTS': 'CONTRATOS APROBADOS',
  'Unique spender contracts in recent history.': 'Contratos spender únicos en el historial reciente.',
  'APPROVED TOKENS': 'TOKENS APROBADOS',
  'Successful approve events': 'Eventos approve exitosos',
  'Approval tx waiting to finalize': 'La tx de approve está esperando finalizar',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    'Los sitios conectados y las aprobaciones on-chain son capas distintas. Esta build ya lee el historial de approve, pero las sesiones de wallet connect del navegador todavía no se guardan de forma persistente.',
  'No connected site cards yet.': 'Todavía no hay tarjetas de sitios conectados.',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    'El navegador integrado ya abre sitios web, pero todavía no guarda el estado de acceso a la wallet por dominio. Cuando existan sesiones de conexión del lado del navegador, esta sección deberá mostrar esos dominios como tarjetas.',
  'ON-CHAIN APPROVALS': 'APROBACIONES ON-CHAIN',
  'ACTIVE': 'ACTIVO',
  'LATEST': 'ÚLTIMA',
  'ok': 'ok',
  'wait': 'espera',
  'fail': 'fallo',
  'Most recent approval in wallet history': 'Aprobación más reciente en el historial de la wallet',
  'OPEN CONTRACT': 'ABRIR CONTRATO',
  'OPEN LATEST TX': 'ABRIR ÚLTIMA TX',
  'No approval cards yet.': 'Todavía no hay tarjetas de aprobación.',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    'Esta wallet no tiene eventos approve recientes en la ventana de historial actual. Cuando una dapp reciba permiso para gastar tokens, debería aparecer aquí como una tarjeta de spender.',
} as const;

export const CONNECTIONS_SLICE_IT = {
  'Connected sites and token permissions': 'Siti collegati e permessi token',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    'Questa schermata separa le connessioni del browser dalle approvazioni token on-chain. Nei siti collegati dovrebbero apparire i domini a cui è stato concesso l’accesso al wallet nel browser integrato. Le schede di approvazione mostrano i contratti spender che hanno già ricevuto il permesso di spendere token dal wallet attivo.',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    'Le approvazioni swap di 4TEEN passano attraverso il contratto SunSwap Smart Router.',
  'Unknown time': 'Ora sconosciuta',
  'Unknown amount': 'Importo sconosciuto',
  'Connections failed to load.': 'Impossibile caricare le connessioni.',
  'Loading connections': 'Caricamento connessioni',
  'No wallet connected': 'Nessun wallet selezionato',
  'Create or import a wallet to review connected sites and recent token approvals.':
    'Crea o importa un wallet per controllare i siti collegati e le approvazioni token recenti.',
  'CONNECTED SITES': 'SITI COLLEGATI',
  'No browser sessions are stored yet.': 'Non ci sono ancora sessioni browser salvate.',
  'APPROVED CONTRACTS': 'CONTRATTI APPROVATI',
  'Unique spender contracts in recent history.': 'Contratti spender unici nella cronologia recente.',
  'APPROVED TOKENS': 'TOKEN APPROVATI',
  'Successful approve events': 'Eventi approve riusciti',
  'Approval tx waiting to finalize': 'La tx di approve è in attesa di finalizzazione',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    'Siti collegati e approvazioni on-chain sono due livelli diversi. Questa build legge già la cronologia degli approve, ma le sessioni wallet connect lato browser non sono ancora persistite.',
  'No connected site cards yet.': 'Non ci sono ancora schede di siti collegati.',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    'Il browser integrato apre già i siti, ma non salva ancora lo stato di accesso al wallet per dominio. Quando esisteranno sessioni connect lato browser, questa sezione dovrà mostrare quei domini come schede.',
  'ON-CHAIN APPROVALS': 'APPROVAZIONI ON-CHAIN',
  'ACTIVE': 'ATTIVO',
  'LATEST': 'ULTIMA',
  'ok': 'ok',
  'wait': 'attesa',
  'fail': 'errore',
  'Most recent approval in wallet history': 'Approvazione più recente nella cronologia del wallet',
  'OPEN CONTRACT': 'APRI CONTRATTO',
  'OPEN LATEST TX': 'APRI ULTIMA TX',
  'No approval cards yet.': 'Non ci sono ancora schede di approvazione.',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    'Questo wallet non ha eventi approve recenti nella finestra di cronologia corrente. Quando una dapp riceve un permesso di spesa token, dovrebbe comparire qui come scheda spender.',
} as const;

export const CONNECTIONS_SLICE_PT = {
  'Connected sites and token permissions': 'Sites conectados e permissões de tokens',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    'Este ecrã separa as ligações do navegador das aprovações de tokens on-chain. Os sites conectados devem mostrar os domínios que receberam acesso à wallet dentro do navegador integrado. Os cartões de aprovação mostram contratos spender que já receberam permissão para gastar tokens a partir da wallet ativa.',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    'As aprovações de swap da 4TEEN passam pelo contrato SunSwap Smart Router.',
  'Unknown time': 'Hora desconhecida',
  'Unknown amount': 'Montante desconhecido',
  'Connections failed to load.': 'Não foi possível carregar as ligações.',
  'Loading connections': 'A carregar ligações',
  'No wallet connected': 'Nenhuma wallet selecionada',
  'Create or import a wallet to review connected sites and recent token approvals.':
    'Crie ou importe uma wallet para rever sites conectados e aprovações recentes de tokens.',
  'CONNECTED SITES': 'SITES CONECTADOS',
  'No browser sessions are stored yet.': 'Ainda não existem sessões de navegador guardadas.',
  'APPROVED CONTRACTS': 'CONTRATOS APROVADOS',
  'Unique spender contracts in recent history.': 'Contratos spender únicos no histórico recente.',
  'APPROVED TOKENS': 'TOKENS APROVADOS',
  'Successful approve events': 'Eventos approve bem-sucedidos',
  'Approval tx waiting to finalize': 'A tx de approve está à espera de finalização',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    'Sites conectados e aprovações on-chain são camadas diferentes. Esta build já lê o histórico de approve, mas as sessões wallet connect do lado do navegador ainda não são persistidas.',
  'No connected site cards yet.': 'Ainda não existem cartões de sites conectados.',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    'O navegador integrado já abre sites, mas ainda não guarda o estado de acesso à wallet por domínio. Quando existirem sessões connect do lado do navegador, esta secção deverá mostrar esses domínios como cartões.',
  'ON-CHAIN APPROVALS': 'APROVAÇÕES ON-CHAIN',
  'ACTIVE': 'ATIVO',
  'LATEST': 'ÚLTIMA',
  'ok': 'ok',
  'wait': 'espera',
  'fail': 'falha',
  'Most recent approval in wallet history': 'Aprovação mais recente no histórico da wallet',
  'OPEN CONTRACT': 'ABRIR CONTRATO',
  'OPEN LATEST TX': 'ABRIR ÚLTIMA TX',
  'No approval cards yet.': 'Ainda não existem cartões de aprovação.',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    'Esta wallet não tem eventos approve recentes na janela de histórico atual. Quando uma dapp receber permissão para gastar tokens, deverá aparecer aqui como cartão spender.',
} as const;

export const CONNECTIONS_SLICE_NL = {
  'Connected sites and token permissions': 'Verbonden sites en tokenrechten',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    'Dit scherm scheidt browserverbindingen van on-chain token-goedkeuringen. Bij verbonden sites moeten de domeinen verschijnen die in de ingebouwde browser wallet-toegang hebben gekregen. Goedkeuringskaarten tonen spender-contracten die al toestemming hebben gekregen om tokens uit de actieve wallet uit te geven.',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    '4TEEN-swapgoedkeuringen lopen via het contract SunSwap Smart Router.',
  'Unknown time': 'Tijd onbekend',
  'Unknown amount': 'Bedrag onbekend',
  'Connections failed to load.': 'Verbindingen konden niet worden geladen.',
  'Loading connections': 'Verbindingen laden',
  'No wallet connected': 'Geen wallet geselecteerd',
  'Create or import a wallet to review connected sites and recent token approvals.':
    'Maak of importeer een wallet om verbonden sites en recente token-goedkeuringen te bekijken.',
  'CONNECTED SITES': 'VERBONDEN SITES',
  'No browser sessions are stored yet.': 'Er zijn nog geen browsersessies opgeslagen.',
  'APPROVED CONTRACTS': 'GOEDGEKEURDE CONTRACTEN',
  'Unique spender contracts in recent history.': 'Unieke spender-contracten in de recente geschiedenis.',
  'APPROVED TOKENS': 'GOEDGEKEURDE TOKENS',
  'Successful approve events': 'Succesvolle approve-gebeurtenissen',
  'Approval tx waiting to finalize': 'Approve-tx wacht op afronding',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    'Verbonden sites en on-chain goedkeuringen zijn verschillende lagen. Deze build leest de approve-geschiedenis al uit, maar browser-side wallet-connect-sessies worden nog niet bewaard.',
  'No connected site cards yet.': 'Er zijn nog geen kaarten voor verbonden sites.',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    'De ingebouwde browser opent websites, maar slaat de wallet-toegang per domein nog niet op. Zodra browser-side connect-sessies bestaan, moet deze sectie die domeinen als kaarten weergeven.',
  'ON-CHAIN APPROVALS': 'ON-CHAIN GOEDKEURINGEN',
  'ACTIVE': 'ACTIEF',
  'LATEST': 'LAATSTE',
  'ok': 'ok',
  'wait': 'wacht',
  'fail': 'fout',
  'Most recent approval in wallet history': 'Meest recente goedkeuring in walletgeschiedenis',
  'OPEN CONTRACT': 'CONTRACT OPENEN',
  'OPEN LATEST TX': 'LAATSTE TX OPENEN',
  'No approval cards yet.': 'Er zijn nog geen goedkeuringskaarten.',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    'Deze wallet heeft geen recente approve-gebeurtenissen in het huidige geschiedenisvenster. Wanneer een dapp toestemming krijgt om tokens uit te geven, moet die hier als spender-kaart verschijnen.',
} as const;

export const CONNECTIONS_SLICE_PL = {
  'Connected sites and token permissions': 'Połączone strony i uprawnienia tokenów',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    'Ten ekran rozdziela połączenia przeglądarki od on-chainowych zgód na tokeny. W sekcji połączonych stron powinny pojawiać się domeny, którym przyznano dostęp do walleta we wbudowanej przeglądarce. Karty zgód pokazują kontrakty spender, które już otrzymały uprawnienie do wydawania tokenów z aktywnego walleta.',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    'Zgody swap 4TEEN przechodzą przez kontrakt SunSwap Smart Router.',
  'Unknown time': 'Nieznany czas',
  'Unknown amount': 'Nieznana kwota',
  'Connections failed to load.': 'Nie udało się załadować połączeń.',
  'Loading connections': 'Ładowanie połączeń',
  'No wallet connected': 'Nie wybrano walleta',
  'Create or import a wallet to review connected sites and recent token approvals.':
    'Utwórz lub zaimportuj wallet, aby przeglądać połączone strony i ostatnie zgody tokenów.',
  'CONNECTED SITES': 'POŁĄCZONE STRONY',
  'No browser sessions are stored yet.': 'Nie zapisano jeszcze żadnych sesji przeglądarki.',
  'APPROVED CONTRACTS': 'ZATWIERDZONE KONTRAKTY',
  'Unique spender contracts in recent history.': 'Unikalne kontrakty spender w ostatniej historii.',
  'APPROVED TOKENS': 'ZATWIERDZONE TOKENY',
  'Successful approve events': 'Udane zdarzenia approve',
  'Approval tx waiting to finalize': 'Tx approve czeka na finalizację',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    'Połączone strony i zgody on-chain to różne warstwy. Ta build już odczytuje historię approve, ale sesje wallet connect po stronie przeglądarki nie są jeszcze zapisywane.',
  'No connected site cards yet.': 'Nie ma jeszcze kart połączonych stron.',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    'Wbudowana przeglądarka otwiera już strony, ale nie zapisuje jeszcze stanu dostępu do walleta dla każdej domeny. Gdy pojawią się sesje connect po stronie przeglądarki, ta sekcja powinna wyświetlać te domeny jako karty.',
  'ON-CHAIN APPROVALS': 'ZGODY ON-CHAIN',
  'ACTIVE': 'AKTYWNE',
  'LATEST': 'OSTATNIA',
  'ok': 'ok',
  'wait': 'oczekuje',
  'fail': 'błąd',
  'Most recent approval in wallet history': 'Najnowsza zgoda w historii walleta',
  'OPEN CONTRACT': 'OTWÓRZ KONTRAKT',
  'OPEN LATEST TX': 'OTWÓRZ OSTATNIĄ TX',
  'No approval cards yet.': 'Nie ma jeszcze kart zgód.',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    'Ten wallet nie ma ostatnich zdarzeń approve w bieżącym oknie historii. Gdy dapp otrzyma zgodę na wydawanie tokenów, powinien pojawić się tutaj jako karta spendera.',
} as const;

export const CONNECTIONS_SLICE_AR = {
  'Connected sites and token permissions': 'المواقع المتصلة وأذونات التوكنات',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    'تفصل هذه الشاشة بين اتصالات المتصفح وموافقات التوكنات على السلسلة. يجب أن تعرض المواقع المتصلة النطاقات التي مُنحت حق الوصول إلى المحفظة داخل المتصفح المدمج. وتعرض بطاقات الموافقة عقود spender التي حصلت بالفعل على إذن إنفاق التوكنات من المحفظة النشطة.',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    'تمر موافقات swap الخاصة بـ 4TEEN عبر عقد SunSwap Smart Router.',
  'Unknown time': 'الوقت غير معروف',
  'Unknown amount': 'المبلغ غير معروف',
  'Connections failed to load.': 'تعذر تحميل الاتصالات.',
  'Loading connections': 'جارٍ تحميل الاتصالات',
  'No wallet connected': 'لا توجد محفظة محددة',
  'Create or import a wallet to review connected sites and recent token approvals.':
    'أنشئ محفظة أو استوردها لمراجعة المواقع المتصلة وموافقات التوكنات الأخيرة.',
  'CONNECTED SITES': 'المواقع المتصلة',
  'No browser sessions are stored yet.': 'لا توجد جلسات متصفح محفوظة بعد.',
  'APPROVED CONTRACTS': 'العقود الموافق عليها',
  'Unique spender contracts in recent history.': 'عقود spender الفريدة في السجل الحديث.',
  'APPROVED TOKENS': 'التوكنات الموافق عليها',
  'Successful approve events': 'أحداث approve الناجحة',
  'Approval tx waiting to finalize': 'معاملة approve بانتظار الاكتمال',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    'المواقع المتصلة والموافقات على السلسلة طبقتان مختلفتان. هذه النسخة تقرأ سجل approve بالفعل، لكن جلسات wallet connect من جهة المتصفح لا تُحفظ بعد بشكل دائم.',
  'No connected site cards yet.': 'لا توجد بطاقات مواقع متصلة بعد.',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    'يفتح المتصفح المدمج المواقع بالفعل، لكنه لا يخزن بعد حالة وصول المحفظة لكل نطاق. وعندما تتوفر جلسات connect من جهة المتصفح، يجب أن يعرض هذا القسم تلك النطاقات كبطاقات.',
  'ON-CHAIN APPROVALS': 'الموافقات على السلسلة',
  'ACTIVE': 'نشط',
  'LATEST': 'الأحدث',
  'ok': 'ok',
  'wait': 'انتظار',
  'fail': 'فشل',
  'Most recent approval in wallet history': 'أحدث موافقة في سجل المحفظة',
  'OPEN CONTRACT': 'افتح العقد',
  'OPEN LATEST TX': 'افتح آخر TX',
  'No approval cards yet.': 'لا توجد بطاقات موافقة بعد.',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    'لا تحتوي هذه المحفظة على أحداث approve حديثة ضمن نافذة السجل الحالية. عندما يحصل dapp على إذن إنفاق التوكنات، يجب أن يظهر هنا كبطاقة spender.',
} as const;

export const CONNECTIONS_SLICE_HI = {
  'Connected sites and token permissions': 'जुड़ी हुई साइटें और टोकन अनुमतियाँ',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    'यह स्क्रीन ब्राउज़र कनेक्शनों को on-chain token approvals से अलग करती है। Connected sites में वे domain दिखने चाहिए जिन्हें in-app browser के भीतर wallet access दिया गया था। Approval cards उन spender contracts को दिखाती हैं जिन्हें active wallet से token spend permission मिल चुकी है।',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    '4TEEN swap approvals SunSwap Smart Router contract के जरिए जाती हैं।',
  'Unknown time': 'समय अज्ञात है',
  'Unknown amount': 'राशि अज्ञात है',
  'Connections failed to load.': 'कनेक्शन लोड नहीं हो सके।',
  'Loading connections': 'कनेक्शन लोड हो रहे हैं',
  'No wallet connected': 'कोई wallet चयनित नहीं है',
  'Create or import a wallet to review connected sites and recent token approvals.':
    'Connected sites और recent token approvals देखने के लिए wallet बनाएं या import करें।',
  'CONNECTED SITES': 'जुड़ी हुई साइटें',
  'No browser sessions are stored yet.': 'अभी तक कोई browser session सहेजी नहीं गई है।',
  'APPROVED CONTRACTS': 'स्वीकृत कॉन्ट्रैक्ट',
  'Unique spender contracts in recent history.': 'हाल के इतिहास में अद्वितीय spender contracts।',
  'APPROVED TOKENS': 'स्वीकृत टोकन',
  'Successful approve events': 'सफल approve घटनाएँ',
  'Approval tx waiting to finalize': 'Approval tx अंतिम रूप लेने की प्रतीक्षा में है',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    'Connected sites और on-chain approvals अलग-अलग परतें हैं। यह build approval history पहले से पढ़ती है, लेकिन browser-side wallet connect sessions अभी स्थायी रूप से सहेजी नहीं जातीं।',
  'No connected site cards yet.': 'अभी तक connected site cards नहीं हैं।',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    'In-app browser वेबसाइटें खोलता है, लेकिन अभी per-domain wallet access state सहेजता नहीं है। जब browser-side connect sessions मौजूद होंगी, यह section उन domains को cards के रूप में दिखाएगा।',
  'ON-CHAIN APPROVALS': 'ON-CHAIN APPROVALS',
  'ACTIVE': 'सक्रिय',
  'LATEST': 'नवीनतम',
  'ok': 'ok',
  'wait': 'प्रतीक्षा',
  'fail': 'विफल',
  'Most recent approval in wallet history': 'wallet history में सबसे हाल की approval',
  'OPEN CONTRACT': 'कॉन्ट्रैक्ट खोलें',
  'OPEN LATEST TX': 'नवीनतम TX खोलें',
  'No approval cards yet.': 'अभी तक approval cards नहीं हैं।',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    'मौजूदा history window में इस wallet के लिए कोई recent approve event नहीं है। जब किसी dapp को token spend permission मिलती है, तो उसे यहाँ spender card के रूप में दिखना चाहिए।',
} as const;

export const CONNECTIONS_SLICE_JA = {
  'Connected sites and token permissions': '接続済みサイトとトークン権限',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    'この画面は、ブラウザ接続とオンチェーンのトークン承認を分けて表示します。接続済みサイトには、アプリ内ブラウザでウォレットアクセスが許可されたドメインが表示される想定です。承認カードには、アクティブなwalletからすでにトークン使用権限を受け取ったspenderコントラクトが表示されます。',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    '4TEENのswap承認はSunSwap Smart Routerコントラクトを経由します。',
  'Unknown time': '時刻不明',
  'Unknown amount': '金額不明',
  'Connections failed to load.': '接続を読み込めませんでした。',
  'Loading connections': '接続を読み込み中',
  'No wallet connected': 'walletが選択されていません',
  'Create or import a wallet to review connected sites and recent token approvals.':
    '接続済みサイトと最近のトークン承認を確認するには、walletを作成するかインポートしてください。',
  'CONNECTED SITES': '接続済みサイト',
  'No browser sessions are stored yet.': 'ブラウザセッションはまだ保存されていません。',
  'APPROVED CONTRACTS': '承認済みコントラクト',
  'Unique spender contracts in recent history.': '最近の履歴にある一意のspenderコントラクト',
  'APPROVED TOKENS': '承認済みトークン',
  'Successful approve events': '成功したapproveイベント',
  'Approval tx waiting to finalize': 'approve tx は確定待ちです',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    '接続済みサイトとオンチェーン承認は別レイヤーです。このbuildはすでにapprove履歴を読めますが、ブラウザ側のwallet connectセッションはまだ保存されません。',
  'No connected site cards yet.': '接続済みサイトカードはまだありません。',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    'アプリ内ブラウザはすでにサイトを開けますが、ドメインごとのwalletアクセス状態はまだ保存していません。ブラウザ側のconnectセッションが実装されれば、このセクションにそれらのドメインがカードとして表示されるはずです。',
  'ON-CHAIN APPROVALS': 'オンチェーン承認',
  'ACTIVE': '有効',
  'LATEST': '最新',
  'ok': 'ok',
  'wait': '待機',
  'fail': '失敗',
  'Most recent approval in wallet history': 'wallet履歴内の最新承認',
  'OPEN CONTRACT': 'コントラクトを開く',
  'OPEN LATEST TX': '最新TXを開く',
  'No approval cards yet.': '承認カードはまだありません。',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    'このwalletには現在の履歴ウィンドウ内で最近のapproveイベントがありません。dappがトークン使用権限を受け取ると、ここにspenderカードとして表示されるはずです。',
} as const;

export const CONNECTIONS_SLICE_ZH_CN = {
  'Connected sites and token permissions': '已连接网站与代币权限',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    '这个页面把浏览器连接与链上 token approval 分开显示。已连接网站部分应该列出在应用内浏览器中被授予钱包访问权限的域名。Approval 卡片则显示已经从当前 active wallet 获得 token spend permission 的 spender 合约。',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    '4TEEN 的 swap approval 会通过 SunSwap Smart Router 合约路由。',
  'Unknown time': '时间未知',
  'Unknown amount': '数量未知',
  'Connections failed to load.': '连接加载失败。',
  'Loading connections': '正在加载连接',
  'No wallet connected': '未选择钱包',
  'Create or import a wallet to review connected sites and recent token approvals.':
    '请先创建或导入钱包，以查看已连接网站和最近的 token approval。',
  'CONNECTED SITES': '已连接网站',
  'No browser sessions are stored yet.': '当前还没有保存任何浏览器会话。',
  'APPROVED CONTRACTS': '已授权合约',
  'Unique spender contracts in recent history.': '最近历史中的唯一 spender 合约数。',
  'APPROVED TOKENS': '已授权代币',
  'Successful approve events': '成功的 approve 事件',
  'Approval tx waiting to finalize': 'Approval tx 正在等待最终确认',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    '已连接网站与链上 approval 是两个不同层级。这个 build 已经可以读取 approve 历史，但浏览器侧的 wallet connect session 还没有持久化保存。',
  'No connected site cards yet.': '暂时还没有已连接网站卡片。',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    '应用内浏览器已经可以打开网站，但暂时还不会按域名保存钱包访问状态。一旦浏览器侧 connect session 建好，这个区域就应该把这些域名显示成卡片。',
  'ON-CHAIN APPROVALS': '链上授权',
  'ACTIVE': '有效',
  'LATEST': '最新',
  'ok': 'ok',
  'wait': '等待',
  'fail': '失败',
  'Most recent approval in wallet history': '钱包历史中的最近一次 approval',
  'OPEN CONTRACT': '打开合约',
  'OPEN LATEST TX': '打开最新 TX',
  'No approval cards yet.': '暂时还没有 approval 卡片。',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    '这个钱包在当前历史窗口内没有最近的 approve 事件。当某个 dapp 获得 token spend permission 时，它应该出现在这里，显示为 spender 卡片。',
} as const;

export const CONNECTIONS_SLICE_KO = {
  'Connected sites and token permissions': '연결된 사이트와 토큰 권한',
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.':
    '이 화면은 브라우저 연결과 on-chain token approval을 분리해 보여줍니다. 연결된 사이트에는 앱 내 브라우저에서 wallet 접근 권한을 받은 도메인이 표시되어야 합니다. Approval 카드는 active wallet으로부터 이미 token spend permission을 받은 spender 계약을 보여줍니다.',
  '4TEEN swap approvals route through the SunSwap smart router contract.':
    '4TEEN swap approval은 SunSwap Smart Router 계약을 통해 처리됩니다.',
  'Unknown time': '시간 알 수 없음',
  'Unknown amount': '수량 알 수 없음',
  'Connections failed to load.': '연결을 불러오지 못했습니다.',
  'Loading connections': '연결 불러오는 중',
  'No wallet connected': '선택된 wallet이 없습니다',
  'Create or import a wallet to review connected sites and recent token approvals.':
    '연결된 사이트와 최근 token approval을 확인하려면 wallet을 만들거나 가져오세요.',
  'CONNECTED SITES': '연결된 사이트',
  'No browser sessions are stored yet.': '저장된 브라우저 세션이 아직 없습니다.',
  'APPROVED CONTRACTS': '승인된 계약',
  'Unique spender contracts in recent history.': '최근 기록에 있는 고유 spender 계약 수',
  'APPROVED TOKENS': '승인된 토큰',
  'Successful approve events': '성공한 approve 이벤트',
  'Approval tx waiting to finalize': 'Approval tx 가 최종 확정을 기다리는 중입니다',
  'Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.':
    '연결된 사이트와 on-chain approval은 서로 다른 레이어입니다. 이 build는 이미 approve 기록을 읽지만, 브라우저 쪽 wallet connect 세션은 아직 저장되지 않습니다.',
  'No connected site cards yet.': '연결된 사이트 카드가 아직 없습니다.',
  'The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.':
    '앱 내 브라우저는 이미 웹사이트를 열 수 있지만, 도메인별 wallet 접근 상태는 아직 저장하지 않습니다. 브라우저 측 connect 세션이 생기면 이 섹션에서 해당 도메인을 카드로 보여줘야 합니다.',
  'ON-CHAIN APPROVALS': 'ON-CHAIN APPROVALS',
  'ACTIVE': '활성',
  'LATEST': '최신',
  'ok': 'ok',
  'wait': '대기',
  'fail': '실패',
  'Most recent approval in wallet history': 'wallet 기록에서 가장 최근 approval',
  'OPEN CONTRACT': '계약 열기',
  'OPEN LATEST TX': '최신 TX 열기',
  'No approval cards yet.': 'approval 카드가 아직 없습니다.',
  'This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.':
    '이 wallet에는 현재 기록 창 안에 최근 approve 이벤트가 없습니다. dapp이 token spend permission을 받으면 여기에 spender 카드로 표시되어야 합니다.',
} as const;
