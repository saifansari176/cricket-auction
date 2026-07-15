import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import { ActivatedRoute, Router } from '@angular/router';

import { Team } from '../../../core/models/team';

import { TeamService } from '../../../core/services/team.service';
import { AuctionService } from '../../../core/services/auction.service';
import { StorageService } from '../../../core/services/storage.service';
import { AuctionSettings } from '../../../core/models/auction-settings';
import { MessageService } from '../../../core/services/message.service';

@Component({
  selector: 'app-team-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './team-form.component.html',
  styleUrl: './team-form.component.scss'
})
export class TeamFormComponent {

  fb = inject(FormBuilder);

  teamService = inject(TeamService);

  auctionService = inject(AuctionService);

  storageService = inject(StorageService);
  message = inject(MessageService);

  router = inject(Router);

  route = inject(ActivatedRoute);

  auction: AuctionSettings | null = null;

  isEdit = false;

  teamId = '';

  existingTeam: Team | null = null;

  uploading = false;

  form = this.fb.group({

    logo: [''],

    teamName: ['', Validators.required],

    ownerName: ['', Validators.required]

  });

  // ====================================

  async ngOnInit() {

    this.auction = await this.auctionService.get();

    this.teamId =
      this.route.snapshot.paramMap.get('id') || '';

    if (!this.teamId) {

      return;

    }

    this.isEdit = true;

    const team =
      await this.teamService.getTeamById(this.teamId);

    if (!team) {

      return;

    }

    this.existingTeam = team;

    this.form.patchValue({

      logo: team.logo,

      teamName: team.teamName,

      ownerName: team.ownerName

    });

  }

  // ====================================

  async onLogoChange(event: Event) {

    const input = event.target as HTMLInputElement;

    const file = input.files?.[0];

    if (!file) {

      return;

    }

    this.uploading = true;

    try {

      const imageUrl =
        await this.storageService.uploadTeamLogo(file);

      this.form.patchValue({

        logo: imageUrl

      });

    }
    catch (e) {

      this.message.error('Logo upload failed.');

    }

    this.uploading = false;

  }

  // ====================================

  async save() {

    if (this.form.invalid) {

      this.form.markAllAsTouched();

      return;

    }

    const settings = await this.auctionService.get();

if (!settings) {

  this.message.warning('Auction Settings not found');

  return;

}

    const team: Team = {

      id: this.isEdit
        ? this.teamId
        : undefined,

      logo: this.form.value.logo || '',

      teamName: this.form.value.teamName!,

      ownerName: this.form.value.ownerName!,

      auctionId: this.existingTeam?.auctionId || settings.activeAuctionId || '',

      totalPoints: Number(settings?.pointsPerTeam || 0),

      remainingPoints: this.isEdit
        ? Number(this.existingTeam?.remainingPoints ?? settings?.pointsPerTeam ?? 0)
        : Number(settings?.pointsPerTeam || 0),

      playerLimit: Number(settings?.playersPerTeam || 0),

      playersBought: this.isEdit
        ? Number(this.existingTeam?.playersBought || 0)
        : 0

    };

    if (this.isEdit) {

      const updated =
        await this.teamService.updateTeam(team);

      if (!updated) {

        this.message.warning('Team already exists.');

        return;

      }

      if (this.existingTeam?.teamName !== team.teamName) {
        await this.auctionService.syncTeamBidDetails(this.teamId, team.teamName);
      }

      this.message.success('Team updated successfully.');

    }
    else {

      const saved =
        await this.teamService.saveTeam(team);

      if (!saved) {

        this.message.warning('Team already exists.');

        return;

      }

      this.message.success('Team saved successfully.');

    }

    this.router.navigate(['/teams']);

  }

}
