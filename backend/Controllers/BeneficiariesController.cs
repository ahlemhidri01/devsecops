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
    public class BeneficiariesController : ControllerBase
    {
        private readonly AppDbContext _context;
        public BeneficiariesController(AppDbContext context) => _context = context;

        // GET /api/v1/beneficiaries
        [HttpGet]
        public async Task<IActionResult> GetBeneficiaries()
        {
            var userId = GetUserId();
            var list = await _context.Beneficiaries
                .Where(b => b.UserId == userId && b.IsActive)
                .OrderBy(b => b.Name)
                .ToListAsync();
            return Ok(list);
        }

        // POST /api/v1/beneficiaries
        public class CreateBeneficiaryRequest
        {
            public string Name { get; set; } = string.Empty;
            public string Iban { get; set; } = string.Empty;
            public string Bic { get; set; } = string.Empty;
            public string? BankName { get; set; }
            public string? Nickname { get; set; }
        }

        [HttpPost]
        public async Task<IActionResult> CreateBeneficiary([FromBody] CreateBeneficiaryRequest req)
        {
            var userId = GetUserId();

            // Prevent duplicates
            var exists = await _context.Beneficiaries
                .AnyAsync(b => b.UserId == userId && b.Iban == req.Iban && b.IsActive);
            if (exists)
                return Conflict(new { message = "Beneficiary with this IBAN already exists." });

            var bene = new Beneficiary
            {
                UserId = userId,
                Name = req.Name,
                Iban = req.Iban.Replace(" ", "").ToUpper(),
                Bic = req.Bic.ToUpper(),
                BankName = req.BankName,
                Nickname = req.Nickname
            };

            _context.Beneficiaries.Add(bene);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetBeneficiaries), new { id = bene.Id }, bene);
        }

        // DELETE /api/v1/beneficiaries/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteBeneficiary(Guid id)
        {
            var userId = GetUserId();
            var bene = await _context.Beneficiaries
                .FirstOrDefaultAsync(b => b.Id == id && b.UserId == userId);

            if (bene == null) return NotFound();

            bene.IsActive = false;
            await _context.SaveChangesAsync();
            return NoContent();
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
