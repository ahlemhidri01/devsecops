namespace SecureBank.Api.Models
{
    public class Transaction
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid SenderAccountId { get; set; }
        public Guid? ReceiverAccountId { get; set; }
        public string? ExternalIban { get; set; }
        public string Type { get; set; } = "SEPA_TRANSFER"; // SEPA_TRANSFER | INTERNAL | SWIFT_TRANSFER
        public string Status { get; set; } = "COMPLETED";   // PENDING | COMPLETED | FAILED | BLOCKED_FRAUD
        public decimal Amount { get; set; }
        public string Currency { get; set; } = "EUR";
        public string? Description { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation
        public Account? SenderAccount { get; set; }
        public Account? ReceiverAccount { get; set; }
    }
}
