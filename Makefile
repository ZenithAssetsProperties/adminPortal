# =============================================================================
# Zenith Admin Portal - Enterprise Makefile
# Automation for Development, Testing, Database, Docker & Git Operations
# =============================================================================

.DEFAULT_GOAL := help
SHELL         := /bin/bash

# --- Color Definitions --------------------------------------------------------
BOLD   := \033[1m
CYAN   := \033[36m
GREEN  := \033[32m
YELLOW := \033[33m
RED    := \033[31m
RESET  := \033[0m

# --- Configuration & Variables -----------------------------------------------
NODE_BIN   := ./node_modules/.bin
DOCKER_DEV := docker compose -f docker-compose.dev.yml
DOCKER_PRD := docker compose -f docker-compose.prod.yml
DOCKER_BASE:= docker compose -f docker-compose.yml

.PHONY: help
help: ## Show this interactive help banner
	@echo ""
	@echo "$(BOLD)$(CYAN)  Zenith Assets & Properties - Admin Portal CLI$(RESET)"
	@echo "$(BOLD)$(CYAN)  ==============================================$(RESET)"
	@echo ""
	@echo "$(YELLOW)Usage:$(RESET) make [target]"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""

# -----------------------------------------------------------------------------
# Setup & Dependency Management
# -----------------------------------------------------------------------------
.PHONY: install
install: ## Install dependencies and register git hooks
	@echo "$(CYAN)--> Installing NPM dependencies...$(RESET)"
	@npm install
	@$(MAKE) hooks-install
	@echo "$(GREEN)✔ Dependencies installed and git hooks configured successfully.$(RESET)"

.PHONY: hooks-install
hooks-install: ## Configure git to execute hooks from .githooks directory
	@echo "$(CYAN)--> Configuring Git hooks path...$(RESET)"
	@git config core.hooksPath .githooks 2>/dev/null || true
	@chmod +x .githooks/* 2>/dev/null || true
	@echo "$(GREEN)✔ Git hooks enabled from .githooks.$(RESET)"

# -----------------------------------------------------------------------------
# Code Quality, Formatting & Testing
# -----------------------------------------------------------------------------
.PHONY: lint
lint: ## Run ESLint static analysis checks
	@echo "$(CYAN)--> Running ESLint...$(RESET)"
	@npm run lint

.PHONY: lint-fix
lint-fix: ## Run ESLint and automatically fix fixable issues
	@echo "$(CYAN)--> Running ESLint --fix...$(RESET)"
	@npm run lint:fix

.PHONY: typecheck
typecheck: ## Run TypeScript strict type verification
	@echo "$(CYAN)--> Checking TypeScript types...$(RESET)"
	@npm run typecheck

.PHONY: test
test: ## Run Vitest unit and integration tests
	@echo "$(CYAN)--> Running tests with Vitest...$(RESET)"
	@npm run test

.PHONY: test-watch
test-watch: ## Run tests in interactive watch mode
	@npm run test:watch

.PHONY: check
check: lint typecheck test ## Run full pre-flight verification (lint, typecheck, test)
	@echo "$(GREEN)✔ All quality checks passed successfully!$(RESET)"

# -----------------------------------------------------------------------------
# Local Development & Build
# -----------------------------------------------------------------------------
.PHONY: dev
dev: ## Start local Next.js development server with Turbopack
	@echo "$(CYAN)--> Launching Zenith Admin Portal development server...$(RESET)"
	@npm run dev

.PHONY: build
build: ## Build optimized production Next.js standalone package
	@echo "$(CYAN)--> Building production release...$(RESET)"
	@npm run build
	@echo "$(GREEN)✔ Production standalone bundle generated in .next/standalone$(RESET)"

.PHONY: start
start: ## Run local Next.js production server
	@npm run start

# -----------------------------------------------------------------------------
# Database Operations
# -----------------------------------------------------------------------------
.PHONY: db-up
db-up: ## Start PostgreSQL container in background
	@echo "$(CYAN)--> Starting PostgreSQL container...$(RESET)"
	@npm run docker:db

.PHONY: db-down
db-down: ## Stop PostgreSQL container
	@echo "$(CYAN)--> Stopping PostgreSQL container...$(RESET)"
	@npm run docker:down

.PHONY: db-migrate
db-migrate: ## Apply database schema migrations
	@echo "$(CYAN)--> Running database migrations...$(RESET)"
	@npm run db:migrate

.PHONY: db-generate
db-generate: ## Generate new Drizzle migration files from schema
	@npm run db:generate

.PHONY: db-seed
db-seed: ## Seed database with base admin users and configuration
	@echo "$(CYAN)--> Seeding database...$(RESET)"
	@npm run db:seed

.PHONY: db-demo
db-demo: ## Seed database with full realistic property and transaction demo dataset
	@echo "$(CYAN)--> Seeding demo dataset...$(RESET)"
	@npm run db:demo

.PHONY: db-reset
db-reset: db-migrate db-seed db-demo ## Re-run migrations and reload seed and demo data
	@echo "$(GREEN)✔ Database successfully reset and seeded!$(RESET)"

# -----------------------------------------------------------------------------
# Docker Development Stack
# -----------------------------------------------------------------------------
.PHONY: docker-dev-build
docker-dev-build: ## Build the development Docker image
	@echo "$(CYAN)--> Building Docker development image...$(RESET)"
	@$(DOCKER_DEV) build

.PHONY: docker-dev
docker-dev: ## Launch development Docker environment with hot-reloading
	@echo "$(CYAN)--> Launching Docker development environment...$(RESET)"
	@$(DOCKER_DEV) up --build

.PHONY: docker-dev-down
docker-dev-down: ## Stop and remove development Docker containers
	@echo "$(CYAN)--> Stopping Docker development environment...$(RESET)"
	@$(DOCKER_DEV) down

.PHONY: docker-dev-logs
docker-dev-logs: ## View real-time development Docker container logs
	@$(DOCKER_DEV) logs -f

.PHONY: docker-dev-shell
docker-dev-shell: ## Open interactive shell inside running development container
	@$(DOCKER_DEV) exec admin-portal /bin/sh

# -----------------------------------------------------------------------------
# Docker Production Stack
# -----------------------------------------------------------------------------
.PHONY: docker-prod-build
docker-prod-build: ## Build multi-stage production Docker image
	@echo "$(CYAN)--> Building production Docker image...$(RESET)"
	@$(DOCKER_PRD) build

.PHONY: docker-prod-up
docker-prod-up: ## Launch production Docker stack in detached mode
	@echo "$(CYAN)--> Starting production Docker stack...$(RESET)"
	@$(DOCKER_PRD) up -d --build
	@echo "$(GREEN)✔ Zenith Admin Portal running on http://localhost:3000$(RESET)"

.PHONY: docker-prod-down
docker-prod-down: ## Stop and remove production Docker containers
	@echo "$(CYAN)--> Stopping production Docker stack...$(RESET)"
	@$(DOCKER_PRD) down

.PHONY: docker-prod-logs
docker-prod-logs: ## View production container logs
	@$(DOCKER_PRD) logs -f admin-portal

# -----------------------------------------------------------------------------
# Maintenance & Cleanup
# -----------------------------------------------------------------------------
.PHONY: clean
clean: ## Remove build artifacts, caches, and logs
	@echo "$(CYAN)--> Cleaning build artifacts...$(RESET)"
	@rm -rf .next out dist coverage *.tsbuildinfo .uploads
	@echo "$(GREEN)✔ Clean complete.$(RESET)"

.PHONY: clean-all
clean-all: clean ## Deep clean including node_modules and lockfiles
	@echo "$(RED)--> Performing deep clean (removing node_modules)...$(RESET)"
	@rm -rf node_modules
	@echo "$(GREEN)✔ Deep clean complete. Run 'make install' to restore.$(RESET)"

.PHONY: verify-pr
verify-pr: check build ## Full PR pre-flight checklist: check, build
	@echo ""
	@echo "$(BOLD)$(GREEN)=======================================================$(RESET)"
	@echo "$(BOLD)$(GREEN)  ✔ PR Pre-flight verification passed successfully!     $(RESET)"
	@echo "$(BOLD)$(GREEN)=======================================================$(RESET)"
	@echo ""
