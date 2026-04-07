import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';

export default function BootScreen() {
  const router = useRouter();

  const [progress, setProgress] = useState(0);
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let value = 0;

    const interval = setInterval(() => {
      value += Math.random() * 5;

      if (value < 99) {
        setProgress(Math.floor(value));
        animate(value);
      } else if (value < 114) {
        value += 1.5;
        setProgress(Math.min(114, Math.floor(value)));
        animate(value);
      }

      if (value >= 114) {
        clearInterval(interval);

        setTimeout(() => {
          // временно всегда ведем на welcome
          router.replace('/create-wallet');
        }, 400);
      }
    }, 80);

    return () => clearInterval(interval);
  }, []);

  const animate = (val: number) => {
    Animated.timing(animatedWidth, {
      toValue: val,
      duration: 80,
      useNativeDriver: false,
    }).start();
  };

  const isOver = progress >= 99;

  return (
    <View style={styles.container}>
      <Text style={[styles.percent, isOver && styles.orange]}>
        {progress}%
      </Text>

      <View style={styles.lineWrapper}>
        <Animated.View
          style={[
            styles.line,
            isOver && styles.orangeBg,
            {
              width: animatedWidth.interpolate({
                inputRange: [0, 114],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgb(26,26,26)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  percent: {
    fontSize: 42,
    color: 'rgb(242,242,242)',
    marginBottom: 20,
    fontWeight: '500',
  },
  orange: {
    color: 'rgb(255,105,0)',
  },
  lineWrapper: {
    width: '70%',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  line: {
    height: 2,
    backgroundColor: 'rgb(242,242,242)',
  },
  orangeBg: {
    backgroundColor: 'rgb(255,105,0)',
  },
});
