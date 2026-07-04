import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login';
import { LayoutComponent } from './shared/layout/layout';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { TransactionsComponent } from './pages/transactions/transactions';
import { CardsComponent } from './pages/cards/cards';
import { BeneficiariesComponent } from './pages/beneficiaries/beneficiaries';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'transactions', component: TransactionsComponent },
      { path: 'cards', component: CardsComponent },
      { path: 'beneficiaries', component: BeneficiariesComponent },
    ]
  },
  { path: '**', redirectTo: 'login' }
];
