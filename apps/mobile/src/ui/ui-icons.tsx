import type { ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/tokens';
import ToggleOffSvg from '../../assets/icons/ui/toggle_off_btn.svg';
import ToggleOnSvg from '../../assets/icons/ui/toggle_on_btn.svg';

type MdiName = keyof typeof MaterialCommunityIcons.glyphMap;

type UiIconProps = Omit<ComponentProps<typeof MaterialCommunityIcons>, 'name' | 'size'> & {
  width?: number;
  height?: number;
  size?: number;
};

function createIcon(name: MdiName, defaultColor: string = colors.white) {
  return function UiIcon({ width, height, size, color, ...rest }: UiIconProps) {
    const measuredSize = Math.max(width ?? 0, height ?? 0);
    const resolvedSize = size ?? (measuredSize || 22);
    return (
      <MaterialCommunityIcons
        name={name}
        size={resolvedSize}
        color={color ?? defaultColor}
        {...rest}
      />
    );
  };
}

export const OpenDownIcon = createIcon('chevron-down', colors.accent);
export const OpenRightIcon = createIcon('chevron-right', colors.accent);
export const PasteIcon = createIcon('content-paste');
export const ScanIcon = createIcon('qrcode-scan');
export const SwapQuickIcon = createIcon('swap-horizontal');
export const BackspaceIcon = createIcon('backspace-outline');
export const ConfirmIcon = createIcon('check-circle-outline');
export const AddContactIcon = createIcon('account-plus-outline');
export const RemoveContactIcon = createIcon('account-remove-outline');
export const BioLoginIcon = createIcon('fingerprint');
export const BrowserCloseIcon = createIcon('close');
export const BrowserBackIcon = createIcon('arrow-left');
export const BrowserForwardIcon = createIcon('arrow-right');
export const BrowserRefreshIcon = createIcon('refresh');
export const BrowserShareIcon = createIcon('share-variant-outline');
export const AddWalletIcon = createIcon('wallet-plus-outline');
export const WatchOnlyIcon = createIcon('eye-outline');
export const FullAccessIcon = createIcon('battery-outline');
export const CopyIcon = createIcon('content-copy');
export const QrIcon = createIcon('qrcode');
export const ValueSortIcon = createIcon('sort-descending');
export const AzSortIcon = createIcon('sort-alphabetical-ascending');
export const ManageFullIcon = createIcon('wallet-outline');
export const ManageNewIcon = createIcon('plus-circle-outline');
export const ShareIcon = createIcon('share-variant-outline');
export const DeclineIcon = createIcon('close-circle-outline');
export const SendIcon = createIcon('arrow-top-right');
export const ReceiveIcon = createIcon('arrow-bottom-left');
export const HistoryIcon = createIcon('history');
export const AssetsIcon = createIcon('view-grid-outline');
export const MoreIcon = createIcon('dots-horizontal');
export function ToggleOffIcon({ width, height, ...rest }: UiIconProps) {
  return <ToggleOffSvg width={width ?? 64} height={height ?? 36} {...rest} />;
}

export function ToggleOnIcon({ width, height, ...rest }: UiIconProps) {
  return <ToggleOnSvg width={width ?? 64} height={height ?? 36} {...rest} />;
}
export const SearchIcon = createIcon('magnify');
export const CloseIcon = createIcon('close');
export const CreateAddWalletQuickIcon = createIcon('wallet-plus-outline');
export const SendQuickIcon = createIcon('arrow-top-right');
export const BuyQuickIcon = createIcon('credit-card-outline');
export const UnlockQuickIcon = createIcon('lock-open-outline');
export const LiquidityQuickIcon = createIcon('water-outline');
export const AmbassadorQuickIcon = createIcon('account-star-outline');
export const AirdropQuickIcon = createIcon('parachute-outline');
export const SelectWalletQuickIcon = createIcon('wallet-outline');
export const PreferencesIcon = createIcon('tune-variant');
export const WalletIcon = createIcon('wallet-outline');
export const AddressIcon = createIcon('card-account-details-outline');
export const InfoIcon = createIcon('information-outline');
export const MenuIcon = createIcon('menu');
