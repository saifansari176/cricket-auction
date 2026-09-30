export type PlayerFormField =
  | 'photo'
  | 'lastName'
  | 'jerseyNumber'
  | 'playerType'
  | 'currentTeam'
  | 'category'
  | 'tshirtSize'
  | 'trouserSize'
  | 'note'
  | 'baseBid';

export type PlayerFormFieldVisibility = Partial<Record<PlayerFormField, boolean>>;

export interface PlayerFormFieldSettings {
  addPlayer?: PlayerFormFieldVisibility;
  registration?: PlayerFormFieldVisibility;
}

export interface AuctionSettings {

  id?: string;

  auctionName:string;

  auctionDate:string;

  logo:string;

  pointsPerTeam:number;

  playersPerTeam:number;

  teamLimit?: number;

  playerLimit?: number;

  basePlayerPrice:number;

  bidIncrement:number;

  minimumBid:number;
  
  bidIncreaseBy:number;

  registrationLinkEnabled?: boolean;

  registrationPaymentEnabled?: boolean;

  registrationPaymentAmount?: number;

  publicLiveViewEnabled?: boolean;

  publicPlayerListEnabled?: boolean;

  publicPlayerListToken?: string;

  publicPlayerListSlug?: string;

  isActive?: boolean;

  createdAt?: string;

  updatedAt?: string;

  activeAuctionId?: string;

  createdBy?: string;

  createdByEmail?: string;

  playerFormFields?: PlayerFormFieldSettings;

}
