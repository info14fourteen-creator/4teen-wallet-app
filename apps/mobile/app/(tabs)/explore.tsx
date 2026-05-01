import { Image } from 'expo-image';
import { Platform, StyleSheet } from 'react-native';
import { useI18n } from '../../src/i18n';

import { Collapsible } from '@/components/ui/collapsible';
import { ExternalLink } from '@/components/external-link';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';

export default function TabTwoScreen() {
  const { t } = useI18n();
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
      headerImage={
        <IconSymbol
          size={310}
          color="#808080"
          name="chevron.left.forwardslash.chevron.right"
          style={styles.headerImage}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText
          type="title"
          style={{
            fontFamily: Fonts.rounded,
          }}>
          {t('Explore')}
        </ThemedText>
      </ThemedView>
      <ThemedText>{t('This app includes example code to help you get started.')}</ThemedText>
      <Collapsible title={t('File-based routing')}>
        <ThemedText>
          {t('This app has two screens: ')}
          <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> and{' '}
          <ThemedText type="defaultSemiBold">app/(tabs)/explore.tsx</ThemedText>
        </ThemedText>
        <ThemedText>
          {t('The layout file in ')}
          <ThemedText type="defaultSemiBold">app/(tabs)/_layout.tsx</ThemedText>
          {t(' sets up the tab navigator.')}
        </ThemedText>
        <ExternalLink href="https://docs.expo.dev/router/introduction">
          <ThemedText type="link">{t('Learn more')}</ThemedText>
        </ExternalLink>
      </Collapsible>
      <Collapsible title={t('Android, iOS, and web support')}>
        <ThemedText>
          {t('You can open this project on Android, iOS, and the web. To open the web version, press ')}
          <ThemedText type="defaultSemiBold">w</ThemedText> in the terminal running this project.
        </ThemedText>
      </Collapsible>
      <Collapsible title={t('Images')}>
        <ThemedText>
          {t('For static images, you can use the ')}
          <ThemedText type="defaultSemiBold">@2x</ThemedText> {t('and ')}
          <ThemedText type="defaultSemiBold">@3x</ThemedText> {t('suffixes to provide files for different screen densities')}
        </ThemedText>
        <Image
          source={require('@/assets/images/react-logo.png')}
          style={{ width: 100, height: 100, alignSelf: 'center' }}
        />
        <ExternalLink href="https://reactnative.dev/docs/images">
          <ThemedText type="link">{t('Learn more')}</ThemedText>
        </ExternalLink>
      </Collapsible>
      <Collapsible title={t('Light and dark mode components')}>
        <ThemedText>
          {t('This template has light and dark mode support. The ')}
          <ThemedText type="defaultSemiBold">useColorScheme()</ThemedText> hook lets you inspect
          {t(' the current color scheme, so you can adjust UI colors accordingly.')}
        </ThemedText>
        <ExternalLink href="https://docs.expo.dev/develop/user-interface/color-themes/">
          <ThemedText type="link">{t('Learn more')}</ThemedText>
        </ExternalLink>
      </Collapsible>
      <Collapsible title={t('Animations')}>
        <ThemedText>
          {t('This template includes an example of an animated component. The ')}
          <ThemedText type="defaultSemiBold">components/HelloWave.tsx</ThemedText> component uses
          {t(' component uses the powerful ')}
          <ThemedText type="defaultSemiBold" style={{ fontFamily: Fonts.mono }}>
            react-native-reanimated
          </ThemedText>
          {t(' library to create a waving hand animation.')}
        </ThemedText>
        {Platform.select({
          ios: (
            <ThemedText>
              {t('The ')}
              <ThemedText type="defaultSemiBold">components/ParallaxScrollView.tsx</ThemedText>
              {t(' component provides a parallax effect for the header image.')}
            </ThemedText>
          ),
        })}
      </Collapsible>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
});
