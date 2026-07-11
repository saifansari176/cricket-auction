export interface Player {

  id?: string;

  auctionId?: string;

  firstName: string;

  lastName: string;

  mobile: string;

  playerType: string;

  tshirtSize: string;

  trouserSize: string;

  photo: string;

  note: string;

  baseBid: number;

  status: string;

  teamId?: string;

  soldAmount?: number;

  soldToTeamId?: string;

  soldPrice?: number;

}
