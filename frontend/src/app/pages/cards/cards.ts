import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cards',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cards.html',
  styleUrls: ['./cards.css']
})
export class CardsComponent {
  currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  cards = [
    { name: 'Visa Platinum', number: '**** **** **** 4521', expiry: '09/27', limit: '€10,000', used: '€3,240', color: 'linear-gradient(135deg, #1a1a2e, #16213e)' },
    { name: 'Mastercard Gold', number: '**** **** **** 8834', expiry: '12/26', limit: '€5,000', used: '€870', color: 'linear-gradient(135deg, #2d3561, #c05c7e)' },
    { name: 'Virtual Card', number: '**** **** **** 2201', expiry: '06/25', limit: '€2,000', used: '€0', color: 'linear-gradient(135deg, #0f3460, #533483)' },
  ];

}
