export interface Player {

  id?: string;

  auctionId?: string;

  firstName: string;

  lastName: string;

  mobile: string;

  jerseyNumber: string;

  playerType: string;

  currentTeam?: string;

  categoryId?: string;

  categoryName?: string;

  tshirtSize: string;

  trouserSize: string;

  photo: string;

  note: string;

  paymentRequired?: boolean;

  paymentOrderId?: string;

  paymentId?: string;

  /** Amount paid for this registration, retained for auction-wise reconciliation. */
  paymentAmount?: number;

  /** ISO timestamp recorded after the Razorpay signature has been verified. */
  paymentPaidAt?: string;

  paymentStatus?: 'Not required' | 'Verified';

  baseBid: number;

  bidIncreaseBy?: number;

  status: string;

  teamId?: string;

  soldAmount?: number;

  soldToTeamId?: string;

  soldPrice?: number;

}
