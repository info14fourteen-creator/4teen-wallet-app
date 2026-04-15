import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import MenuSheet from '../src/ui/menu-sheet';
import SubmenuHeader from '../src/ui/submenu-header';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';

import AddContactIcon from '../assets/icons/ui/add_contact_btn.svg';
import OpenDownIcon from '../assets/icons/ui/open_down_btn.svg';
import ConfirmIcon from '../assets/icons/ui/confirm_btn.svg';
import RemoveContactIcon from '../assets/icons/ui/remove_contact_btn.svg';

type ContactItem = {
  id: string;
  name: string;
  address: string;
};

const STORAGE_KEY = 'fourteen_wallet_address_book_v3';
const MAX_CONTACT_NAME_LENGTH = 18;
const REMOVE_HOLD_MS = 7000;
const REMOVE_DISPLAY_MAX = 114;

const defaultContacts: ContactItem[] = [];

function isValidTronAddress(value: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value.trim());
}

export default function AddressBookScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    openAdd?: string | string[];
    prefillName?: string | string[];
    prefillAddress?: string | string[];
  }>();
  const notice = useNotice();
  const insets = useSafeAreaInsets();
  const contentBottomInset = 62 + Math.max(insets.bottom, 6);

  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [contacts, setContacts] = useState<ContactItem[]>(defaultContacts);
  const [loaded, setLoaded] = useState(false);

  const [removalContactId, setRemovalContactId] = useState<string | null>(null);
  const [removalProgress, setRemovalProgress] = useState(0);

  const removalStartedAtRef = useRef<number | null>(null);
  const removalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const removalCompletedRef = useRef(false);
  const prefillAppliedRef = useRef(false);

  const addressValid = useMemo(() => isValidTronAddress(address), [address]);
  const canSave = name.trim().length > 0 && addressValid;

  const clearRemovalTimer = useCallback(() => {
    if (removalTimerRef.current) {
      clearInterval(removalTimerRef.current);
      removalTimerRef.current = null;
    }
  }, []);

  const resetRemovalState = useCallback(() => {
    clearRemovalTimer();
    removalStartedAtRef.current = null;
    removalCompletedRef.current = false;
    setRemovalContactId(null);
    setRemovalProgress(0);
  }, [clearRemovalTimer]);

  useEffect(() => {
    void loadContacts();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    void persistContacts(contacts);
  }, [contacts, loaded]);

  useEffect(() => {
    return () => {
      clearRemovalTimer();
    };
  }, [clearRemovalTimer]);

  useEffect(() => {
    if (!loaded) return;
    if (prefillAppliedRef.current) return;

    const openAddParam = Array.isArray(params.openAdd) ? params.openAdd[0] : params.openAdd;
    const prefillNameParam = Array.isArray(params.prefillName) ? params.prefillName[0] : params.prefillName;
    const prefillAddressParam = Array.isArray(params.prefillAddress) ? params.prefillAddress[0] : params.prefillAddress;

    if (openAddParam === '1' || prefillNameParam || prefillAddressParam) {
      prefillAppliedRef.current = true;
      setAddOpen(true);

      if (prefillNameParam) {
        setName(String(prefillNameParam).slice(0, MAX_CONTACT_NAME_LENGTH));
      }

      if (prefillAddressParam) {
        setAddress(String(prefillAddressParam).trim());
      }
    }
  }, [loaded, params.openAdd, params.prefillAddress, params.prefillName]);

  const loadContacts = async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);

      if (!raw) {
        setContacts(defaultContacts);
        return;
      }

      const parsed = JSON.parse(raw) as ContactItem[];

      if (Array.isArray(parsed) && parsed.length > 0) {
        setContacts(parsed);
      } else {
        setContacts(defaultContacts);
      }
    } catch (error) {
      console.error('Failed to load address book', error);
      setContacts(defaultContacts);
      notice.showErrorNotice('Failed to load address book.', 2600);
    } finally {
      setLoaded(true);
    }
  };

  const persistContacts = async (nextContacts: ContactItem[]) => {
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(nextContacts));
    } catch (error) {
      console.error('Failed to save address book', error);
      notice.showErrorNotice('Failed to save address book.', 2600);
    }
  };

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setAddress(text.trim());
    }
  };

  const handleCopy = useCallback(
    async (value: string) => {
      await Clipboard.setStringAsync(value);
      notice.showSuccessNotice('Address copied.', 2200);
    },
    [notice]
  );

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();

    if (!trimmedName) {
      notice.showErrorNotice('Enter a contact name first.', 2200);
      return;
    }

    if (trimmedName.length > MAX_CONTACT_NAME_LENGTH) {
      notice.showErrorNotice(
        `Contact name must be ${MAX_CONTACT_NAME_LENGTH} characters or less.`,
        2600
      );
      return;
    }

    if (!isValidTronAddress(trimmedAddress)) {
      notice.showErrorNotice('Enter a valid TRON address.', 2200);
      return;
    }

    const exists = contacts.some(
      (item) => item.address.toLowerCase() === trimmedAddress.toLowerCase()
    );

    if (exists) {
      notice.showErrorNotice('This TRON address is already saved.', 2400);
      return;
    }

    const next: ContactItem = {
      id: `${Date.now()}`,
      name: trimmedName,
      address: trimmedAddress,
    };

    setContacts((prev) => [next, ...prev]);
    setName('');
    setAddress('');
    setAddOpen(false);
    notice.showSuccessNotice('Contact saved.', 2200);
  }, [address, contacts, name, notice]);

  const handleDeleteConfirmed = useCallback(
    (id: string) => {
      setContacts((prev) => prev.filter((item) => item.id !== id));
      resetRemovalState();
      notice.showSuccessNotice('Contact removed.', 2200);
    },
    [notice, resetRemovalState]
  );

  const handleDeletePress = useCallback(() => {
    notice.showNeutralNotice('To delete, press and hold.', 2200);
  }, [notice]);

  const handleDeletePressIn = useCallback(
    (contactId: string) => {
      clearRemovalTimer();
      removalCompletedRef.current = false;
      removalStartedAtRef.current = Date.now();
      setRemovalContactId(contactId);
      setRemovalProgress(0);

      removalTimerRef.current = setInterval(() => {
        const startedAt = removalStartedAtRef.current;
        if (!startedAt) return;

        const elapsed = Date.now() - startedAt;
        const fraction = Math.max(0, Math.min(1, elapsed / REMOVE_HOLD_MS));
        const displayProgress = Math.round(fraction * REMOVE_DISPLAY_MAX);

        setRemovalProgress(displayProgress);

        if (fraction >= 1 && !removalCompletedRef.current) {
          removalCompletedRef.current = true;
          clearRemovalTimer();
          handleDeleteConfirmed(contactId);
        }
      }, 50);
    },
    [clearRemovalTimer, handleDeleteConfirmed]
  );

  const handleDeletePressOut = useCallback(() => {
    if (removalCompletedRef.current) {
      return;
    }

    resetRemovalState();
  }, [resetRemovalState]);

  const handleSend = useCallback(
    (contact: ContactItem) => {
      router.push({
        pathname: '/send',
        params: {
          address: contact.address,
          contactName: contact.name,
        },
      } as any);
    },
    [router]
  );

  const addressValidationTone =
    address.length === 0
      ? null
      : addressValid
        ? styles.headerValidationOk
        : styles.headerValidationBad;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader onMenuPress={() => setMenuOpen(true)} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: contentBottomInset }]}
          showsVerticalScrollIndicator={false}
          bounces
        >
          <SubmenuHeader title="ADDRESS BOOK" onBack={() => router.back()} />

          <View style={styles.addRowWrap}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.addRow}
              onPress={() => setAddOpen((prev) => !prev)}
            >
              <Text style={ui.actionLabel}>Add Contact</Text>

              {addOpen ? (
                <OpenDownIcon width={20} height={20} />
              ) : (
                <AddContactIcon width={20} height={20} />
              )}
            </TouchableOpacity>
          </View>

          {addOpen ? (
            <View style={styles.form}>
              <View style={styles.inputWrap}>
                <View style={styles.fieldHeaderRow}>
                  <Text style={ui.sectionEyebrow}>TRON Address</Text>

                  {address.length > 0 ? (
                    <Text style={[styles.headerValidation, addressValidationTone]}>
                      {addressValid ? 'VALID' : 'INVALID'}
                    </Text>
                  ) : null}
                </View>

                <View
                  style={[
                    styles.addressField,
                    address.length > 0 && !addressValid ? styles.addressFieldInvalid : null,
                  ]}
                >
                  <TextInput
                    value={address}
                    onChangeText={setAddress}
                    placeholder="T..."
                    placeholderTextColor={colors.textDim}
                    style={styles.addressInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.inlineIconButton}
                    onPress={handlePaste}
                  >
                    <Ionicons name="clipboard-outline" size={18} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputWrap}>
                <Text style={ui.sectionEyebrow}>Name</Text>

                <View style={styles.nameField}>
                  <TextInput
                    value={name}
                    onChangeText={(value) => setName(value.slice(0, MAX_CONTACT_NAME_LENGTH))}
                    placeholder="Contact name"
                    placeholderTextColor={colors.textDim}
                    style={styles.nameInput}
                    maxLength={MAX_CONTACT_NAME_LENGTH}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                  />

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.inlineIconButton}
                    onPress={handleSave}
                    disabled={!canSave}
                  >
                    <ConfirmIcon width={18} height={18} opacity={canSave ? 1 : 0.35} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.contactList}>
            {contacts.map((contact) => {
              const removing = removalContactId === contact.id;
              const removalFillWidth = `${Math.min(
                100,
                (removalProgress / REMOVE_DISPLAY_MAX) * 100
              )}%`;
              const removalProgressColor =
                removalProgress >= REMOVE_DISPLAY_MAX ? colors.white : colors.red;

              return (
                <View key={contact.id} style={styles.contactCard}>
                  <View style={styles.contactTopRow}>
                    <Text style={styles.contactName}>{contact.name.toUpperCase()}</Text>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.removeHoldButton}
                      onPress={handleDeletePress}
                      onPressIn={() => handleDeletePressIn(contact.id)}
                      onPressOut={handleDeletePressOut}
                    >
                      {removing ? (
                        <Text style={[styles.removeHoldProgress, { color: removalProgressColor }]}>
                          {removalProgress}%
                        </Text>
                      ) : (
                        <RemoveContactIcon width={18} height={18} />
                      )}
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => void handleCopy(contact.address)}
                  >
                    <Text
                      style={styles.contactAddress}
                      numberOfLines={1}
                      ellipsizeMode="middle"
                    >
                      {contact.address}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.contactActions}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => void handleCopy(contact.address)}
                      style={styles.actionSlot}
                    >
                      <Text style={styles.copyAction}>Copy Address</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => handleSend(contact)}
                      style={styles.actionSlot}
                    >
                      <Text style={styles.sendAction}>Send Crypto</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.removeStripRow}>
                    {removing ? (
                      <View style={[styles.removeHoldFill, { width: removalFillWidth as any }]} />
                    ) : null}
                  </View>
                </View>
              );
            })}

            {contacts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No saved contacts yet.</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
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
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: APP_HEADER_TOP_PADDING,
  },

  headerSlot: {
    height: APP_HEADER_HEIGHT,
    justifyContent: 'center',
  },

  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    paddingTop: 14,
    gap: 16,
  },

  addRowWrap: {
    marginTop: -8,
  },

  addRow: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  form: {
    gap: 14,
    marginTop: -4,
  },

  inputWrap: {
    gap: 8,
  },

  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerValidation: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    letterSpacing: 0.3,
  },

  headerValidationOk: {
    color: colors.green,
  },

  headerValidationBad: {
    color: colors.red,
  },

  addressField: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  addressFieldInvalid: {
    borderColor: colors.red,
  },

  addressInput: {
    flex: 1,
    color: colors.white,
    fontFamily: 'Sora_600SemiBold',
  },

  nameField: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  nameInput: {
    flex: 1,
    color: colors.white,
    fontFamily: 'Sora_600SemiBold',
  },

  inlineIconButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  contactList: {
    gap: 12,
  },

  contactCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
  },

  contactTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },

  contactName: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
  },

  contactAddress: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 22,
    marginTop: 4,
  },

  actionSlot: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },

  copyAction: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  sendAction: {
    color: colors.green,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  removeHoldButton: {
    minWidth: 28,
    height: 22,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  removeHoldProgress: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    zIndex: 2,
  },

  removeStripRow: {
    height: 6,
    justifyContent: 'flex-end',
    position: 'relative',
    overflow: 'hidden',
  },

  removeHoldFill: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 1,
    backgroundColor: colors.red,
    opacity: 0.95,
    borderRadius: radius.pill,
  },

  emptyState: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
});
