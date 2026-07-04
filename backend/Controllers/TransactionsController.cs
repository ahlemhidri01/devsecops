using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SecureBank.Api.Data;
using SecureBank.Api.Models;
using System.Security.Claims;

namespace SecureBank.Api.Controllers
{
    [ApiController]
    [Route("api/v1/[controller]")]
    [Authorize]
    public class TransactionsController : ControllerBase
    {
        private readonly AppDbContext _context;
        public TransactionsController(AppDbContext context) => _context = context;

        // GET /api/v1/transactions
        [HttpGet]
        public async Task<IActionResult> GetTransactions()
        {
            var userId = GetUserId();
            var accounts = await _context.Accounts
                .Where(a => a.UserId == userId)
                .Select(a => a.Id)
                .ToListAsync();

            var txs = await _context.Transactions
                .Where(t => accounts.Contains(t.SenderAccountId) ||
                            (t.ReceiverAccountId.HasValue && accounts.Contains(t.ReceiverAccountId.Value)))
                .Include(t => t.SenderAccount)
                .Include(t => t.ReceiverAccount)
                .OrderByDescending(t => t.CreatedAt)
                .Take(50)
                .ToListAsync();

            return Ok(txs.Select(t => new {
                t.Id, t.Type, t.Status, t.Amount, t.Currency,
                t.Description, t.ExternalIban, t.CreatedAt,
                senderIban = t.SenderAccount != null ? t.SenderAccount.Iban : null,
                receiverIban = t.ReceiverAccount != null ? t.ReceiverAccount.Iban : t.ExternalIban,
                isDebit = accounts.Contains(t.SenderAccountId)
            }));
        }

        // POST /api/v1/transactions/transfer
        public class TransferRequest
        {
            public string ExternalIban { get; set; } = string.Empty;
            public string? ReceiverName { get; set; }
            public decimal Amount { get; set; }
            public string Currency { get; set; } = "EUR";
            public string? Description { get; set; }
            public Guid? SenderAccountId { get; set; }
        }

        [HttpPost("transfer")]
        public async Task<IActionResult> Transfer([FromBody] TransferRequest req)
        {
            if (req.Amount <= 0)
                return BadRequest(new { message = "Amount must be positive." });

            var userId = GetUserId();

            // Resolve sender account
            Account? sender;
            if (req.SenderAccountId.HasValue)
            {
                sender = await _context.Accounts.FirstOrDefaultAsync(
                    a => a.Id == req.SenderAccountId && a.UserId == userId && a.Status == "ACTIVE");
            }
            else
            {
                sender = await _context.Accounts.FirstOrDefaultAsync(
                    a => a.UserId == userId && a.Status == "ACTIVE");
            }

            if (sender == null)
                return BadRequest(new { message = "No active account found." });

            if (sender.Balance < req.Amount)
                return BadRequest(new { message = "Insufficient funds." });

            // Debit sender
            sender.Balance -= req.Amount;
            sender.UpdatedAt = DateTime.UtcNow;

            // Check if receiver is internal
            var receiverAccount = await _context.Accounts
                .FirstOrDefaultAsync(a => a.Iban == req.ExternalIban && a.Status == "ACTIVE");

            if (receiverAccount != null)
            {
                receiverAccount.Balance += req.Amount;
                receiverAccount.UpdatedAt = DateTime.UtcNow;
            }

            var transaction = new Transaction
            {
                SenderAccountId = sender.Id,
                ReceiverAccountId = receiverAccount?.Id,
                ExternalIban = req.ExternalIban,
                Type = receiverAccount != null ? "INTERNAL" : "SEPA_TRANSFER",
                Status = "COMPLETED",
                Amount = req.Amount,
                Currency = req.Currency,
                Description = req.Description ?? $"Transfer to {req.ExternalIban}",
            };

            _context.Transactions.Add(transaction);
            await _context.SaveChangesAsync();

            return Ok(new {
                message = "Transfer completed successfully.",
                transactionId = transaction.Id,
                newBalance = sender.Balance
            });
        }

        private Guid GetUserId()
        {
            var sub = User.FindFirstValue(ClaimTypes.NameIdentifier)
                       ?? User.FindFirstValue("sub")
                       ?? throw new UnauthorizedAccessException();
            return Guid.Parse(sub);
        }
    }
}
