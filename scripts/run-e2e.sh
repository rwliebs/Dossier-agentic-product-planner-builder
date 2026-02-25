#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Kill any existing server on port 3000
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
sleep 1

# Start the dev server in background
npm run dev &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server to be ready
for i in $(seq 1 30); do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/projects 2>/dev/null || true)
  if [ "$STATUS" = "200" ]; then
    echo "Server ready after ${i}s"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "Server failed to start"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

# Run the specified test files (or all e2e tests)
TEST_FILES="${@:-__tests__/e2e/map-structure-invariant.test.ts}"
npx vitest run --environment node --reporter=verbose $TEST_FILES
TEST_EXIT=$?

# Cleanup
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
echo "Server stopped"

exit $TEST_EXIT
