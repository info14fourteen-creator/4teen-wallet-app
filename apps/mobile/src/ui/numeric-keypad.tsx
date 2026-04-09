import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../theme/tokens';

type NumericKeypadProps = {
  onDigitPress: (digit: string) => void;
  onBackspacePress: () => void;
  leftSlot?: React.ReactNode;
  showDot?: boolean;
  onDotPress?: () => void;
  backspaceIcon?: React.ReactNode;
};

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function NumericKeypad({
  onDigitPress,
  onBackspacePress,
  leftSlot = null,
  showDot = false,
  onDotPress,
  backspaceIcon,
}: NumericKeypadProps) {
  return (
    <View style={styles.keypad}>
      {keys.map((key) => (
        <TouchableOpacity
          key={key}
          activeOpacity={0.9}
          style={styles.key}
          onPress={() => onDigitPress(key)}
        >
          <Text style={styles.keyText}>{key}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        activeOpacity={showDot ? 0.9 : 1}
        style={[styles.key, !showDot && !leftSlot ? styles.keyEmpty : null]}
        disabled={!showDot && !leftSlot}
        onPress={() => {
          if (showDot && onDotPress) onDotPress();
        }}
      >
        {leftSlot ? leftSlot : showDot ? <Text style={styles.keyText}>.</Text> : null}
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.key}
        onPress={() => onDigitPress('0')}
      >
        <Text style={styles.keyText}>0</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.key}
        onPress={onBackspacePress}
      >
        {backspaceIcon ? backspaceIcon : <Text style={styles.keyText}>⌫</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginBottom: 20,
    minHeight: 280,
  },

  key: {
    width: '30.5%',
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  keyEmpty: {
    opacity: 0,
  },

  keyText: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: 'Sora_700Bold',
  },
});
