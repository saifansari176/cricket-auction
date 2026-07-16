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

  isActive?: boolean;

  createdAt?: string;

  updatedAt?: string;

  activeAuctionId?: string;

  createdBy?: string;

  createdByEmail?: string;

}
