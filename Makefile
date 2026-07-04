# ==============================================================
# SecureBank Platform — Makefile
# ==============================================================

.PHONY: help dev test build lint security-scan docker-build create-secrets rollback-app backup-db

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --- Development ---
dev: ## Start local development stack
	docker compose up -d postgres redis kafka
	@echo "Waiting for services to be healthy..."
	@sleep 5
	npx prisma migrate dev
	npm run dev

dev-down: ## Stop local development stack
	docker compose down

# --- Testing ---
test: ## Run tests with coverage (≥80% required)
	npm test

test-watch: ## Run tests in watch mode
	npm run test:watch

test-integration: ## Run integration tests
	npm run test:integration

# --- Build ---
build: ## Build TypeScript to JavaScript
	npm run build

# --- Linting ---
lint: ## Run all linters
	npm run lint
	@echo "✅ ESLint passed"

lint-dockerfile: ## Lint Dockerfile with Hadolint
	docker run --rm -i hadolint/hadolint:v2.12.0 < Dockerfile
	@echo "✅ Hadolint passed"

lint-k8s: ## Lint Kubernetes manifests with kube-linter
	docker run --rm -v $(PWD)/kubernetes:/work stackrox/kube-linter:v0.6.7 lint /work/base/
	@echo "✅ kube-linter passed"

# --- Security ---
security-scan: ## Run Gitleaks + Trivy scans
	docker run --rm -v $(PWD):/path zricethezav/gitleaks:v8.18.4 detect --source=/path --verbose
	@echo "✅ Gitleaks passed"
	docker run --rm -v $(PWD):/work aquasec/trivy:0.49.1 fs /work --severity CRITICAL,HIGH --exit-code 1
	@echo "✅ Trivy filesystem scan passed"

# --- Docker ---
docker-build: ## Build production Docker image
	docker build -t securebank-api:latest .
	@echo "✅ Docker image built"

docker-scan: ## Scan Docker image with Trivy
	docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.49.1 image securebank-api:latest --severity CRITICAL,HIGH --exit-code 1
	@echo "✅ Trivy image scan passed"

# --- Database ---
db-migrate: ## Run database migrations
	npx prisma migrate dev

db-migrate-prod: ## Run production database migrations
	npx prisma migrate deploy

db-seed: ## Seed database with initial data
	npm run db:seed

db-studio: ## Open Prisma Studio
	npx prisma studio

backup-db: ## Backup PostgreSQL database
	@mkdir -p backups
	docker exec securebank-postgres pg_dump -U securebank securebank > backups/securebank_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "✅ Database backed up"

# --- Secrets ---
create-secrets: ## Create Kubernetes secrets interactively
	@echo "=== SecureBank Kubernetes Secret Creation ==="
	@echo "This will create secrets in your current Kubernetes context."
	@read -p "Database URL: " DB_URL; \
	read -p "Redis URL: " REDIS_URL; \
	read -p "Encryption Key (32-char hex): " ENC_KEY; \
	read -p "SMTP Password: " SMTP_PASS; \
	read -p "SMS API Key: " SMS_KEY; \
	kubectl create secret generic securebank-secrets \
		--from-literal=DATABASE_URL=$$DB_URL \
		--from-literal=REDIS_URL=$$REDIS_URL \
		--from-literal=ENCRYPTION_KEY=$$ENC_KEY \
		--from-literal=SMTP_PASS=$$SMTP_PASS \
		--from-literal=SMS_API_KEY=$$SMS_KEY \
		--namespace=securebank \
		--dry-run=client -o yaml | kubectl apply -f -
	@echo "=== Creating JWT RSA key pair ==="
	@openssl genrsa -out /tmp/jwt-private.pem 4096
	@openssl rsa -in /tmp/jwt-private.pem -pubout -out /tmp/jwt-public.pem
	kubectl create secret generic securebank-jwt-keys \
		--from-file=private.pem=/tmp/jwt-private.pem \
		--from-file=public.pem=/tmp/jwt-public.pem \
		--namespace=securebank \
		--dry-run=client -o yaml | kubectl apply -f -
	@rm -f /tmp/jwt-private.pem /tmp/jwt-public.pem
	@echo "✅ Secrets created"

# --- Deployment ---
rollback-app: ## Rollback to previous Argo CD revision
	argocd app rollback securebank-api
	@echo "✅ Rollback initiated"

# --- Key Generation (local dev) ---
generate-keys: ## Generate RSA key pair for local JWT signing
	@mkdir -p keys
	openssl genrsa -out keys/private.pem 4096
	openssl rsa -in keys/private.pem -pubout -out keys/public.pem
	@echo "✅ RSA keys generated in ./keys/"
	@echo "⚠️  NEVER commit these files to Git!"
