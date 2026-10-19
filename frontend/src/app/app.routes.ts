import { Routes } from '@angular/router';
import { RecipeDetail } from './recipe-detail';
import { RecipeEdit } from './recipe-edit';
import { RecipeList } from './recipe-list';

export const routes: Routes = [
  { path: '', component: RecipeList },
  { path: 'recipes/:id', component: RecipeDetail },
  { path: 'recipes/:id/edit', component: RecipeEdit },
  { path: '**', redirectTo: '' },
];
