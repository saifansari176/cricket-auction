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

  // ===============================
  // Get All Teams
  // ===============================

  async getTeams(): Promise<Team[]> {

  const activeAuctionId = await this.auctionService.getActiveAuctionId();

  const teams = await this.firebase.getAll<Team>(this.collection);

  return activeAuctionId
    ? teams.filter((team) => team.auctionId === activeAuctionId)
    : teams;

  }

  // ===============================
  // Save Team
  // ===============================

  async saveTeam(team: Team): Promise<boolean> {

    team.auctionId = team.auctionId || await this.auctionService.getActiveAuctionId();

    const teams = await this.getTeams();

    const exists = teams.some(

      x =>
        x.teamName.toLowerCase() ===
        team.teamName.toLowerCase()

    );

    if (exists) {

      return false;

    }

await this.firebase.add(
  this.collection,
  team
);

    return true;

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

  // ===============================
  // Update Team
  // ===============================

  async updateTeam(team: Team): Promise<boolean> {

    team.auctionId = team.auctionId || await this.auctionService.getActiveAuctionId();

    const teams = await this.getTeams();

    const duplicate = teams.find(

      x =>

        x.teamName.toLowerCase() ===

          team.teamName.toLowerCase()

        &&

        x.id !== team.id

    );

    if (duplicate) {

      return false;

    }

    await this.firebase.update(
  this.collection,
  team.id!,
  team
);

    return true;

  }

  // ===============================
  // Delete Team
  // ===============================

  async deleteTeam(id: string) {

await this.firebase.delete(
  this.collection,
  id
);

  }

  // ===============================
  // Update Team Points
  // ===============================

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

}
