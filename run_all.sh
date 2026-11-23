#!/usr/bin/env bash
# Послідовно виконує всі mongosh-скрипти лабораторної; результати — у output/
# Вимоги: запущений mongod (mongodb://localhost:27017), mongosh у PATH, Node.js ≥ 18.
# Запуск з кореня проєкту:  ./run_all.sh        (для швидшого бенчмарка: BENCH_N=10000 ./run_all.sh)
set -euo pipefail
cd "$(dirname "$0")"; mkdir -p output
echo ">>> перевірка набору даних без БД (node tests/check_dataset.js)"
node tests/check_dataset.js > output/00_check_dataset.txt 2>&1
node --test tests/unit.js > output/00_unit_tests.txt 2>&1 || true
for s in 01_setup 02_indexes 03_seed 04_aggregations 05_explain 06_level2 07_level3 08_consistency 09_benchmark; do
  echo ">>> $s"; mongosh --quiet --file scripts/$s.js > output/$s.txt 2>&1
done
echo "готово. Далі (PostgreSQL-частина): relational/run_pg.sh, потім node relational/merge_bench.js"
