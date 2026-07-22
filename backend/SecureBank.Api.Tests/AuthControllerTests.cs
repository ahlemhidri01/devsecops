using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using SecureBank.Api.Controllers;
using SecureBank.Api.Data;
using Xunit;

namespace SecureBank.Api.Tests
{
    public class AuthControllerTests
    {
        // Implémentation minimale de IWebHostEnvironment pour les tests.
        // Par défaut sur "Development" pour que le comportement de démo
        // (compte admin@securebank.com / demo123) reste testable,
        // exactement comme il resterait actif en environnement de dev réel.
        private class FakeWebHostEnvironment : IWebHostEnvironment
        {
            public string EnvironmentName { get; set; } = "Development";
            public string ApplicationName { get; set; } = "SecureBank.Api.Tests";
            public string WebRootPath { get; set; } = string.Empty;
            public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
            public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
            public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        }

        private static IWebHostEnvironment CreateTestEnvironment(string environmentName = "Development")
            => new FakeWebHostEnvironment { EnvironmentName = environmentName };

        private static AppDbContext CreateInMemoryContext()
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options;
            return new AppDbContext(options);
        }

        private static IConfiguration CreateTestConfiguration()
        {
            var settings = new Dictionary<string, string?>
            {
                { "Jwt:Key", "Test_Secret_Key_At_Least_32_Chars_Long!" }
            };
            return new ConfigurationBuilder()
                .AddInMemoryCollection(settings)
                .Build();
        }

        [Fact]
        public async Task Register_WithNewEmail_ReturnsOkAndCreatesUserAndAccount()
        {
            // Arrange
            using var context = CreateInMemoryContext();
            var controller = new AuthController(context, CreateTestConfiguration(), CreateTestEnvironment());
            var request = new AuthController.RegisterRequest
            {
                Email = "newuser@test.com",
                Password = "SomePassword1",
                FirstName = "Jane",
                LastName = "Doe"
            };

            // Act
            var result = await controller.Register(request);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            Assert.NotNull(okResult.Value);

            var user = await context.Users.SingleAsync(u => u.Email == "newuser@test.com");
            Assert.Equal("CLIENT", user.Role);
            Assert.Equal("ACTIVE", user.Status);

            var account = await context.Accounts.SingleAsync(a => a.UserId == user.Id);
            Assert.Equal(1000m, account.Balance);
            Assert.Equal("COURANT", account.Type);
        }

        [Fact]
        public async Task Register_WithExistingEmail_ReturnsConflict()
        {
            // Arrange
            using var context = CreateInMemoryContext();
            var controller = new AuthController(context, CreateTestConfiguration(), CreateTestEnvironment());
            var request = new AuthController.RegisterRequest
            {
                Email = "duplicate@test.com",
                Password = "Password1",
                FirstName = "A",
                LastName = "B"
            };
            await controller.Register(request);

            // Act — tente de re-enregistrer le même email
            var result = await controller.Register(request);

            // Assert
            Assert.IsType<ConflictObjectResult>(result);
            var count = await context.Users.CountAsync(u => u.Email == "duplicate@test.com");
            Assert.Equal(1, count); // un seul utilisateur créé, pas de doublon
        }

        [Fact]
        public async Task Login_WithValidCredentials_ReturnsOkWithValidJwt()
        {
            // Arrange
            using var context = CreateInMemoryContext();
            var config = CreateTestConfiguration();
            var registerController = new AuthController(context, config, CreateTestEnvironment());
            await registerController.Register(new AuthController.RegisterRequest
            {
                Email = "login@test.com",
                Password = "MyPassword1",
                FirstName = "Log",
                LastName = "In"
            });

            var loginController = new AuthController(context, config, CreateTestEnvironment());

            // Act
            var result = await loginController.Login(new AuthController.LoginRequest
            {
                Email = "login@test.com",
                Password = "MyPassword1"
            });

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            Assert.NotNull(okResult.Value);

            // Vérifie que le JWT contient bien les claims attendus
            var tokenProp = okResult.Value!.GetType().GetProperty("token");
            var tokenString = tokenProp?.GetValue(okResult.Value) as string;
            Assert.False(string.IsNullOrEmpty(tokenString));

            var handler = new JwtSecurityTokenHandler();
            var jwt = handler.ReadJwtToken(tokenString);
            Assert.Equal("SecureBankPlatform", jwt.Issuer);
            Assert.Contains(jwt.Claims, c => c.Type == System.Security.Claims.ClaimTypes.Role && c.Value == "CLIENT");
        }

        [Fact]
        public async Task Login_WithWrongPassword_ReturnsUnauthorized()
        {
            // Arrange
            using var context = CreateInMemoryContext();
            var config = CreateTestConfiguration();
            await new AuthController(context, config, CreateTestEnvironment()).Register(new AuthController.RegisterRequest
            {
                Email = "wrongpass@test.com",
                Password = "CorrectPassword1",
                FirstName = "X",
                LastName = "Y"
            });

            var controller = new AuthController(context, config, CreateTestEnvironment());

            // Act
            var result = await controller.Login(new AuthController.LoginRequest
            {
                Email = "wrongpass@test.com",
                Password = "IncorrectPassword"
            });

            // Assert
            Assert.IsType<UnauthorizedObjectResult>(result);
        }

        [Fact]
        public async Task Login_WithUnknownEmail_ReturnsUnauthorized()
        {
            // Arrange
            using var context = CreateInMemoryContext();
            var controller = new AuthController(context, CreateTestConfiguration(), CreateTestEnvironment());

            // Act
            var result = await controller.Login(new AuthController.LoginRequest
            {
                Email = "doesnotexist@test.com",
                Password = "Whatever1"
            });

            // Assert
            Assert.IsType<UnauthorizedObjectResult>(result);
        }

        [Fact]
        public async Task Login_WithDemoAdminCredentialsOnFreshDb_SeedsAdminAndReturnsOk()
        {
            // Arrange — base vide, aucun utilisateur enregistré.
            // Environnement explicitement "Development" : c'est la condition
            // requise depuis la correction de sécurité pour que la backdoor
            // de démo reste accessible (elle est bloquée en Production).
            using var context = CreateInMemoryContext();
            var controller = new AuthController(context, CreateTestConfiguration(), CreateTestEnvironment("Development"));

            // Act
            var result = await controller.Login(new AuthController.LoginRequest
            {
                Email = "admin@securebank.com",
                Password = "demo123"
            });

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            Assert.NotNull(okResult.Value);

            var admin = await context.Users.SingleAsync(u => u.Email == "admin@securebank.com");
            Assert.Equal("ADMIN", admin.Role);

            var accounts = await context.Accounts.Where(a => a.UserId == admin.Id).ToListAsync();
            Assert.Equal(2, accounts.Count); // Compte courant + Livret A
        }

        [Fact]
        public async Task Login_WithDemoAdminCredentialsInProduction_ReturnsUnauthorized()
        {
            // Nouveau test : vérifie explicitement que la backdoor de démo
            // est bien désactivée en environnement de Production.
            using var context = CreateInMemoryContext();
            var controller = new AuthController(context, CreateTestConfiguration(), CreateTestEnvironment("Production"));

            var result = await controller.Login(new AuthController.LoginRequest
            {
                Email = "admin@securebank.com",
                Password = "demo123"
            });

            Assert.IsType<UnauthorizedObjectResult>(result);

            var adminExists = await context.Users.AnyAsync(u => u.Email == "admin@securebank.com");
            Assert.False(adminExists); // aucun compte ne doit avoir été créé
        }
    }
}
