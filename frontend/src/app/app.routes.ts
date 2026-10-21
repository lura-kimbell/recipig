import { Routes } from '@angular/router';
import { AuthPage } from './auth-page';
import { authGuard, guestGuard } from './auth.guard';
import { RecipeDetail } from './recipe-detail';
import { RecipeEdit } from './recipe-edit';
import { RecipeList } from './recipe-list';

export const routes: Routes = [
  { path: 'login', component: AuthPage, canActivate: [guestGuard], data: { mode: 'login' } },
  { path: 'register', component: AuthPage, canActivate: [guestGuard], data: { mode: 'register' } },
  { path: '', component: RecipeList, canActivate: [authGuard] },
  // Before recipes/:id so "new" isn't read as an id. The edit form doubles as the blank-recipe form.
  { path: 'recipes/new', component: RecipeEdit, canActivate: [authGuard], data: { mode: 'create' } },
  { path: 'recipes/:id', component: RecipeDetail, canActivate: [authGuard] },
  { path: 'recipes/:id/edit', component: RecipeEdit, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
