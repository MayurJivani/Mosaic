#!/bin/sh
# Ship Mosaic to Jinx. The box keeps its own checkout at ~/apps/Mosaic, so the unit
# of deployment is a fast-forward of that checkout plus a rebuild. Nothing is
# copied from here, which is what makes a deploy from CI and a deploy from a
# laptop the same operation.
#
# --ff-only rather than a plain pull: if the checkout on the box has drifted,
# stop and say so rather than quietly merging something nobody wrote.
#
# The clip library lives in the mosaic-uploads volume. A rebuild does not touch
# it; `docker compose down -v` would, so this never calls that.
set -eu
ssh ssh.futile.studio '
  set -eu
  cd ~/apps/Mosaic
  git pull --ff-only
  docker compose -f docker-compose.tunnel.yml up -d --build mosaic

  # Come back and check, rather than trusting that compose meant "serving".
  sleep 5
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4322/ || true)
  case "$code" in
    2*|3*) echo "mosaic: serving on 127.0.0.1:4322 (HTTP $code)" ;;
    *) echo "mosaic: not serving (HTTP $code)"; docker compose -f docker-compose.tunnel.yml logs --tail 30 mosaic; exit 1 ;;
  esac
'
echo "mosaic: deployed to https://mosaic.futile.studio"
