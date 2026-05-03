import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useI18n, useLocaleLayout } from '../src/i18n';
import { useNotice } from '../src/notice/notice-provider';
import { submitAppFeedback, type AppFeedbackType } from '../src/services/feedback';
import { ProductScreen } from '../src/ui/product-shell';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

const FEEDBACK_TYPES: {
  key: AppFeedbackType;
  title: string;
  helper: string;
}[] = [
  {
    key: 'issue',
    title: 'Something is broken',
    helper: 'Use this when a flow fails, numbers look wrong, or an action gets stuck.',
  },
  {
    key: 'confusing',
    title: 'Something is confusing',
    helper: 'Use this when the screen works, but the logic or wording is not clear.',
  },
  {
    key: 'slow',
    title: 'Something is slow',
    helper: 'Use this when loading, switching, or submitting feels too heavy.',
  },
  {
    key: 'idea',
    title: 'I have an idea',
    helper: 'Use this when you want to improve a screen or flow before it hurts users.',
  },
  {
    key: 'praise',
    title: 'This feels good',
    helper: 'Use this when you want to keep a pattern exactly because it works.',
  },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sourceScreen?: string }>();
  const notice = useNotice();
  const { t } = useI18n();
  const locale = useLocaleLayout();
  const [selectedType, setSelectedType] = useState<AppFeedbackType>('issue');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const sourceScreen = String(params.sourceScreen || 'wallet').trim() || 'wallet';
  const selectedMeta = useMemo(
    () => FEEDBACK_TYPES.find((item) => item.key === selectedType) || FEEDBACK_TYPES[0],
    [selectedType]
  );

  const handleSubmit = async () => {
    if (sending) {
      return;
    }

    setSending(true);

    try {
      await submitAppFeedback({
        type: selectedType,
        title: selectedMeta.title,
        message: message.trim() || selectedMeta.helper,
        sourceScreen,
        details: {
          feedbackType: selectedType,
          sourceScreen,
        },
      });

      notice.showSuccessNotice(t('Feedback sent to 4TEEN Ops.'), 3200);
      router.back();
    } catch (error) {
      console.warn('[4TEEN] feedback submit failed', error);
      notice.showErrorNotice(t('Feedback could not be sent right now.'), 3600);
    } finally {
      setSending(false);
    }
  };

  return (
    <ProductScreen
      eyebrow={t('FEEDBACK')}
      browVariant="back"
      keyboardAware
      keyboardExtraScrollHeight={220}
      bottomInsetExtra={150}
    >
      <View style={styles.heroCard}>
        <Text style={[ui.titleMd, locale.textStart]}>{t('Tell 4TEEN Ops what you see')}</Text>
        <Text style={[styles.heroBody, locale.textStart]}>
          {t('This goes straight into the private ops bot, together with app version, current source screen, and a masked wallet hint.')}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[ui.sectionEyebrow, locale.textStart]}>{t('What kind of feedback is this?')}</Text>
        <View style={styles.typeList}>
          {FEEDBACK_TYPES.map((item) => {
            const active = item.key === selectedType;

            return (
              <Pressable
                key={item.key}
                style={[styles.typeCard, active && styles.typeCardActive]}
                onPress={() => setSelectedType(item.key)}
              >
                <Text style={[styles.typeTitle, locale.textStart, active && styles.typeTitleActive]}>{t(item.title)}</Text>
                <Text style={[styles.typeHelper, locale.textStart, active && styles.typeHelperActive]}>{t(item.helper)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[ui.sectionEyebrow, locale.textStart]}>{t('Short note')}</Text>
        <Text style={[styles.inputHelper, locale.textStart]}>
          {t('Please do not paste a seed phrase or a private key here.')}
        </Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          editable={!sending}
          multiline
          maxLength={500}
          placeholder={t('What exactly did you notice?')}
          placeholderTextColor={colors.textDim}
          style={[styles.input, locale.textStart]}
          textAlignVertical="top"
        />
      </View>

      <Pressable style={[styles.submitButton, sending && styles.submitButtonDisabled]} onPress={handleSubmit}>
        {sending ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <Text style={styles.submitLabel}>{t('Send to 4TEEN Ops')}</Text>
        )}
      </Pressable>
    </ProductScreen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    marginTop: spacing[2],
    marginBottom: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    gap: 10,
  },

  heroBody: {
    ...ui.body,
    color: colors.textSoft,
  },

  section: {
    marginBottom: spacing[3],
    gap: 10,
  },

  inputHelper: {
    ...ui.body,
    color: colors.textDim,
  },

  typeList: {
    gap: 10,
  },

  typeCard: {
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    gap: 6,
  },

  typeCardActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,105,0,0.12)',
  },

  typeTitle: {
    ...ui.actionLabel,
    color: colors.white,
  },

  typeTitleActive: {
    color: colors.accent,
  },

  typeHelper: {
    ...ui.body,
    color: colors.textDim,
  },

  typeHelperActive: {
    color: colors.textSoft,
  },

  input: {
    minHeight: 150,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    color: colors.white,
    fontSize: 16,
    lineHeight: 22,
  },

  submitButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[1],
    marginBottom: spacing[2],
  },

  submitButtonDisabled: {
    opacity: 0.72,
  },

  submitLabel: {
    ...ui.actionLabel,
    color: colors.white,
  },
});
