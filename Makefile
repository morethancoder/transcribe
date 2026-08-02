.DEFAULT_GOAL := help
.PHONY: help doctor setup dev build start preview check release clean

help: ## show this help
	@awk 'BEGIN {FS = ":.*?## "; printf "\n\033[1mUsage:\033[0m make \033[36m<target>\033[0m\n\n\033[1mTargets:\033[0m\n"} \
	     /^[a-z]+:.*?## / {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2} \
	     END {print ""}' $(MAKEFILE_LIST)

doctor: ## check required tools and project state
	@bash scripts/doctor.sh

setup: ## install dependencies (runs doctor first)
	@bash scripts/setup.sh

dev: ## start the dev server on :5173
	@pnpm dev

build: ## build release archives for every platform into dist/
	@bash scripts/build.sh

start: ## run the production server from build/
	@pnpm start

preview: ## serve the production build locally
	@pnpm preview

check: ## type-check with svelte-check
	@pnpm check

release: ## bump the version, tag, and publish a GitHub release via CI
	@bash scripts/release.sh

clean: ## remove build output and caches (keeps the models)
	@rm -rf .svelte-kit build dist .playwright
	@echo "cleaned (models/ kept — delete manually to re-download)"
