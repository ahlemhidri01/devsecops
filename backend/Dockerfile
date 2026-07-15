# Build Stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY ["SecureBank.Api.csproj", "./"]
RUN dotnet restore "./SecureBank.Api.csproj"
COPY . .
RUN dotnet build "SecureBank.Api.csproj" -c Release -o /app/build && \
    dotnet publish "SecureBank.Api.csproj" -c Release -o /app/publish

# Runtime Stage
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -s /bin/false -M appuser

COPY --from=build /app/publish .
RUN chown -R appuser:appgroup /app

USER appuser
ENTRYPOINT ["dotnet", "SecureBank.Api.dll"]
