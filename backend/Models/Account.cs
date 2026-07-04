using System;

namespace SecureBank.Api.Models
{
    public class Account
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public string Iban { get; set; } = string.Empty;
        public string Bic { get; set; } = "SBKFFRPP";
        public string Type { get; set; } = "COURANT";
        public string Status { get; set; } = "ACTIVE";
        public decimal Balance { get; set; } = 0;
        public string Currency { get; set; } = "EUR";
        public string? Label { get; set; }
        public decimal DailyLimit { get; set; } = 10000;
        public decimal MonthlyLimit { get; set; } = 50000;
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? ClosedAt { get; set; }

        // Navigation Properties
        public User? User { get; set; }
    }
}
