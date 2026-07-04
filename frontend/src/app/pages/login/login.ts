import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

// Demo credentials for frontend-only mode (no backend required)
const DEMO_EMAIL = 'admin@securebank.com';
const DEMO_PASSWORD = 'demo123';
// Backend API URL (.NET API on port 5000)
const API_URL = 'http://localhost:5000/api/v1/auth/login';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {
  email = '';
  password = '';
  isLoading = false;
  errorMessage = '';
  demoHint = `Demo: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`;

  constructor(private http: HttpClient, private router: Router) {}

  onSubmit() {
    this.isLoading = true;
    this.errorMessage = '';

    this.http.post<any>(API_URL, {
      email: this.email,
      password: this.password
    }).subscribe({
      next: (res) => {
        // Real API success
        const token = res.token;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify({ 
          email: this.email, 
          role: res.role || 'CLIENT', 
          firstName: res.firstName || 'User' 
        }));
        this.isLoading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Identifiants incorrects ou serveur injoignable.';
      }
    });
  }
}
