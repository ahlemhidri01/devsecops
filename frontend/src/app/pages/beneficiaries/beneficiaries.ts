import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-beneficiaries',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './beneficiaries.html',
  styleUrls: ['./beneficiaries.css']
})
export class BeneficiariesComponent implements OnInit {
  currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  beneficiaries: any[] = [];
  
  // Modal State
  showModal = false;
  selectedBeneficiary: any = null;
  transferAmount: number | null = null;
  transferDescription = '';
  isTransferring = false;
  errorMessage = '';
  successMessage = '';

  constructor(private router: Router, private http: HttpClient) {}

  ngOnInit() {
    this.loadBeneficiaries();
  }

  loadBeneficiaries() {
    // In demo mode or if API fails, fallback to these
    const fallbackBeneficiaries = [
      { id: '1', name: 'Alice Martin', bank: 'BNP Paribas', iban: 'FR76300010079412345678901', avatar: 'AM' },
      { id: '2', name: 'Bob Dupont', bank: 'Société Générale', iban: 'FR7630003001940000001234', avatar: 'BD' },
      { id: '3', name: 'Claire Moreau', bank: 'Crédit Agricole', iban: 'FR7618206004700001203456', avatar: 'CM' },
    ];

    const token = localStorage.getItem('token');
    if (token === 'demo-token') {
      this.beneficiaries = fallbackBeneficiaries;
      return;
    }

    this.http.get<any[]>('http://localhost:5000/api/v1/beneficiaries', {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.beneficiaries = data.map(b => ({ ...b, avatar: b.name.substring(0,2).toUpperCase() }));
        } else {
          this.beneficiaries = fallbackBeneficiaries;
        }
      },
      error: () => {
        this.beneficiaries = fallbackBeneficiaries;
      }
    });
  }

  openSendMoneyModal(beneficiary: any) {
    this.selectedBeneficiary = beneficiary;
    this.transferAmount = null;
    this.transferDescription = '';
    this.errorMessage = '';
    this.successMessage = '';
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.selectedBeneficiary = null;
  }

  sendMoney() {
    if (!this.transferAmount || this.transferAmount <= 0) return;
    
    this.isTransferring = true;
    this.errorMessage = '';
    this.successMessage = '';

    const token = localStorage.getItem('token');
    
    if (token === 'demo-token') {
      // Simulate API call
      setTimeout(() => {
        this.successMessage = 'Transfer completed successfully! (Demo)';
        this.isTransferring = false;
        setTimeout(() => this.closeModal(), 1500);
      }, 1000);
      return;
    }

    this.http.post('http://localhost:5000/api/v1/transactions/transfer', {
      externalIban: this.selectedBeneficiary.iban,
      receiverName: this.selectedBeneficiary.name,
      amount: this.transferAmount,
      currency: 'EUR',
      description: this.transferDescription
    }, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (res: any) => {
        this.successMessage = 'Transfer completed successfully!';
        this.isTransferring = false;
        setTimeout(() => this.closeModal(), 1500);
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Transfer failed. Please try again.';
        this.isTransferring = false;
      }
    });
  }
}
