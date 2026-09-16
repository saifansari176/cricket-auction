import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicHeaderComponent } from '../../../shared/public-header/public-header.component';

interface GuideStep {
  id: string;
  title: string;
  description: string;
  details: string;
  videoUrl: string;
}

@Component({
  selector: 'app-how-it-works',
  standalone: true,
  imports: [PublicHeaderComponent, RouterLink],
  templateUrl: './how-it-works.component.html',
  styleUrl: './how-it-works.component.scss'
})
export class HowItWorksComponent {
  readonly steps: GuideStep[] = [
    {
      id: 'create-auction',
      title: 'Create your auction',
      description: 'Start in Auction Management. Add your tournament name, date and logo, then set the team and player limits.',
      details: 'Choose the starting bid and bid increment, and review your auction settings before adding participants.',
      videoUrl: 'https://youtu.be/vFd7Pv1hZ6I'
    },
    {
      id: 'teams-and-players',
      title: 'Add teams and players',
      description: 'Use Teams → Add Team to register each team with its name, logo and owner details. Then use Players → Add Player to build your player list.',
      details: 'You can also share the player registration form or bulk upload players from Player List. Check the entries before bidding begins.',
      videoUrl: 'https://youtu.be/crACi71mohs'
    },
    {
      id: 'player-categories',
      title: 'Organise player categories',
      description: 'Open Player Categories to create player groups and set a separate base price for each category.',
      details: 'Assign players to the appropriate categories so your auction uses the right starting prices.',
      videoUrl: 'https://youtu.be/aa-EtpD2G-0'
    },
    {
      id: 'live-auction',
      title: 'Run the live auction and share links',
      description: 'Open Live Auction to bring players up for bidding, record bids and complete each sale. Follow team balances as your squads take shape.',
      details: 'Use Share Links in Auction Management to copy the registration form, public live view or display-only live screen link.',
      videoUrl: 'https://youtu.be/gPMTw1dE_iA'
    },
    {
      id: 'dashboard-and-reports',
      title: 'Review your dashboard and reports',
      description: 'Track auction progress on the dashboard and open Reports to review player purchases, team squads and spending.',
      details: 'Share the public live view so team owners and viewers can follow the auction and its reports.',
      videoUrl: 'https://youtu.be/oqWtLbfttrI'
    }
  ];
}
