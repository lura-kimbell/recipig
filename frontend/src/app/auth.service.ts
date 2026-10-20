import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface User {
  id: string;
  username: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  /** The logged-in person, or null. */
  readonly user = signal<User | null>(null);

  /** Asks the server who we are (the browser sends the login cookie by itself). */
  async load(): Promise<void> {
    try {
      this.user.set(await firstValueFrom(this.http.get<User>('/api/auth/me')));
    } catch {
      this.user.set(null);
    }
  }

  async login(username: string, password: string): Promise<void> {
    this.user.set(await firstValueFrom(this.http.post<User>('/api/auth/login', { username, password })));
  }

  async register(username: string, password: string): Promise<void> {
    this.user.set(await firstValueFrom(this.http.post<User>('/api/auth/register', { username, password })));
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>('/api/auth/logout', {}));
    } finally {
      this.user.set(null);
    }
  }
}
