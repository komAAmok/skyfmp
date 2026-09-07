# Assembles the two release archives from a finished build.
#
# Usage:
#   cmake -DREPO_DIR=<repo root> -DDIST_DIR=<build/dist> -DOUT_DIR=<build/release> \
#         -DVERSION=<version string> -P cmake/scripts/make_release_archives.cmake
#
# Produces, in OUT_DIR:
#   skymp-client-<VERSION>.zip      - installable with Mod Organizer 2 / Vortex
#   skymp-server-win-<VERSION>.zip  - dedicated server for Windows

foreach(var REPO_DIR DIST_DIR OUT_DIR VERSION)
  if(NOT DEFINED ${var} OR "${${var}}" STREQUAL "")
    message(FATAL_ERROR "${var} must be set")
  endif()
endforeach()

set(STAGE_DIR "${OUT_DIR}/stage")
file(REMOVE_RECURSE "${STAGE_DIR}")
file(MAKE_DIRECTORY "${OUT_DIR}")

# Zips the *contents* of a directory, so the archive has no extra top-level
# folder. cmake -E tar is used instead of file(ARCHIVE_CREATE) because only the
# former lets us choose the directory the paths are relative to.
function(zip_directory_contents archive dir)
  file(GLOB entries RELATIVE "${dir}" "${dir}/*")
  if(NOT entries)
    message(FATAL_ERROR "Nothing to package from ${dir}")
  endif()
  message(STATUS "Packing ${entries} -> ${archive}")
  file(REMOVE "${archive}")
  execute_process(
    COMMAND ${CMAKE_COMMAND} -E tar cf "${archive}" --format=zip -- ${entries}
    WORKING_DIRECTORY "${dir}"
    RESULT_VARIABLE res
  )
  if(NOT res EQUAL 0)
    message(FATAL_ERROR "Failed to create ${archive}: ${res}")
  endif()
  message(STATUS "Wrote ${archive}")
endfunction()

# ---------------------------------------------------------------------------
# Client
#
# Mod managers expect the archive root to be the contents of the game's Data
# folder, so that SKSE/, Scripts/, Interface/ and Platform/ are recognised
# without the user having to mark a data directory by hand.
# ---------------------------------------------------------------------------

set(CLIENT_DATA_DIR "${DIST_DIR}/client/Data")
if(NOT IS_DIRECTORY "${CLIENT_DATA_DIR}")
  # The build writes both "Data" and "data" depending on the target; they are the
  # same directory on Windows, but be tolerant anyway.
  set(CLIENT_DATA_DIR "${DIST_DIR}/client/data")
endif()
if(NOT IS_DIRECTORY "${CLIENT_DATA_DIR}")
  message(FATAL_ERROR "Client data folder not found under ${DIST_DIR}/client")
endif()

set(CLIENT_STAGE "${STAGE_DIR}/client")
file(MAKE_DIRECTORY "${CLIENT_STAGE}")
file(COPY "${CLIENT_DATA_DIR}/" DESTINATION "${CLIENT_STAGE}")

# Developer sample, not useful to players
file(REMOVE_RECURSE "${CLIENT_STAGE}/Platform/plugin-example")
# Never ship whatever a local run remembered
file(REMOVE_RECURSE "${CLIENT_STAGE}/Platform/PluginsNoLoad")
file(GLOB_RECURSE pdb_files "${CLIENT_STAGE}/*.pdb")
if(pdb_files)
  file(REMOVE ${pdb_files})
endif()

if(EXISTS "${REPO_DIR}/misc/release/client/README.md")
  file(COPY "${REPO_DIR}/misc/release/client/README.md" DESTINATION "${CLIENT_STAGE}")
endif()

zip_directory_contents("${OUT_DIR}/skymp-client-${VERSION}.zip" "${CLIENT_STAGE}")

# ---------------------------------------------------------------------------
# Server
#
# The build output is a development layout: it carries a server-settings.json
# pointing at CI paths, plus whatever state a test run left behind. Ship only the
# runtime pieces and overwrite the configuration with the template meant for
# players.
# ---------------------------------------------------------------------------

set(SERVER_DIST_DIR "${DIST_DIR}/server")
if(NOT IS_DIRECTORY "${SERVER_DIST_DIR}")
  message(FATAL_ERROR "Server dist folder not found: ${SERVER_DIST_DIR}")
endif()

set(SERVER_STAGE "${STAGE_DIR}/server")
file(MAKE_DIRECTORY "${SERVER_STAGE}")

# The TypeScript bundle. The source map is a debugging aid for a ~10 MB
# download, ship only the code itself.
file(MAKE_DIRECTORY "${SERVER_STAGE}/dist_back")
file(COPY "${SERVER_DIST_DIR}/dist_back/skymp5-server.js"
  DESTINATION "${SERVER_STAGE}/dist_back")

# Single-executable entry point and the Node runtime it launches. Both are
# produced by release.yml ("Assemble the server executable package"); local
# runs of this script may not have them, in which case only start-server.bat
# will work.
set(SERVER_LAUNCHER "${SERVER_DIST_DIR}/skymp-server.exe")
if(EXISTS "${SERVER_LAUNCHER}")
  file(COPY "${SERVER_LAUNCHER}" DESTINATION "${SERVER_STAGE}")
else()
  message(WARNING "skymp-server.exe not found in ${SERVER_DIST_DIR}; the zip will contain start-server.bat only")
endif()

set(SERVER_NODE "${SERVER_DIST_DIR}/node.exe")
if(EXISTS "${SERVER_NODE}")
  file(COPY "${SERVER_NODE}" DESTINATION "${SERVER_STAGE}")
else()
  message(WARNING "node.exe not found in ${SERVER_DIST_DIR}; players would need Node.js installed")
endif()

file(GLOB server_native "${SERVER_DIST_DIR}/*.node" "${SERVER_DIST_DIR}/*.dll")
if(NOT server_native)
  message(FATAL_ERROR "No native server module found in ${SERVER_DIST_DIR}")
endif()
file(COPY ${server_native} DESTINATION "${SERVER_STAGE}")

# Papyrus scripts the server sends to clients, and localization strings, if the
# build produced them
foreach(subdir scripts strings)
  if(IS_DIRECTORY "${SERVER_DIST_DIR}/data/${subdir}")
    file(COPY "${SERVER_DIST_DIR}/data/${subdir}" DESTINATION "${SERVER_STAGE}/data")
  endif()
endforeach()

file(COPY
  "${REPO_DIR}/misc/release/server/server-settings.json"
  "${REPO_DIR}/misc/release/server/gamemode.js"
  "${REPO_DIR}/misc/release/server/start-server.bat"
  "${REPO_DIR}/misc/release/server/README.md"
  "${REPO_DIR}/misc/release/server/docker-compose.yml"
  DESTINATION "${SERVER_STAGE}"
)
file(COPY "${REPO_DIR}/misc/release/server/data/PUT-SKYRIM-ESM-FILES-HERE.txt"
  DESTINATION "${SERVER_STAGE}/data")

zip_directory_contents("${OUT_DIR}/skymp-server-win-${VERSION}.zip" "${SERVER_STAGE}")
