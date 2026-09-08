import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

interface PageSeo {
  title: string;
  description: string;
  indexable: boolean;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly siteUrl = 'https://www.cricbids.com';

  private readonly pages: Record<string, PageSeo> = {
    '/': {
      title: 'Cricbids | Cricket Auction Software',
      description: 'Run professional cricket, football, and tennis auctions online. Register players, manage teams, and conduct live auctions with Cricbids.',
      indexable: true
    },
    '/how-it-works': {
      title: 'How Cricbids Works | Run a Cricket Auction Online',
      description: 'Learn how to set up teams, register players, and run a smooth live cricket auction with Cricbids.',
      indexable: true
    },
    '/past-auctions': {
      title: 'Past Cricket Auctions | Cricbids',
      description: 'Browse completed cricket auctions hosted with Cricbids.',
      indexable: true
    },
    '/player-registration': {
      title: 'Cricket Player Registration | Cricbids',
      description: 'Register as a player for a cricket auction hosted on Cricbids.',
      indexable: true
    },
    '/watch': {
      title: 'Watch Live Cricket Auctions | Cricbids',
      description: 'Watch live cricket auctions, follow player bids, view teams, and see results on Cricbids.',
      indexable: true
    }
  };

  constructor(
    private title: Title,
    private meta: Meta,
    @Inject(DOCUMENT) private document: Document
  ) {}

  updateForUrl(url: string): void {
    const path = this.normalisePath(url);
    const canonicalUrl = this.canonicalUrl(url, path);
    const page = this.pages[path] ?? this.publicAuctionPage(path);
    const seo = page ?? {
      title: 'Cricbids | Cricket Auction Software',
      description: 'Run professional sports auctions online with Cricbids.',
      indexable: false
    };

    this.title.setTitle(seo.title);
    this.meta.updateTag({ name: 'description', content: seo.description });
    this.meta.updateTag({ name: 'robots', content: seo.indexable ? 'index, follow' : 'noindex, nofollow' });
    this.meta.updateTag({ property: 'og:title', content: seo.title });
    this.meta.updateTag({ property: 'og:description', content: seo.description });
    this.meta.updateTag({ property: 'og:url', content: canonicalUrl });

    let canonical = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.rel = 'canonical';
      this.document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
  }

  private normalisePath(url: string): string {
    const path = url.split(/[?#]/, 1)[0] || '/';
    return path.length > 1 ? path.replace(/\/$/, '') : path;
  }

  private canonicalUrl(url: string, path: string): string {
    // A registration form is tied to one tournament. Keep its public auction
    // id in the canonical URL so it can be discovered as its own form page.
    if (path === '/player-registration') {
      const auctionId = new URL(url, this.siteUrl).searchParams.get('auctionId');
      if (auctionId) {
        return `${this.siteUrl}${path}?auctionId=${encodeURIComponent(auctionId)}`;
      }
    }

    return `${this.siteUrl}${path}`;
  }

  private publicAuctionPage(path: string): PageSeo | undefined {
    if (path.startsWith('/watch/')) {
      return {
        title: 'Watch Live Cricket Auction | Cricbids',
        description: 'Watch live cricket auction bids, teams, players, and results on Cricbids.',
        indexable: true
      };
    }

    if (path.startsWith('/live-screen/')) {
      return {
        title: 'Live Cricket Auction Screen | Cricbids',
        description: 'Follow the live player, current bid, teams, and auction activity on Cricbids.',
        indexable: true
      };
    }

    return undefined;
  }
}
