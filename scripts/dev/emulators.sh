#!/usr/bin/env bash

# Skip in CI environments.
if ! [ -z "${CI}" ]; then
  exit 0
fi

# Detect availability of Docker.
if ! [ -x "$(command -v docker --version)" ]; then
  echo 'Error: docker is not installed. See https://docs.docker.com/install/.' >&2
  exit 1
fi

# Updates and restarts a daemon for the emulator. Emulators always runs as
# a background process so tests can be executed seamlessly.
function run_latest() {
  local CONTAINER_NAME="$1"
  local IMAGE_URL="$2"
  local INBOUND_PORT="$3"
  local OUTBOUND_PORT="${4:-$INBOUND_PORT}"
  local ENTRY_PARAMETERS="${5}"

  # Ensure that the latest version of the image is used.
  docker pull "${IMAGE_URL}"

  # Remove the container if it exists.
  if [ "$(docker container ls --all -f name=${CONTAINER_NAME} -q)" ]; then
    # Kill the container if it's already running.
    isEmulatorRunning="$(docker inspect -f '{{.State.Running}}' ${CONTAINER_NAME})"
    if [ "${isEmulatorRunning}" = "true" ]; then
      docker container kill "${CONTAINER_NAME}" >/dev/null
    fi

    # Remove the container.
    docker container rm "${CONTAINER_NAME}" >/dev/null
  fi

  # Start the container.
  docker container run \
    --detach \
    --name "${CONTAINER_NAME}" \
    -p ${INBOUND_PORT}:${OUTBOUND_PORT} \
    --restart always \
    "${IMAGE_URL}" ${ENTRY_PARAMETERS} >/dev/null
}

run_latest \
  "firestore-emulator" \
  "ridedott/firestore-emulator" \
  4500 \
  8080
