import StubScreen from '../src/ui/stub-screen';
import { useI18n } from '../src/i18n';

export default function MultisigTransactionsScreen() {
  const { t } = useI18n();

  return (
    <StubScreen
      eyebrow={t('MULTISIG TRANSACTIONS')}
      title={t('Multisig Transactions')}
      body={t(
        'Coming soon. Multisig setup, co-signing, and pending signature management will be available here through the in-app browser flow.'
      )}
    />
  );
}
