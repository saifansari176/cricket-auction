import { AuctionSettings, PlayerFormField, PlayerFormFieldVisibility } from './auction-settings';

export const DEFAULT_PLAYER_FORM_FIELDS: Record<PlayerFormField, boolean> = {
  photo: true,
  lastName: true,
  jerseyNumber: true,
  playerType: true,
  currentTeam: true,
  category: true,
  tshirtSize: true,
  trouserSize: true,
  note: true,
  baseBid: true
};

export function resolvePlayerFormFields(settings?: PlayerFormFieldVisibility): Record<PlayerFormField, boolean> {
  return { ...DEFAULT_PLAYER_FORM_FIELDS, ...settings };
}

export function isPlayerFormFieldVisible(
  auction: AuctionSettings | null,
  form: 'addPlayer' | 'registration',
  field: PlayerFormField
): boolean {
  return auction?.playerFormFields?.[form]?.[field] !== false;
}
