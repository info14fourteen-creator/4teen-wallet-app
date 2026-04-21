import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import InlineRefreshLoader from '../src/ui/inline-refresh-loader';
import { NavigationChrome, useNavigationInsets } from '../src/ui/navigation';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { useNotice } from '../src/notice/notice-provider';

import { colors, layout } from '../src/theme/tokens';
import {
  patterns,
  patternIcons,
  patternHitSlop,
  patternPress,
} from '../src/theme/patterns';

import { OpenRightIcon, WalletIcon } from '../src/ui/ui-icons';

const BROW_SYSTEM_RULES = `Brow System

1. browPlain
Use for root-level internal screen heading without return action.

2. browBack
Use for nested screen heading with back action on the right.

3. browBackLink
Use for nested screen heading with back action and a linked destination cue.

4. browLinkIcon
Use for screen heading with:
title + open-right on the left,
linked icon on the right,
without back action.

Placement
- Always first content block inside screen content.
- Same top position on every screen.
- Same label size, spacing, icon sizes, and touch target.
- Back text must stay non-bold.
- Do not wrap brows inside demo cards on real screens.
- Do not hand-build random brow variations in screen files.`;

const ARCHIVE_WORKFLOW_TEXT = `Project workflow rules

Language and comments
- We communicate in Russian.
- Do not add Russian comments inside code.
- Code comments must stay in English.

How I usually work with you
- First I ask for a command to find the needed files in the project.
- Then I ask for the full code with line numbers.
- Before any edit or rewrite, make a backup first.
- Prefer targeted patches.
- If a patch is not realistic, rewrite the file fully.

How you should answer
- Give terminal-ready copy-paste commands.
- Do not send vague diffs if I asked for commands.
- If you change files, be precise and minimal when possible.
- If you rewrite a file, give the full file content.
- Keep project structure clean and reusable.

Examples I can send you
- "Дай команду найти все файлы связанные с wallet management"
- "Запроси полный код с номерами строк"
- "Сначала сделай бэк ап перед правкой"
- "Нужен патч, не переписывай файл целиком если можно"
- "Если патч невозможен, дай полный файл под копипаст"
- "Проверь что решение не ломает остальные страницы"
- "Дай только команды в терминал"
- "Убери русские комментарии из кода, но со мной общайся по-русски"`;

const BROW_COPY_BLOCKS = {
  browPlain: `<View style={patterns.browPlain}>
  <Text style={patterns.browLabel}>HOME</Text>
</View>`,

  browBack: `<View style={patterns.browBack}>
  <Text style={patterns.browLabel}>SCAN</Text>

  <TouchableOpacity
    activeOpacity={patternPress.brow}
    style={patterns.browRightTouch}
    hitSlop={patternHitSlop.comfort}
    onPress={() => router.back()}
  >
    <Ionicons name="arrow-back" size={patternIcons.browBack} color={colors.accent} />
    <Text style={patterns.browBackText}>back</Text>
  </TouchableOpacity>
</View>`,

  browBackLink: `<View style={patterns.browBackLink}>
  <View style={patterns.browLeftCluster}>
    <Text style={patterns.browLabel}>TOKEN DETAILS</Text>
    <OpenRightIcon width={patternIcons.browChevron} height={patternIcons.browChevron} />
  </View>

  <TouchableOpacity
    activeOpacity={patternPress.brow}
    style={patterns.browRightTouch}
    hitSlop={patternHitSlop.comfort}
    onPress={() => router.back()}
  >
    <Ionicons name="arrow-back" size={patternIcons.browBack} color={colors.accent} />
    <Text style={patterns.browBackText}>back</Text>
  </TouchableOpacity>
</View>`,

  browLinkIcon: `<View style={patterns.browLinkIcon}>
  <View style={patterns.browLeftCluster}>
    <Text style={patterns.browLabel}>SELECT WALLET</Text>
    <OpenRightIcon width={patternIcons.browChevron} height={patternIcons.browChevron} />
  </View>

  <TouchableOpacity
    activeOpacity={patternPress.brow}
    style={patterns.browRightTouch}
    hitSlop={patternHitSlop.comfort}
    onPress={() => {}}
  >
    <WalletIcon width={patternIcons.browLinked} height={patternIcons.browLinked} />
  </TouchableOpacity>
</View>`,
} as const;

type CopyBlockProps = {
  title: string;
  value: string;
  onCopy: (value: string, label: string) => Promise<void>;
};

function CopyBlock({ title, value, onCopy }: CopyBlockProps) {
  const lines = value.split('\n');

  return (
    <View style={styles.copyBlock}>
      <Text style={patterns.textCodeLabel}>{title}</Text>

      <View style={styles.codeBox}>
        {lines.map((line, index) => (
          <Text
            key={`${title}-${index}-${line.slice(0, 16)}`}
            style={[patterns.textCodeLine, !line.trim() && styles.codeSpacer]}
          >
            {line || ' '}
          </Text>
        ))}
      </View>

      <TouchableOpacity
        activeOpacity={patternPress.brow}
        style={patterns.buttonPrimary}
        onPress={() => void onCopy(value, title)}
      >
        <Text style={patterns.textButtonOnAccent}>Copy {title}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function UiShellLab() {
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const navInsets = useNavigationInsets({
    topExtra: 14,
    bottomExtra: 20,
  });

  const notice = useNotice();
  useChromeLoading(refreshing);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setRefreshing(false);
  }, []);

  const handleCopy = useCallback(
    async (value: string, label: string) => {
      await Clipboard.setStringAsync(value);
      notice.showSuccessNotice(`${label} copied.`, 1800);
    },
    [notice]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: navInsets.top,
              paddingBottom: navInsets.bottom,
            },
          ]}
          showsVerticalScrollIndicator={false}
          bounces
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.bg}
            />
          }
        >
          <InlineRefreshLoader visible={refreshing} />
          <View style={styles.hero}>
            <Text style={patterns.textEyebrow}>UI SYSTEM</Text>
            <Text style={patterns.textTitleLg}>Brow System</Text>
            <Text style={patterns.textBody}>
              Visual vitrine for page-top brows. Pick the variant, copy the block, and stop
              inventing a fifth one.
            </Text>
          </View>

          <View style={styles.sectionHead}>
            <Text style={patterns.textEyebrow}>BROW SYSTEM</Text>
            <Text style={patterns.textTitleSm}>Visual reference</Text>
          </View>

          <View style={patterns.browPlain}>
            <Text style={patterns.browLabel}>HOME</Text>
          </View>
          <CopyBlock title="browPlain" value={BROW_COPY_BLOCKS.browPlain} onCopy={handleCopy} />

          <View style={patterns.browBack}>
            <Text style={patterns.browLabel}>SCAN</Text>

            <TouchableOpacity
              activeOpacity={patternPress.brow}
              style={patterns.browRightTouch}
              hitSlop={patternHitSlop.comfort}
              onPress={() => {}}
            >
              <Ionicons
                name="arrow-back"
                size={patternIcons.browBack}
                color={colors.accent}
              />
              <Text style={patterns.browBackText}>back</Text>
            </TouchableOpacity>
          </View>
          <CopyBlock title="browBack" value={BROW_COPY_BLOCKS.browBack} onCopy={handleCopy} />

          <View style={patterns.browBackLink}>
            <View style={patterns.browLeftCluster}>
              <Text style={patterns.browLabel}>TOKEN DETAILS</Text>
              <OpenRightIcon
                width={patternIcons.browChevron}
                height={patternIcons.browChevron}
              />
            </View>

            <TouchableOpacity
              activeOpacity={patternPress.brow}
              style={patterns.browRightTouch}
              hitSlop={patternHitSlop.comfort}
              onPress={() => {}}
            >
              <Ionicons
                name="arrow-back"
                size={patternIcons.browBack}
                color={colors.accent}
              />
              <Text style={patterns.browBackText}>back</Text>
            </TouchableOpacity>
          </View>
          <CopyBlock
            title="browBackLink"
            value={BROW_COPY_BLOCKS.browBackLink}
            onCopy={handleCopy}
          />

          <View style={patterns.browLinkIcon}>
            <View style={patterns.browLeftCluster}>
              <Text style={patterns.browLabel}>SELECT WALLET</Text>
              <OpenRightIcon
                width={patternIcons.browChevron}
                height={patternIcons.browChevron}
              />
            </View>

            <TouchableOpacity
              activeOpacity={patternPress.brow}
              style={patterns.browRightTouch}
              hitSlop={patternHitSlop.comfort}
              onPress={() => {}}
            >
              <WalletIcon
                width={patternIcons.browLinked}
                height={patternIcons.browLinked}
              />
            </TouchableOpacity>
          </View>
          <CopyBlock
            title="browLinkIcon"
            value={BROW_COPY_BLOCKS.browLinkIcon}
            onCopy={handleCopy}
          />

          <View style={styles.rulesBlock}>
            <Text style={patterns.textBlockTitle}>Brow rules</Text>

            <View style={styles.codeBox}>
              {BROW_SYSTEM_RULES.split('\n').map((line, index) => (
                <Text
                  key={`brow-rules-${index}-${line.slice(0, 16)}`}
                  style={[patterns.textCodeLine, !line.trim() && styles.codeSpacer]}
                >
                  {line || ' '}
                </Text>
              ))}
            </View>

            <TouchableOpacity
              activeOpacity={patternPress.brow}
              style={patterns.buttonPrimary}
              onPress={() => void handleCopy(BROW_SYSTEM_RULES, 'browRules')}
            >
              <Text style={patterns.textButtonOnAccent}>Copy brow rules</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <View style={styles.sectionHead}>
            <Text style={patterns.textEyebrow}>ARCHIVE</Text>
            <Text style={patterns.textTitleSm}>Stored project text</Text>
          </View>
          <CopyBlock
            title="workflowArchive"
            value={ARCHIVE_WORKFLOW_TEXT}
            onCopy={handleCopy}
          />
        </ScrollView>

        <NavigationChrome
          menuOpen={menuOpen}
          onOpenMenu={() => setMenuOpen(true)}
          onCloseMenu={() => setMenuOpen(false)}
          forceFooterVisible
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    paddingHorizontal: layout.screenPaddingX,
    gap: 16,
  },

  hero: {
    gap: 10,
    marginBottom: 2,
  },

  sectionHead: {
    gap: 6,
    marginTop: 6,
  },

  copyBlock: {
    gap: 10,
    marginBottom: 4,
  },

  rulesBlock: {
    gap: 10,
    marginTop: 2,
  },

  codeBox: {
    ...patterns.surfaceBoxDarkCompact,
    gap: 6,
  },

  codeSpacer: {
    minHeight: 8,
  },

  divider: {
    height: 1,
    backgroundColor: colors.lineSoft,
    opacity: 0.7,
    marginVertical: 4,
  },
});
