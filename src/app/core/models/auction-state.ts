export interface AuctionState {

  id?: string;

  currentPlayerId: string | null;

  currentBid: number;

  highestTeamId: string | null;

  status: 'LIVE' | 'PAUSED' | 'COMPLETED';

  auctionStarted: boolean;

}