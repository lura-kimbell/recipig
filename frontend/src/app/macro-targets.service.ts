import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService, User } from './auth.service';
import { MacroTarget } from './macros';

/** The logged-in person's daily macro targets, kept on their account. */
@Injectable({ providedIn: 'root' })
export class MacroTargetsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly targets = computed<MacroTarget[]>(() => this.auth.user()?.macroTargets ?? []);

  /** Replaces all the targets (an empty list clears them). */
  async save(targets: MacroTarget[]): Promise<void> {
    const user = await firstValueFrom(this.http.put<User>('/api/auth/macro-targets', { targets }));
    this.auth.user.update((u) => (u ? { ...u, macroTargets: user.macroTargets ?? [] } : u));
  }
}
