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
    public class CardsController : ControllerBase
    {
        private readonly AppDbContext _context;
        public CardsController(AppDbContext context) => _context = context;

        // GET /api/v1/cards
        [HttpGet]
        public async Task<IActionResult> GetCards()
        {
            var userId = GetUserId();
            var accountIds = await _context.Accounts
                .Where(a => a.UserId == userId)
                .Select(a => a.Id)
                .ToListAsync();

            var cards = await _context.Cards
                .Include(c => c.Account)
                .Where(c => accountIds.Contains(c.AccountId))
                .ToListAsync();

            return Ok(cards.Select(c => new {
                c.Id, c.MaskedNumber, c.CardholderName, c.Type, c.Status,
                expiry = c.ExpiryDate.ToString("MM/yy"),
                c.CreditLimit,
                accountBalance = c.Account != null ? c.Account.Balance : 0,
                accountIban = c.Account != null ? c.Account.Iban : null
            }));
        }

        // PATCH /api/v1/cards/{id}/block
        [HttpPatch("{id}/block")]
        public async Task<IActionResult> BlockCard(Guid id)
        {
            var userId = GetUserId();
            var accountIds = await _context.Accounts
                .Where(a => a.UserId == userId).Select(a => a.Id).ToListAsync();

            var card = await _context.Cards
                .FirstOrDefaultAsync(c => c.Id == id && accountIds.Contains(c.AccountId));

            if (card == null) return NotFound();

            card.Status = card.Status == "ACTIVE" ? "BLOCKED" : "ACTIVE";
            await _context.SaveChangesAsync();
            return Ok(new { message = $"Card is now {card.Status}", status = card.Status });
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
