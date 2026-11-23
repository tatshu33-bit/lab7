#!/usr/bin/env bash
# Запускає pgbench-сценарії q*.sql на БД blog_bench (одне з'єднання, -n без vacuum) і друкує JSON.
# Параметри середовища: PGHOST PGPORT PGUSER; N — кількість постів у БД (50000).
set -euo pipefail
cd "$(dirname "$0")"; N=${N:-50000}; DB=${DB:-blog_bench}
run() { # id, транзакцій
  local id=$1 t=$2
  local out; out=$(pgbench -n -c 1 -j 1 -t "$t" -D N="$N" -f "q$id.sql" "$DB" 2>&1)
  local lat; lat=$(echo "$out" | awk -F'= ' '/latency average/ {print $2}' | awk '{print $1}')
  echo "{\"id\":\"Q$id\",\"ms_avg\":$lat,\"tx\":$t}"
}
pgbench -n -c 1 -t 5 -D N="$N" -f q1.sql "$DB" >/dev/null   # прогрів кешу
for q in "1 40" "2 40" "3 30" "4 20" "5 10" "5b 5" "6 5" "7 5" "8 1000" "9 1000" "10 1" "11 20"; do run $q; done
