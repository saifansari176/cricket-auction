import { Injectable, inject } from '@angular/core';
import { Team } from '../models/team';
import { AuctionService } from './auction.service';
import { FirebaseService } from './firestore.service';

@Injectable({
  providedIn: 'root'
})
export class TeamService {

  firebase = inject(FirebaseService);

  auctionService = inject(AuctionService);

  private collection = 'teams';

  async getTeams(): Promise<Team[]> {

  const activeAuctionId = await this.auctionService.getActiveAuctionId();

  return activeAuctionId
    ? this.firebase.getAll<Team>(this.auctionCollection(activeAuctionId))
    : [];

  }


  async saveTeam(team: Team): Promise<boolean> {

    team.auctionId = team.auctionId || await this.auctionService.getActiveAuctionId();

    if (!team.auctionId) return false;

    const teams = await this.firebase.getAll<Team>(this.auctionCollection(team.auctionId));

    const exists = teams.some(

      x =>
        this.normaliseTeamName(x.teamName) ===
        this.normaliseTeamName(team.teamName)

    );

    if (exists) {

      return false;

    }

    if (!await this.canAddTeam()) return false;

await this.firebase.add(
  this.auctionCollection(team.auctionId),
  team
);

    return true;

  }

  async canAddTeam(): Promise<boolean> {
    const user = await this.auctionService.authService.waitForUser();
    if (this.auctionService.authService.isAdmin(user)) return true;

    const selectedAuction = await this.auctionService.get();
    const auction = selectedAuction?.activeAuctionId || selectedAuction?.id
      ? await this.auctionService.getAuctionById(selectedAuction.activeAuctionId || selectedAuction.id!)
      : selectedAuction;
    const teamLimit = Number(auction?.teamLimit ?? 8);
    return (await this.getTeams()).length < teamLimit;
  }

  // ===============================
  // Get Team By Id
  // ===============================

  async getTeamById(id: string): Promise<Team | undefined> {

    const teams = await this.getTeams();

    return teams.find(

      x => x.id === id

    );

  }

  async updateTeam(team: Team): Promise<boolean> {

    team.auctionId = team.auctionId || await this.auctionService.getActiveAuctionId();

    if (!team.auctionId) return false;

    const teams = await this.firebase.getAll<Team>(this.auctionCollection(team.auctionId));

    const duplicate = teams.find(

      x =>

        this.normaliseTeamName(x.teamName) ===

          this.normaliseTeamName(team.teamName)

        &&

        x.id !== team.id

    );

    if (duplicate) {

      return false;

    }

    await this.firebase.update(
  this.auctionCollection(team.auctionId),
  team.id!,
  team
);

    return true;

  }

  async deleteTeam(id: string) {

    const auctionId = await this.auctionService.getActiveAuctionId();
    if (!auctionId) return;

    const playerCollection = this.auctionService.auctionCollection(auctionId, 'players');
    const players = await this.firebase.getAll<{ id?: string; soldToTeamId?: string; status?: string; soldPrice?: number }>(playerCollection);

    await Promise.all(
      players
        .filter((player) => player.id && player.soldToTeamId === id)
        .map((player) => this.firebase.update(playerCollection, player.id!, {
          ...player,
          status: 'Available',
          soldToTeamId: '',
          soldPrice: 0
        }))
    );

    await this.auctionService.deleteTeamBids(id);
    await this.firebase.delete(this.auctionCollection(auctionId), id);

  }

  async updateTeamPoints(

    teamId: string,

    bid: number

  ) {

    const team = await this.getTeamById(

      teamId

    );

    if (!team) {

      return;

    }

    team.remainingPoints -= bid;

    team.playersBought =
      (team.playersBought || 0) + 1;

    await this.updateTeam(team);

  }

  async reconcileTeams(pointsPerTeam: number, playersPerTeam: number): Promise<void> {
    const [teams, bids] = await Promise.all([
      this.getTeams(),
      this.auctionService.getBids()
    ]);

    const soldBids = bids.filter((bid) => bid.sold);

    await Promise.all(teams.map((team) => {
      const teamBids = soldBids.filter((bid) => bid.teamId === team.id);
      const spentPoints = teamBids.reduce((total, bid) => total + Number(bid.bidAmount || 0), 0);

      return this.updateTeam({
        ...team,
        totalPoints: Number(pointsPerTeam),
        remainingPoints: Number(pointsPerTeam) - spentPoints,
        playerLimit: Number(playersPerTeam),
        playersBought: teamBids.length
      });
    }));
  }

  private normaliseTeamName(teamName: string): string {
    return String(teamName || '').trim().toLocaleLowerCase();
  }

  private auctionCollection(auctionId: string): string {
    return this.auctionService.auctionCollection(auctionId, this.collection);
  }

}
