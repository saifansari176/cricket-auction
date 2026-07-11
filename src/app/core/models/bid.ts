export interface AuctionBid {

  id?: string;

  auctionId?: string;

  playerId: string;

  playerName: string;

  teamId: string;

  teamName: string;

  bidAmount: number;

  sold: boolean;

  soldDate: string;

}
