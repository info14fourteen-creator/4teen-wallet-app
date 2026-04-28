import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  colors,
  layout,
  radius,
  typography,
} from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNavigationInsets } from '../src/ui/navigation';
import ScreenBrow from '../src/ui/screen-brow';
import { useBottomInset } from '../src/ui/use-bottom-inset';

const AUTO_INTERVAL = 5200;

type SegmentTone = 'normal' | 'orange' | 'green' | 'red';

type Segment = {
  text: string;
  tone?: SegmentTone;
};

type Slide = {
  eyebrow: string;
  title: string;
  body: Segment[];
};

const slides: Slide[] = [
  {
    eyebrow: 'Wallet',
    title: 'Reliable Wallet for TRON',
    body: [
      { text: 'Built for ' },
      { text: 'secure', tone: 'green' },
      { text: ', decentralized and self-custody use. Clear control, direct access and no bloated nonsense between you and your assets.' },
    ],
  },
  {
    eyebrow: 'Ambassador',
    title: 'Ambassador Access Inside',
    body: [
      { text: 'Stay connected to ambassador ecosystem flows and keep growth mechanics close to the wallet, not scattered across random tools.' },
    ],
  },
  {
    eyebrow: 'Airdrop',
    title: 'Structured Airdrop Flow',
    body: [
      { text: 'Follow campaign participation and distribution logic without turning everything into a chaotic ' },
      { text: 'spam circus', tone: 'red' },
      { text: '.' },
    ],
  },
  {
    eyebrow: 'Unlock + Liquidity',
    title: 'Watch Unlock and Growth',
    body: [
      { text: 'Check unlock timeline and protocol liquidity growth in one clean place with ' },
      { text: 'clear visibility', tone: 'green' },
      { text: '.' },
    ],
  },
  {
    eyebrow: 'Direct Buy',
    title: 'Buy 4TEEN Easily',
    body: [
      { text: 'Enter the asset through a simpler wallet-native flow and avoid extra friction when you just want to ' },
      { text: 'buy directly', tone: 'orange' },
      { text: '.' },
    ],
  },
  {
    eyebrow: 'Swap',
    title: 'Fast Swap Access',
    body: [
      { text: 'Move between supported assets without leaving the wallet shell and without the usual ' },
      { text: 'fragmented mess', tone: 'red' },
      { text: '.' },
    ],
  },
];

export default function UiLab() {
  const router = useRouter();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [, setCarouselIndex] = useState(1);

  const bottomInset = useBottomInset(14);

  const screenTier = useMemo(() => {
    if (height <= 740) return 'compact';
    if (height >= 900) return 'tall';
    return 'regular';
  }, [height]);

  const dynamic = useMemo(() => {
    const horizontalPadding = layout.screenPaddingX;
    const slideWidth = width - horizontalPadding * 2;

    if (screenTier === 'compact') {
      return {
        topGap: 12,
        titleLineHeight: 34,
        titleSize: 29,
        middleGap: 18,
        sliderMinHeight: 220,
        bottomTopPadding: 18,
        bottomBottomPadding: 14,
        slideTitleSize: 24,
        slideTitleLineHeight: 30,
        slideTextLineHeight: 24,
        slideVerticalPadding: 18,
        slideGap: 12,
        horizontalPadding,
        slideWidth,
      };
    }

    if (screenTier === 'tall') {
      return {
        topGap: 16,
        titleLineHeight: 42,
        titleSize: typography.titleLg,
        middleGap: 28,
        sliderMinHeight: 290,
        bottomTopPadding: 28,
        bottomBottomPadding: 22,
        slideTitleSize: typography.titleMd,
        slideTitleLineHeight: 36,
        slideTextLineHeight: 28,
        slideVerticalPadding: 28,
        slideGap: 16,
        horizontalPadding,
        slideWidth,
      };
    }

    return {
      topGap: 14,
      titleLineHeight: 40,
      titleSize: typography.titleLg,
      middleGap: 22,
      sliderMinHeight: 255,
      bottomTopPadding: 22,
      bottomBottomPadding: 18,
      slideTitleSize: typography.titleMd,
      slideTitleLineHeight: 34,
      slideTextLineHeight: 26,
      slideVerticalPadding: 24,
      slideGap: 14,
      horizontalPadding,
      slideWidth,
    };
  }, [width, screenTier]);

  const pageSize = dynamic.slideWidth;

  const virtualSlides = useMemo(() => {
    if (slides.length === 0) return [];
    return [slides[slides.length - 1], ...slides, slides[0]];
  }, []);

  const getRealIndex = useCallback((index: number) => {
    if (index <= 0) return slides.length - 1;
    if (index >= slides.length + 1) return 0;
    return index - 1;
  }, []);

  const goToSlide = (index: number, animated = true) => {
    const targetIndex = index + 1;
    scrollRef.current?.scrollTo({
      x: targetIndex * pageSize,
      animated,
    });
    setCarouselIndex(targetIndex);
    setActiveIndex(index);
  };

  const startAutoScroll = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setCarouselIndex((prev) => {
        const next = prev + 1;
        scrollRef.current?.scrollTo({ x: next * pageSize, animated: true });
        setActiveIndex(getRealIndex(next));
        return next;
      });
    }, AUTO_INTERVAL);
  }, [getRealIndex, pageSize]);

  const stopAutoScroll = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: pageSize, animated: false });
      setCarouselIndex(1);
      setActiveIndex(0);
    });
  }, [pageSize]);

  useEffect(() => {
    startAutoScroll();
    return () => stopAutoScroll();
  }, [startAutoScroll, stopAutoScroll]);

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    const nextIndex = Math.round(x / pageSize);

    if (nextIndex <= 0) {
      const resetIndex = slides.length;
      scrollRef.current?.scrollTo({ x: resetIndex * pageSize, animated: false });
      setCarouselIndex(resetIndex);
      setActiveIndex(slides.length - 1);
      return;
    }

    if (nextIndex >= slides.length + 1) {
      scrollRef.current?.scrollTo({ x: pageSize, animated: false });
      setCarouselIndex(1);
      setActiveIndex(0);
      return;
    }

    setCarouselIndex(nextIndex);
    setActiveIndex(nextIndex - 1);
  };

  const renderSegment = (segment: Segment, index: number) => {
    let style = styles.slideText;
    if (segment.tone === 'orange') style = styles.orange;
    if (segment.tone === 'green') style = styles.green;
    if (segment.tone === 'red') style = styles.red;

    return (
      <Text key={`${segment.text}-${index}`} style={[style, { lineHeight: dynamic.slideTextLineHeight }]}>
        {segment.text}
      </Text>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={[styles.screen, { paddingHorizontal: dynamic.horizontalPadding }]}>
        <View style={[styles.top, { gap: dynamic.topGap, marginTop: navInsets.top }]}>
          <ScreenBrow label="4TEEN WALLET" variant="back" />
          <Text
            style={[
              styles.title,
              {
                fontSize: dynamic.titleSize,
                lineHeight: dynamic.titleLineHeight,
              },
            ]}
          >
            Your access point to the <Text style={styles.titleAccent}>4TEEN</Text> ecosystem and beyond
          </Text>
        </View>

        <View style={[styles.middle, { gap: dynamic.middleGap }]}>
          <View style={[styles.sliderViewport, { minHeight: dynamic.sliderMinHeight }]}>
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
              scrollEventThrottle={16}
              onMomentumScrollEnd={handleMomentumEnd}
              onTouchStart={stopAutoScroll}
              onTouchEnd={startAutoScroll}
              contentContainerStyle={styles.sliderContent}
            >
              {virtualSlides.map((slide, index) => (
                <View key={`${slide.title}-${index}`} style={[styles.slidePage, { width: pageSize }]}>
                  <View style={[styles.slideInner, { gap: dynamic.slideGap, paddingVertical: dynamic.slideVerticalPadding }]}>
                    <Text style={ui.sectionEyebrow}>{slide.eyebrow}</Text>

                    <Text
                      style={[
                        styles.slideTitle,
                        {
                          fontSize: dynamic.slideTitleSize,
                          lineHeight: dynamic.slideTitleLineHeight,
                        },
                      ]}
                    >
                      {slide.title}
                    </Text>

                    <Text style={styles.slideTextWrap}>
                      {slide.body.map((segment, index) => renderSegment(segment, index))}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={[styles.dots, { marginTop: 6, marginBottom: 6 }]}>
            {slides.map((slide, index) => (
              <TouchableOpacity
                key={slide.title}
                activeOpacity={0.8}
                onPress={() => {
                  stopAutoScroll();
                  goToSlide(index);
                  startAutoScroll();
                }}
                style={[styles.dot, index === activeIndex && styles.dotActive]}
              />
            ))}
          </View>
        </View>

        <View
          style={[
            styles.bottom,
            {
              paddingTop: dynamic.bottomTopPadding,
              paddingBottom: bottomInset + dynamic.bottomBottomPadding,
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.primaryButton}
            onPress={() => router.push('/create-wallet')}
          >
            <Text style={ui.buttonLabel}>Create Wallet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.secondaryButton}
            onPress={() => router.push('/import-wallet')}
          >
            <Text style={ui.buttonLabel}>Import Wallet</Text>
          </TouchableOpacity>
        </View>
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

  top: {
    marginTop: 0,
  },

  title: {
    color: colors.white,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0,
    maxWidth: '96%',
  },

  titleAccent: {
    color: colors.accent,
    fontFamily: 'Sora_700Bold',
  },

  middle: {
    flex: 1,
    justifyContent: 'center',
  },

  sliderViewport: {
    justifyContent: 'center',
  },

  sliderContent: {
    alignItems: 'center',
  },

  slidePage: {
    justifyContent: 'center',
  },

  slideInner: {
    paddingHorizontal: 2,
  },

  slideTitle: {
    color: colors.white,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0,
  },

  slideTextWrap: {
    fontSize: typography.body,
    letterSpacing: 0,
  },

  slideText: {
    color: colors.textSoft,
    fontSize: typography.body,
    letterSpacing: 0,
  },

  orange: {
    color: colors.accent,
    fontSize: typography.body,
    letterSpacing: 0,
  },

  green: {
    color: colors.green,
    fontSize: typography.body,
    letterSpacing: 0,
  },

  red: {
    color: colors.red,
    fontSize: typography.body,
    letterSpacing: 0,
  },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    opacity: 0.32,
  },

  dotActive: {
    backgroundColor: colors.accent,
    opacity: 1,
  },

  bottom: {
    gap: layout.buttonGap,
  },

  primaryButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  secondaryButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});
