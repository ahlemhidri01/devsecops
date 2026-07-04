using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using SecureBank.Api.Data;
using SecureBank.Api.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace SecureBank.Api.Controllers
{
    [ApiController]
    [Route("api/v1/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;

        public AuthController(AppDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        public class LoginRequest
        {
            public string Email { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
        }

        public class RegisterRequest
        {
            public string Email { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
            public string FirstName { get; set; } = string.Empty;
            public string LastName { get; set; } = string.Empty;
            public string? Phone { get; set; }
        }

        // POST /api/v1/auth/register
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest req)
        {
            if (await _context.Users.AnyAsync(u => u.Email == req.Email))
                return Conflict(new { message = "Email already registered." });

            var user = new User
            {
                Email = req.Email,
                PasswordHash = req.Password, // In production: BCrypt
                FirstName = req.FirstName,
                LastName = req.LastName,
                Phone = req.Phone,
                Role = "CLIENT",
                Status = "ACTIVE"
            };
            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            // Auto-create a checking account
            var account = new Account
            {
                UserId = user.Id,
                Iban = GenerateIban(),
                Type = "COURANT",
                Status = "ACTIVE",
                Balance = 1000m, // Welcome bonus for demo
                Currency = "EUR",
                Label = "Compte Courant"
            };
            _context.Accounts.Add(account);
            await _context.SaveChangesAsync();

            var token = GenerateJwtToken(user.Id.ToString(), user.Role);
            return Ok(new { token, userId = user.Id, email = user.Email, role = user.Role });
        }

        // POST /api/v1/auth/login
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == request.Email);

            if (user == null || user.PasswordHash != request.Password)
            {
                // Seed demo admin if DB is fresh
                if (request.Email == "admin@securebank.com" && request.Password == "demo123")
                {
                    user = await SeedDemoAdmin();
                }
                else
                {
                    return Unauthorized(new { message = "Invalid email or password." });
                }
            }

            // Update last login
            user.LastLoginAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var token = GenerateJwtToken(user.Id.ToString(), user.Role);
            return Ok(new {
                token,
                userId = user.Id,
                email = user.Email,
                role = user.Role,
                firstName = user.FirstName
            });
        }

        // ────────────────────────────────────────────────────────
        // HELPERS
        // ────────────────────────────────────────────────────────

        private async Task<User> SeedDemoAdmin()
        {
            // Check again in case of race condition
            var existing = await _context.Users.FirstOrDefaultAsync(u => u.Email == "admin@securebank.com");
            if (existing != null) return existing;

            var admin = new User
            {
                Email = "admin@securebank.com",
                PasswordHash = "demo123",
                FirstName = "Admin",
                LastName = "SecureBank",
                Role = "ADMIN",
                Status = "ACTIVE"
            };
            _context.Users.Add(admin);
            await _context.SaveChangesAsync();

            // Create 2 accounts
            var courant = new Account
            {
                UserId = admin.Id, Iban = "FR76 3000 1007 9412 3456 7890 185",
                Type = "COURANT", Status = "ACTIVE", Balance = 142500.00m,
                Currency = "EUR", Label = "Compte Courant Principal"
            };
            var epargne = new Account
            {
                UserId = admin.Id, Iban = "FR76 3000 1007 9412 3456 7890 186",
                Type = "EPARGNE", Status = "ACTIVE", Balance = 25000.00m,
                Currency = "EUR", Label = "Livret A"
            };
            _context.Accounts.AddRange(courant, epargne);
            await _context.SaveChangesAsync();

            // Create 2 cards
            _context.Cards.AddRange(
                new Card { AccountId = courant.Id, MaskedNumber = "**** **** **** 4521", CardholderName = "Admin SecureBank", Type = "VISA", Status = "ACTIVE", ExpiryDate = new DateTime(2027, 9, 30), CreditLimit = 10000 },
                new Card { AccountId = epargne.Id, MaskedNumber = "**** **** **** 8834", CardholderName = "Admin SecureBank", Type = "MASTERCARD", Status = "ACTIVE", ExpiryDate = new DateTime(2026, 12, 31), CreditLimit = 5000 }
            );

            // Create 3 beneficiaries
            _context.Beneficiaries.AddRange(
                new Beneficiary { UserId = admin.Id, Name = "Alice Martin", Iban = "FR76300010079412345678901", Bic = "BNPAFRPP", BankName = "BNP Paribas" },
                new Beneficiary { UserId = admin.Id, Name = "Bob Dupont", Iban = "FR7630003001940000001234", Bic = "SOGEFRPP", BankName = "Société Générale" },
                new Beneficiary { UserId = admin.Id, Name = "Claire Moreau", Iban = "FR7618206004700001203456", Bic = "AGRIFRPP", BankName = "Crédit Agricole" }
            );

            // Seed recent transactions
            _context.Transactions.AddRange(
                new Transaction { SenderAccountId = courant.Id, Amount = 4500m, Currency = "EUR", Description = "Salary Deposit", Type = "INTERNAL", Status = "COMPLETED", CreatedAt = DateTime.UtcNow.AddHours(-2) },
                new Transaction { SenderAccountId = courant.Id, ExternalIban = "DE89370400440532013000", Amount = 120.45m, Currency = "EUR", Description = "Amazon Web Services", Type = "SEPA_TRANSFER", Status = "COMPLETED", CreatedAt = DateTime.UtcNow.AddDays(-1) },
                new Transaction { SenderAccountId = courant.Id, ExternalIban = "GB29NWBK60161331926819", Amount = 15.99m, Currency = "EUR", Description = "Netflix Subscription", Type = "SEPA_TRANSFER", Status = "COMPLETED", CreatedAt = DateTime.UtcNow.AddDays(-2) }
            );

            await _context.SaveChangesAsync();
            return admin;
        }

        private static string GenerateIban()
        {
            var rand = new Random();
            var nums = string.Concat(Enumerable.Range(0, 20).Select(_ => rand.Next(0, 10).ToString()));
            return $"FR76 {nums[..4]} {nums[4..8]} {nums[8..12]} {nums[12..16]} {nums[16..20]}";
        }

        private string GenerateJwtToken(string userId, string role)
        {
            var key = _configuration["Jwt:Key"] ?? "SecureBank_Dev_SecretKey_1234567890ABC";
            var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
            var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, userId),
                new Claim(ClaimTypes.NameIdentifier, userId),
                new Claim(ClaimTypes.Role, role),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            var token = new JwtSecurityToken(
                issuer: "SecureBankPlatform",
                audience: "SecureBankClients",
                claims: claims,
                expires: DateTime.UtcNow.AddHours(8),
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
