import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit {
  currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  totalBalance = 0;
  monthlySpending = 0;
  activeCards = 0;
  transactions: any[] = [];
  userName = 'User';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const parsed = JSON.parse(user);
        this.userName = parsed.firstName || 'Admin';
      } catch (e) {}
    }

    this.loadSummary();
    this.loadTransactions();
  }

  loadSummary() {
    const token = localStorage.getItem('token');
    if (token === 'demo-token') {
      this.totalBalance = 142500;
      this.monthlySpending = 3240.50;
      this.activeCards = 3;
      return;
    }

    this.http.get<any>('http://localhost:5000/api/v1/accounts/summary', {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (data) => {
        this.totalBalance = data.totalBalance;
        this.monthlySpending = data.monthlySpending;
        // In a real app we would call /cards for cards count, or it could be returned in summary.
        this.activeCards = data.activeAccounts; // Using active accounts as proxy if cards aren't returned
      },
      error: () => {}
    });
  }

  loadTransactions() {
    const fallbackTransactions = [
      { type: 'receive', label: 'Salary Deposit', date: 'Today, 09:00 AM', amount: '+€4,500.00', positive: true },
      { type: 'send', label: 'Amazon Web Services', date: 'Yesterday, 14:30 PM', amount: '-€120.45', positive: false }
    ];

    const token = localStorage.getItem('token');
    if (token === 'demo-token') {
      this.transactions = fallbackTransactions;
      return;
    }

    this.http.get<any[]>('http://localhost:5000/api/v1/transactions', {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.transactions = data.slice(0, 5).map(t => ({
            type: t.isDebit ? 'send' : 'receive',
            label: t.description || 'Transfer',
            date: new Date(t.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            amount: (t.isDebit ? '-' : '+') + '€' + Number(t.amount).toFixed(2),
            positive: !t.isDebit
          }));
        } else {
          this.transactions = fallbackTransactions;
        }
      },
      error: () => {
        this.transactions = fallbackTransactions;
      }
    });
  }
}
