import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './transactions.html',
  styleUrls: ['./transactions.css']
})
export class TransactionsComponent implements OnInit {
  currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  transactions: any[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadTransactions();
  }

  loadTransactions() {
    const fallbackTransactions = [
      { type: 'receive', label: 'Salary Deposit', date: 'Today, 09:00 AM', amount: '+€4,500.00', positive: true },
      { type: 'send', label: 'Amazon Web Services', date: 'Yesterday, 14:30 PM', amount: '-€120.45', positive: false },
      { type: 'send', label: 'Netflix Subscription', date: '02 Jul, 10:00 AM', amount: '-€15.99', positive: false },
      { type: 'receive', label: 'Freelance Payment', date: '01 Jul, 16:00 PM', amount: '+€850.00', positive: true },
      { type: 'send', label: 'Electricity Bill', date: '30 Jun, 08:00 AM', amount: '-€98.00', positive: false },
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
          this.transactions = data.map(t => ({
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
