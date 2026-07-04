namespace SecureBank.Api.Models
{
    public class Card
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid AccountId { get; set; }
        public string MaskedNumber { get; set; } = string.Empty; // e.g. "**** **** **** 4521"
        public string CardholderName { get; set; } = string.Empty;
        public string Type { get; set; } = "VISA";              // VISA | MASTERCARD | VIRTUAL
        public string Status { get; set; } = "ACTIVE";          // ACTIVE | BLOCKED | EXPIRED
        public DateTime ExpiryDate { get; set; }
        public decimal CreditLimit { get; set; } = 10000;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation
        public Account? Account { get; set; }
    }
}
