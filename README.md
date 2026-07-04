# SecureBank Platform — DevSecOps Backend

SecureBank Platform is a production-grade banking API engineered from the ground up with strict security constraints, complying with **PCI-DSS, DORA, NIS2, and RGPD** directives.

Built using Node.js (Express), TypeScript, Prisma (PostgreSQL), Redis, and Kafka, and orchestrated via Kubernetes and Argo CD.

## 🏗️ Architecture

The project follows Domain-Driven Design (DDD) principles:

- **Shared Kernel (`src/shared/`)**: Contains generic, cross-cutting concerns like database singletons, Kafka connections, encryption utilities, centralized error handling, rate limiting, and audit logging.
- **Functional Modules (`src/modules/`)**:
  - **Auth**: User registration, JWT session management, MFA (TOTP), KYC status handling.
  - **Accounts**: IBAN generation, limits management, account closure, statement generation (PDF/JSON).
  - **Transactions**: Complex saga-based transfers (Internal, SEPA, SWIFT), duplicate detection, real-time fraud scoring.
  - **Beneficiaries**: MFA-enforced addition, 72h quarantine cooling period.
  - **Cards**: PCI-DSS compliant PAN tokenization, virtual/physical card issuance, instant blocking.
  - **Notifications**: Kafka event listeners dispatching SMS/Emails/In-app alerts.
  - **Compliance**: GDPR "Right to be forgotten" execution, PCI-DSS audit log extraction, DORA incident reporting.

## 🛡️ Security Features

1. **At-Rest Encryption**: Database records holding sensitive PII and financial configuration (MFA secrets, external IBANs) are encrypted using AES-256-CBC.
2. **In-Transit Encryption**: All service communications run over TLS.
3. **Data Masking**: Winston logger is configured to actively redact PANs, IBANs, and Email addresses before writing to output.
4. **Append-Only Audit Trail**: Every mutating API action writes to a tamper-proof `AuditLog` table and pushes to a Kafka topic.
5. **MFA Enforced**: TOTP codes are strictly required for high-risk operations (login, large transfers, adding beneficiaries).
6. **Zero-Trust K8s Network**: Pod-to-Pod communication is restricted via strict `NetworkPolicy` manifests.
7. **Rate Limiting**: Brute-force protection on all auth endpoints (5 req/min).

## 🚀 Deployment (Jelastic P4D & Kubernetes)

The application is containerized using a multi-stage Docker build, dropping root privileges (`runAsUser: 1001`), and using `dumb-init` for PID 1 signaling.

### GitOps Flow (Azure DevOps + Argo CD)
1. Developers push to `main` or `develop`.
2. **Azure DevOps Pipeline** triggers:
   - Secret Scanning (`gitleaks`)
   - SAST Analysis (`SonarQube`)
   - Unit Tests (requires 80% coverage)
   - Docker Build
   - Image Vulnerability Scanning (`Trivy`)
   - Push to Azure Container Registry
3. The pipeline commits the new image tag to the `kubernetes/overlays/production` directory.
4. **Argo CD** detects the drift and syncs the cluster state.

### Jelastic Environment Topology
For Jelastic deployment, provision a Kubernetes cluster with the following topology:
- **Load Balancer Layer**: Nginx Ingress Controller (auto-scaling 1-3 nodes).
- **Worker Nodes (App)**: SecureBank API Pods running on dedicated CP nodes.
- **Data Nodes**:
  - PostgreSQL 16 Cluster (Primary/Replica)
  - Redis 7 Cluster
  - Apache Kafka (KRaft mode)

### Secrets Management
**DO NOT** store secrets in Git.
1. Generate local RSA keys: `make generate-keys`
2. Kubernetes secrets must be provisioned manually or via an external Vault (e.g., HashiCorp Vault) into the `securebank-prod` namespace using the name `securebank-api-secrets`.
3. Required variables include `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, and `JWT_PRIVATE_KEY`.

## 🛠️ Local Development

1. Create a `.env` file based on `.env.example`.
2. Start the local infrastructure:
   ```bash
   make dev-infra
   ```
3. Generate RSA keys for JWTs:
   ```bash
   make generate-keys
   ```
4. Run DB migrations:
   ```bash
   make db-push
   ```
5. Start the API:
   ```bash
   make start-dev
   ```

## 🧪 Testing

Run unit tests with Jest:
```bash
make test
```

Run security scanners locally:
```bash
make scan-secrets
make scan-image
```
