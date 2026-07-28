export interface PlayerCategory {
  id?: string;
  auctionId: string;
  name: string;
  basePrice: number;
  bidIncreaseBy?: number;
}
