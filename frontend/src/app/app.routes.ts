import { Routes } from '@angular/router';
import { RecipeDetail } from './recipe-detail';
import { RecipeEdit } from './recipe-edit';
import { RecipeImport } from './recipe-import';
import { RecipeList } from './recipe-list';

export const routes: Routes = [
  { path: '', component: RecipeList },
  { path: 'import', component: RecipeImport },
  // Before recipes/:id so "new" isn't read as an id. The edit form doubles as the blank-recipe form.
  { path: 'recipes/new', component: RecipeEdit, data: { mode: 'create' } },
  { path: 'recipes/:id', component: RecipeDetail },
  { path: 'recipes/:id/edit', component: RecipeEdit },
  { path: '**', redirectTo: '' },
];
