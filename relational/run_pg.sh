#!/usr/bin/env bash
# PostgreSQL-частина порівняльного аналізу: схема, ті самі дані (seed = 7), запити, pgbench.
# Вимоги: psql, pgbench, Node.js; доступ до сервера через PGHOST/PGPORT/PGUSER (за замовчуванням localhost).
# Створює БД blog_lab (60 постів, як у MongoDB) та blog_bench (N постів). N за замовчуванням 50000.
set -euo pipefail
cd "$(dirname "$0")"; mkdir -p ../output; N=${N:-50000}; TMP=$(mktemp -d)
psql="psql -q -v ON_ERROR_STOP=1"
for db in blog_lab blog_bench; do dropdb --if-exists $db; createdb $db; done

node gen_pg.js lab   "$TMP/lab.sql"
$psql -d blog_lab -f 01_schema.sql -f "$TMP/lab.sql" -f 02_indexes.sql > /dev/null
psql -d blog_lab -f 03_lab_queries.sql > ../output/10_pg_lab_queries.txt

node gen_pg.js bench "$TMP/bench.sql" "$N"
s=$(date +%s.%N); $psql -d blog_bench -f 01_schema.sql -f "$TMP/bench.sql" > /dev/null; e=$(date +%s.%N)
echo "завантаження: $(echo "$e - $s" | bc) с" | tee ../output/10_pg_load.txt
s=$(date +%s.%N); $psql -d blog_bench -f 02_indexes.sql > /dev/null; e=$(date +%s.%N)
echo "tsvector + індекси: $(echo "$e - $s" | bc) с" | tee -a ../output/10_pg_load.txt
psql -At -d blog_bench -c "select 'розмір (таблиці+індекси): '||pg_size_pretty(sum(pg_total_relation_size(oid)))||', з них індекси '||pg_size_pretty(sum(pg_indexes_size(oid))) from pg_class where relkind='r' and relnamespace='public'::regnamespace" | tee -a ../output/10_pg_load.txt
N=$N ./bench/run_bench.sh | tee ../output/10_bench_pg.jsonl
rm -rf "$TMP"
