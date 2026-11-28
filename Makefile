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
	@printf "\n$(BOLD)$(CYAN)  Zenith Assets & Properties - Admin Portal CLI$(RESET)\n"
	@printf "$(BOLD)$(CYAN)  ==============================================$(RESET)\n\n"
	@printf "$(YELLOW)Usage:$(RESET) make [target]\n\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[32m%-20s\033[0m %s\n", $$1, $$2}'
	@printf "\n"

# -----------------------------------------------------------------------------
# Setup & Dependency Management
# -----------------------------------------------------------------------------
.PHONY: install
install: ## Install dependencies and register git hooks
	@printf "$(CYAN)--> Installing NPM dependencies...$(RESET)\n"
	@npm install
	@$(MAKE) hooks-install
	@printf "$(GREEN)✔ Dependencies installed and git hooks configured successfully.$(RESET)\n"

.PHONY: hooks-install
hooks-install: ## Configure git to execute hooks from .githooks directory
	@printf "$(CYAN)--> Configuring Git hooks path...$(RESET)\n"
	@git config core.hooksPath .githooks 2>/dev/null || true
	@chmod +x .githooks/* 2>/dev/null || true
	@printf "$(GREEN)✔ Git hooks enabled from .githooks.$(RESET)\n"

# -----------------------------------------------------------------------------
# Code Quality, Formatting & Testing
# -----------------------------------------------------------------------------
.PHONY: lint
lint: ## Run ESLint static analysis checks
	@printf "$(CYAN)--> Running ESLint...$(RESET)\n"
	@npm run lint

.PHONY: lint-fix
lint-fix: ## Run ESLint and automatically fix fixable issues
	@printf "$(CYAN)--> Running ESLint --fix...$(RESET)\n"
	@npm run lint:fix

.PHONY: typecheck
typecheck: ## Run TypeScript strict type verification
	@printf "$(CYAN)--> Checking TypeScript types...$(RESET)\n"
	@npm run typecheck

.PHONY: test
test: ## Run Vitest unit and integration tests
	@printf "$(CYAN)--> Running tests with Vitest...$(RESET)\n"
	@npm run test

.PHONY: test-watch
test-watch: ## Run tests in interactive watch mode
	@npm run test:watch

.PHONY: check
check: lint typecheck test ## Run full pre-flight verification (lint, typecheck, test)
	@printf "$(GREEN)✔ All quality checks passed successfully!$(RESET)\n"

# -----------------------------------------------------------------------------
# Local Development & Build
# -----------------------------------------------------------------------------
.PHONY: dev
dev: ## Start local Next.js development server with Turbopack
	@printf "$(CYAN)--> Launching Zenith Admin Portal development server...$(RESET)\n"
	@npm run dev

.PHONY: build
build: ## Build optimized production Next.js standalone package
	@printf "$(CYAN)--> Building production release...$(RESET)\n"
	@npm run build
	@printf "$(GREEN)✔ Production standalone bundle generated in .next/standalone$(RESET)\n"

.PHONY: start
start: ## Run local Next.js production server
	@npm run start

# -----------------------------------------------------------------------------
# Database Operations
# -----------------------------------------------------------------------------
.PHONY: db-up
db-up: ## Start PostgreSQL container in background
	@printf "$(CYAN)--> Starting PostgreSQL container...$(RESET)\n"
	@npm run docker:db

.PHONY: db-down
db-down: ## Stop PostgreSQL container
	@printf "$(CYAN)--> Stopping PostgreSQL container...$(RESET)\n"
	@npm run docker:down

.PHONY: db-migrate
db-migrate: ## Apply database schema migrations
	@printf "$(CYAN)--> Running database migrations...$(RESET)\n"
	@npm run db:migrate

.PHONY: db-generate
db-generate: ## Generate new Drizzle migration files from schema
	@npm run db:generate

.PHONY: db-seed
db-seed: ## Seed database with base admin users and configuration
	@printf "$(CYAN)--> Seeding database...$(RESET)\n"
	@npm run db:seed

.PHONY: db-demo
db-demo: ## Seed database with full realistic property and transaction demo dataset
	@printf "$(CYAN)--> Seeding demo dataset...$(RESET)\n"
	@npm run db:demo

.PHONY: db-reset
db-reset: db-migrate db-seed db-demo ## Re-run migrations and reload seed and demo data
	@printf "$(GREEN)✔ Database successfully reset and seeded!$(RESET)\n"

# -----------------------------------------------------------------------------
# Docker Development Stack
# -----------------------------------------------------------------------------
.PHONY: docker-dev-build
docker-dev-build: ## Build the development Docker image
	@printf "$(CYAN)--> Building Docker development image...$(RESET)\n"
	@$(DOCKER_DEV) build

.PHONY: docker-dev
docker-dev: ## Launch development Docker environment with hot-reloading
	@printf "$(CYAN)--> Launching Docker development environment...$(RESET)\n"
	@$(DOCKER_DEV) up --build

.PHONY: docker-dev-down
docker-dev-down: ## Stop and remove development Docker containers
	@printf "$(CYAN)--> Stopping Docker development environment...$(RESET)\n"
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
	@printf "$(CYAN)--> Building production Docker image...$(RESET)\n"
	@$(DOCKER_PRD) build

.PHONY: docker-prod-up
docker-prod-up: ## Launch production Docker stack in detached mode
	@printf "$(CYAN)--> Starting production Docker stack...$(RESET)\n"
	@$(DOCKER_PRD) up -d --build
	@printf "$(GREEN)✔ Zenith Admin Portal running on http://localhost:3000$(RESET)\n"

.PHONY: docker-prod-down
docker-prod-down: ## Stop and remove production Docker containers
	@printf "$(CYAN)--> Stopping production Docker stack...$(RESET)\n"
	@$(DOCKER_PRD) down

.PHONY: docker-prod-logs
docker-prod-logs: ## View production container logs
	@$(DOCKER_PRD) logs -f admin-portal

# -----------------------------------------------------------------------------
# Maintenance & Cleanup
# -----------------------------------------------------------------------------
.PHONY: clean
clean: ## Remove build artifacts, caches, and logs
	@printf "$(CYAN)--> Cleaning build artifacts...$(RESET)\n"
	@rm -rf .next out dist coverage *.tsbuildinfo .uploads
	@printf "$(GREEN)✔ Clean complete.$(RESET)\n"

.PHONY: clean-all
clean-all: clean ## Deep clean including node_modules and lockfiles
	@printf "$(RED)--> Performing deep clean (removing node_modules)...$(RESET)\n"
	@rm -rf node_modules
	@printf "$(GREEN)✔ Deep clean complete. Run 'make install' to restore.$(RESET)\n"

.PHONY: verify-pr
verify-pr: check build ## Full PR pre-flight checklist: check, build
	@printf "\n$(BOLD)$(GREEN)=======================================================$(RESET)\n"
	@printf "$(BOLD)$(GREEN)  ✔ PR Pre-flight verification passed successfully!     $(RESET)\n"
	@printf "$(BOLD)$(GREEN)=======================================================$(RESET)\n\n"
