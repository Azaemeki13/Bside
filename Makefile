ifneq (,$(wildcard ./.env))
    include .env
    export
endif

COMPOSE = sudo docker compose -p bside
DOCKER_DB = bside_db_dev
SQLX = sqlx

.PHONY: up down re clean logs status db-shell db-reset migrate prepare

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

clean:
	$(COMPOSE) down -v

re:
	$(COMPOSE) down --remove-orphans
	$(COMPOSE) up -d --build --force-recreate
	@sleep 3
	$(MAKE) migrate
logs:
	$(COMPOSE) logs -f

status:
	$(COMPOSE) ps

db-shell:
	docker exec -it $(DOCKER_DB) psql -U bside_admin -d bside_db

db-reset:
	$(SQLX) database reset -y

migrate:
	$(SQLX) migrate run --source ./back/migrations

prepare:
	$(SQLX) prepare
