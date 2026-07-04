using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SecureBank.Api.Data;
using System.Security.Claims;

namespace SecureBank.Api.Controllers
{
    [ApiController]
    [Route("api/v1/[controller]")]
    [Authorize]
    public class AccountsController : ControllerBase
    {
        private readonly AppDbContext _context;
        public AccountsController(AppDbContext context) => _context = context;

        // GET /api/v1/accounts
        [HttpGet]
        public async Task<IActionResult> GetAccounts()
        {
            var userId = GetUserId();
            var accounts = await _context.Accounts
                .Where(a => a.UserId == userId && a.Status == "ACTIVE")
                .ToListAsync();
            return Ok(accounts);
        }

        // GET /api/v1/accounts/summary
        [HttpGet("summary")]
        public async Task<IActionResult> GetSummary()
        {
            var userId = GetUserId();
            var accounts = await _context.Accounts
                .Where(a => a.UserId == userId && a.Status == "ACTIVE")
                .ToListAsync();

            var accountIds = accounts.Select(a => a.Id).ToList();

            // Monthly spending (current month debits)
            var monthStart = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);
            var monthlySpending = await _context.Transactions
                .Where(t => accountIds.Contains(t.SenderAccountId) && t.CreatedAt >= monthStart && t.Status == "COMPLETED")
                .SumAsync(t => (decimal?)t.Amount) ?? 0;

            return Ok(new {
                totalBalance = accounts.Sum(a => a.Balance),
                monthlySpending,
                activeAccounts = accounts.Count,
                accounts = accounts.Select(a => new { a.Id, a.Iban, a.Balance, a.Currency, a.Type, a.Label })
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
