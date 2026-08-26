.DEFAULT_GOAL := help

.PHONY: help build up up-gpu down logs ps restart config

help:
	@printf '%s\n' \
	  'CVFuzz deployment commands:' \
	  '  make build   Build the frontend and backend images' \
	  '  make up      Start the CPU deployment at http://localhost:3010' \
	  '  make up-gpu  Start with NVIDIA GPU support (Linux hosts only)' \
	  '  make down    Stop the deployment without deleting run artifacts' \
	  '  make logs    Follow service logs' \
	  '  make ps      Show service status' \
	  '  make restart Restart the running services' \
	  '  make config  Validate and render the Compose configuration'

build:
	docker compose build

up:
	docker compose up --build --remove-orphans -d

up-gpu:
	docker compose -f compose.yaml -f compose.gpu.yaml up --build --remove-orphans -d

down:
	docker compose down

logs:
	docker compose logs --follow --tail=100

ps:
	docker compose ps

restart:
	docker compose restart

config:
	docker compose config
