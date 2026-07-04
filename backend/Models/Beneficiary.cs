namespace SecureBank.Api.Models
{
    public class Beneficiary
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Iban { get; set; } = string.Empty;
        public string Bic { get; set; } = string.Empty;
        public string? BankName { get; set; }
        public string? Nickname { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation
        public User? User { get; set; }
    }
}
