import { memo, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontFamilies, radius } from '../theme/tokens';

type AddressQrModalProps = {
  visible: boolean;
  walletName?: string;
  address?: string;
  onClose: () => void;
  onCopy: () => void;
};

function AddressQrModal({
  visible,
  walletName,
  address,
  onClose,
  onCopy,
}: AddressQrModalProps) {
  const safeAddress = String(address || '').trim();
  const canRender = safeAddress.length > 0;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) {
      setCopied(false);
    }
  }, [visible]);

  const handleCopy = () => {
    if (!canRender) return;
    onCopy();
    setCopied(true);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.root}>
          <Pressable style={styles.backdrop} onPress={onClose} />

          <View style={styles.card}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 14, right: 14, bottom: 14, left: 14 }}
            >
              <Ionicons name="close" size={18} color={colors.white} />
            </TouchableOpacity>

            <Text style={styles.eyebrow}>RECEIVE</Text>

            <Text style={styles.title} numberOfLines={1}>
              {walletName || 'Wallet Address'}
            </Text>

            <Text style={styles.subtitle}>
              Scan this QR code to send assets to this wallet.
            </Text>

            <View style={styles.qrShell}>
              <View style={styles.qrFrame}>
                {canRender ? (
                  <QRCode
                    value={safeAddress}
                    size={248}
                    color="#000000"
                    backgroundColor="#FFFFFF"
                    quietZone={14}
                  />
                ) : (
                  <View style={styles.qrFallback}>
                    <Text style={styles.qrFallbackText}>No address</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.addressBox}>
              <Text style={styles.addressLabel}>TRON ADDRESS</Text>
              <Text style={styles.addressText} selectable>
                {safeAddress || 'Address unavailable'}
              </Text>
              <Text style={styles.addressWarning}>
                You can only transfer TRON-based tokens (e.g. TRX or TRC10/20/721 tokens) to this
                account. Other tokens may get lost during transfer.
              </Text>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity activeOpacity={0.9} style={styles.secondaryButton} onPress={onClose}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.primaryButton, !canRender && styles.primaryButtonDisabled]}
                onPress={handleCopy}
                disabled={!canRender}
              >
                <Text style={styles.primaryButtonText}>{copied ? 'Copied' : 'Copy Address'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default memo(AddressQrModal);

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },

  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },

  card: {
    position: 'relative',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    backgroundColor: colors.graphite,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 24,
    zIndex: 2,
  },

  closeButton: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,18,18,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    zIndex: 6,
    elevation: 30,
  },

  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.display,
    letterSpacing: 0.45,
  },

  title: {
    marginTop: 10,
    color: colors.white,
    fontSize: 26,
    lineHeight: 32,
    fontFamily: fontFamilies.display,
    paddingRight: 44,
  },

  subtitle: {
    marginTop: 8,
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fontFamilies.displaySemi,
  },

  qrShell: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },

  qrFrame: {
    width: 280,
    height: 280,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },

  qrFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  qrFallbackText: {
    color: '#000000',
    fontSize: 16,
    lineHeight: 20,
    fontFamily: fontFamilies.displaySemi,
  },

  addressBox: {
    marginTop: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },

  addressLabel: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamilies.display,
    letterSpacing: 0.4,
  },

  addressText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fontFamilies.displaySemi,
  },

  addressWarning: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fontFamilies.displaySemi,
  },

  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },

  secondaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  secondaryButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamilies.displaySemi,
  },

  primaryButton: {
    flex: 1.35,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  primaryButtonDisabled: {
    opacity: 0.45,
  },

  primaryButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamilies.display,
  },
});
