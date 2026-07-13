export interface AuctionBid {

  id?: string;

  auctionId?: string;

  playerId: string;

  playerName: string;

  teamId: string;

  teamName: string;

  bidAmount: number;

  mobile: string;

  tshirtSize: string;

  sold: boolean;

  soldDate: string;

}
