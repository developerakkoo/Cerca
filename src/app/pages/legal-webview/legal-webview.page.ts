import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-legal-webview',
  templateUrl: './legal-webview.page.html',
  styleUrls: ['./legal-webview.page.scss'],
  standalone: false,
})
export class LegalWebviewPage implements OnInit {
  iframeSrc: SafeResourceUrl | null = null;
  titleKey = '';
  hasUrl = false;

  constructor(
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private location: Location
  ) {}

  ngOnInit(): void {
    const doc = (this.resolveDocParam() || '').toLowerCase();
    let raw = '';

    if (doc === 'terms') {
      raw = environment.legal.termsUrl?.trim() || '';
      this.titleKey = 'AUTH.mobileLogin.termsLink';
    } else if (doc === 'privacy') {
      raw = environment.legal.privacyUrl?.trim() || '';
      this.titleKey = 'AUTH.mobileLogin.privacyLink';
    }

    this.hasUrl =
      !!raw &&
      (raw.startsWith('https://') || raw.startsWith('http://'));

    if (this.hasUrl) {
      this.iframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(raw);
    }
  }

  goBack(): void {
    this.location.back();
  }

  /** `:doc` lives on the lazy parent segment, not on the empty child route. */
  private resolveDocParam(): string | null {
    let r: ActivatedRoute | null = this.route;
    for (let i = 0; i < 6 && r; i++) {
      const v = r.snapshot.paramMap.get('doc');
      if (v) {
        return v;
      }
      r = r.parent;
    }
    return null;
  }
}
