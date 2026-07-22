using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SecureBank.Api.Data;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Database — PostgreSQL via EF Core
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// CORS — allow Angular dev server + production
builder.Services.AddCors(options =>
{
    // Policy nommée explicitement, utilisée en production.
    // (AddDefaultPolicy() enregistre sous un nom interne spécial, pas la chaîne "default" —
    //  UseCors("default") ne pouvait donc jamais la trouver et échouait silencieusement.)
    options.AddPolicy("Production", policy =>
        policy.WithOrigins("http://localhost:4200", "http://localhost:80", "http://localhost")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());

    // Permissif, réservé au développement local uniquement.
    options.AddPolicy("AllowAll", policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

// JWT Authentication
// Aucun fallback en dur : si la clé n'est pas configurée, l'application refuse de démarrer
// plutôt que de signer/valider des tokens avec une clé connue publiquement dans le code source.
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException(
        "JWT signing key is not configured. Set 'Jwt:Key' via configuration or the 'Jwt__Key' environment variable.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = "SecureBankPlatform",
            ValidAudience = "SecureBankClients",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

// Swagger UI always visible in dev
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Apply CORS before auth — policy nommée explicitement dans les deux cas,
// pour ne plus dépendre d'une policy "default" qui n'existait pas réellement.
app.UseCors(app.Environment.IsDevelopment() ? "AllowAll" : "Production");

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Health check
app.MapGet("/health", () => Results.Ok(new { status = "ok", timestamp = DateTime.UtcNow }));

// Auto-apply EF Core migrations on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

app.Run();
