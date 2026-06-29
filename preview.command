#!/bin/bash
# Double-click this to preview StillUnemployed LOCALLY — no deploy, no Netlify credits.
# It serves this folder at http://localhost:8000 and opens the board.
# Leave the Terminal window open while you work; close it (Cmd+W) to stop the server.

cd "$(dirname "$0")"
PORT=8000

echo ""
echo "  ===  StillUnemployed local preview  ==="
echo "  Board:    http://localhost:$PORT/jobs.html"
echo "  Homepage: http://localhost:$PORT/"
echo ""
echo "  Edit files, refresh the browser to see changes. ZERO credits used."
echo "  Leave this window open. Close it (Cmd+W) to stop."
echo ""

# open the board a second after the server starts
( sleep 1; open "http://localhost:$PORT/jobs.html" ) &

if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server $PORT
elif command -v python >/dev/null 2>&1; then
  python -m SimpleHTTPServer $PORT
elif command -v npx >/dev/null 2>&1; then
  npx --yes serve -l $PORT .
else
  echo "  Couldn't find python3 or node. Install Python 3 from https://www.python.org/downloads/ and try again."
  read -n 1 -s -r -p "  Press any key to close."
fi
