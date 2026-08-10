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

  baseBid: number;

  bidIncreaseBy?: number;

  status: string;

  teamId?: string;

  soldAmount?: number;

  soldToTeamId?: string;

  soldPrice?: number;

}
