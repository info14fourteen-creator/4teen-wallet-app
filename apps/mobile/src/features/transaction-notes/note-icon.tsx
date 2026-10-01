import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme/tokens';

export function NoteIcon({ filled = false, size = 20 }: { filled?: boolean; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6M8 8h4M8 12h3M8 16h2" stroke={filled ? colors.accent : colors.textSoft} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m14 12 1-4 5-5 2 2-5 5-3 2Zm4-7 2 2" stroke={filled ? colors.accent : colors.textSoft} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
