ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# Cargo-installed tools are not always present in the PATH inherited by make.
export PATH := $(HOME)/.cargo/bin:$(PATH)

COMPOSE = sudo docker compose -p bside
COMPOSE_GPU = sudo docker compose -p bside -f docker-compose.yml -f docker-compose.gpu.yml
DOCKER_DB = bside_db_dev
SQLX = sqlx

# ML showcase knobs (override on the command line, e.g. `make showcase API=https://host/api`)
API       ?= https://localhost/api
SONGS      ?= scripts/songs
ADMIN_ID   ?= admin@bside.local
ADMIN_PW   ?= Password123!
DRIFT_DAY1 ?= 2026-09-02
DRIFT_DAY2 ?= 2026-09-03
DRIFT_NIGHT ?= 1

.PHONY: up up-gpu down re re-gpu clean logs status db-shell db-reset migrate prepare wait-db \
        showcase showcase-catalogue showcase-personas showcase-verify showcase-drift

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

# ─────────────────────────────────────────────────────────────────────────────
# ML recommendation showcase — see ML_SHOWCASE_RUNBOOK.md for the full narrative.
#
#   make showcase        one-shot: stack up -> base seed -> 249-track catalogue
#                        (frozen ml_cache, no GPU) -> 15 personas + preference
#                        vectors -> verify every persona gets a Daily Mix.
#   make showcase-drift  replay the "preference vectors drift every night" proof
#                        (worker day1 -> simulated listening -> worker day2 -> diff).
#
# Prereq: the catalogue itself is git-ignored (5.8 GB). Restore it to $(SONGS)/
# as <Artist>/<Album>/NN Title.flac before the first run (runbook §1).
# ─────────────────────────────────────────────────────────────────────────────
showcase: up showcase-catalogue showcase-personas showcase-verify
	@echo "✅ ML showcase ready — personas showcase01..15@bside.local / Password123!"

showcase-catalogue:
	@test -d "$(SONGS)" || { echo "✗ $(SONGS)/ is missing — restore the catalogue archive first (runbook §1)." >&2; exit 1; }
	@echo "▶ base seed (admin account for the uploader)"
	docker exec -i $(DOCKER_DB) psql -U $(DB_USER) -d $(DB_NAME) < back/seeds/full_seed.sql
	@echo "▶ uploading $(SONGS)/ via the real create->upload->verify->/analyze pipeline (ml_cache replay)"
	@TOKEN=$$(curl -k -s -X POST "$(API)/login" -H 'Content-Type: application/json' \
		-d '{"identifier":"$(ADMIN_ID)","password":"$(ADMIN_PW)"}' \
		| python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])'); \
	test -n "$$TOKEN" || { echo "✗ could not obtain an admin token from $(API)/login" >&2; exit 1; }; \
	python3 scripts/upload-test-library.py --root "$(SONGS)" --api "$(API)" --insecure --token "$$TOKEN"
	@echo "▶ waiting for in-flight analyses to drain (status='Pending')"
	@for i in $$(seq 1 60); do \
		pending=$$(docker exec -i $(DOCKER_DB) psql -U $(DB_USER) -d $(DB_NAME) -tAc \
			"SELECT count(*) FROM songs WHERE status = 'Pending';"); \
		[ "$$pending" = "0" ] && break; \
		echo "  $$pending still analysing..."; sleep 5; \
	done; \
	docker exec -i $(DOCKER_DB) psql -U $(DB_USER) -d $(DB_NAME) -c \
		"SELECT status, cardinality(normalized_vector) AS dims, count(*) FROM songs GROUP BY 1,2 ORDER BY 1,2;"
	@echo "  (a few stuck 'Pending' after the timeout is the known §7 429-burst issue — re-run this target;"
	@echo "   'seed_ml_showcase.sql' below is ON_ERROR_STOP and is the real gate on catalogue health.)"

showcase-personas:
	@echo "▶ seeding 15 personas + real 6-D preference vectors"
	docker exec -i $(DOCKER_DB) psql -U $(DB_USER) -d $(DB_NAME) < back/seeds/seed_ml_showcase.sql

showcase-verify:
	@echo "▶ logging in showcase01..15 and pulling each Daily Mix"
	python3 scripts/check-ml-showcase.py --api "$(API)" --insecure

showcase-drift:
	python3 scripts/prove-nightly-drift.py \
		--day-one $(DRIFT_DAY1) --day-two $(DRIFT_DAY2) --night $(DRIFT_NIGHT) --insecure
