ifneq (,$(wildcard ./.env))
    include .env
    export
endif

COMPOSE = sudo docker compose -p bside
COMPOSE_GPU = sudo docker compose -p bside -f docker-compose.yml -f docker-compose.gpu.yml
DOCKER_DB = bside_db_dev
SQLX = sqlx

.PHONY: up up-gpu down re re-gpu clean logs status db-shell db-reset migrate prepare wait-db

# Always rebuilds from current source, then waits for the database and
# applies pending migrations before returning.
up:
	$(COMPOSE) up -d --build
	$(MAKE) wait-db
	$(MAKE) migrate

# Requires the NVIDIA Container Toolkit on the host, see docker-compose.gpu.yml
up-gpu:
	$(COMPOSE_GPU) up -d --build
	$(MAKE) wait-db
	$(MAKE) migrate

down:
	$(COMPOSE) down

# Tears down containers, volumes, AND the images built for this project
# (not pulled base images like postgres/minio), so the next `up`/`re`
# is guaranteed to rebuild from current source instead of reusing a stale image.
clean:
	$(COMPOSE) down -v --rmi local --remove-orphans

re:
	$(MAKE) clean
	$(MAKE) up

re-gpu:
	$(MAKE) clean
	$(MAKE) up-gpu

logs:
	$(COMPOSE) logs -f

status:
	$(COMPOSE) ps

db-shell:
	docker exec -it $(DOCKER_DB) psql -U $(DB_USER) -d $(DB_NAME)

db-reset:
	$(SQLX) database reset -y

migrate:
	$(SQLX) migrate run --source ./back/migrations

prepare:
	$(SQLX) prepare

# Polls the db container until Postgres accepts connections, instead of a
# blind sleep — avoids racing migrate/backend startup against a cold container.
wait-db:
	@echo "Waiting for database to accept connections..."
	@for i in $$(seq 1 30); do \
		$(COMPOSE) exec -T db pg_isready -U $(DB_USER) -d $(DB_NAME) >/dev/null 2>&1 && exit 0; \
		sleep 1; \
	done; \
	echo "Database did not become ready in time." >&2; exit 1
