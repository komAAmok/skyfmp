project(skymp5-front)

set(FRONTEND_REPO_OWNER skyrim-multiplayer)
set(FRONTEND_REPO_NAME skymp5-front)
set(FRONTEND_REPO ${FRONTEND_REPO_OWNER}/${FRONTEND_REPO_NAME})
set(FRONTEND_BRANCH main)

set(FRONTEND_JS_DEST_DIR "${CMAKE_BINARY_DIR}/dist/client/Data/Platform/UI")

# The UI sources live in this repository, so building them locally needs no
# GitHub token and no network access. Without a UI there is no in-game menu at
# all (SkyrimPlatform loads Data/Platform/UI/index.html into its embedded
# browser), which is why this is the default.
option(BUILD_FRONT_FROM_LOCAL_SOURCES "Build skymp5-front from the sources in this repo instead of cloning the upstream repo" ON)

if(BUILD_FRONT AND BUILD_FRONT_FROM_LOCAL_SOURCES)
  include(${CMAKE_SOURCE_DIR}/cmake/yarn.cmake)

  file(GLOB_RECURSE sources ${CMAKE_CURRENT_LIST_DIR}/src/*)
  list(APPEND sources ${CMAKE_CURRENT_LIST_DIR}/webpack.config.ts)
  list(APPEND sources ${CMAKE_CURRENT_LIST_DIR}/public/index.html)

  # webpack.config.ts reads the output directory from config.js (gitignored)
  file(WRITE "${CMAKE_CURRENT_LIST_DIR}/config.js"
    "module.exports = {\n  outputPath:\n    '${FRONTEND_JS_DEST_DIR}',\n};\n")

  yarn_execute_command(
    WORKING_DIRECTORY ${CMAKE_CURRENT_LIST_DIR}
    COMMAND install
  )

  set(out ${FRONTEND_JS_DEST_DIR}/index.html)
  add_custom_command(
    OUTPUT ${out}
    COMMAND yarn --cwd "\"${CMAKE_CURRENT_LIST_DIR}\"" build
    DEPENDS ${sources}
    COMMENT "Building skymp5-front from local sources..."
  )
  add_custom_target(skymp5-front ALL
    DEPENDS ${out}
    SOURCES ${sources}
  )
elseif(BUILD_FRONT)
  if(NOT SKYMP5_FRONT_REPO_PAT)
    message(FATAL_ERROR "SKYMP5_FRONT_REPO_PAT is not set. Please set it to your GitHub personal access token, or leave BUILD_FRONT_FROM_LOCAL_SOURCES ON.")
  endif()

  set(FRONTEND_ZIP_URL "https://github.com/${FRONTEND_REPO}/archive/refs/heads/${FRONTEND_BRANCH}.zip")
  set(FRONTEND_ZIP_DEST "${CMAKE_BINARY_DIR}/frontend.zip")
  set(FRONTEND_ZIP_EXTRACT_DIR "${CMAKE_BINARY_DIR}/frontend-zip")

  set(DEPLOY_BRANCH "$ENV{DEPLOY_BRANCH}")
  set(AUTO_MERGE_REPO "Pospelove/auto-merge-action")
  set(AUTO_MERGE_BRANCH "main")
  set(AUTO_MERGE_REPO_URL "https://github.com/${AUTO_MERGE_REPO}.git")
  set(FRONTEND_REPO_URL "https://${SKYMP5_FRONT_REPO_PAT}:x-oauth-basic@github.com/${FRONTEND_REPO_OWNER}/${FRONTEND_REPO_NAME}.git")

  if("$ENV{DEPLOY_BRANCH}" STREQUAL "")
    set(ENV_INPUT_REPOSITORIES "[{\"owner\": \"skyrim-multiplayer\", \"repo\": \"skymp5-front\", \"labels\": [], \"token\": \"${SKYMP5_FRONT_REPO_PAT}\"}]")
  else()
    set(ENV_INPUT_REPOSITORIES "[{\"owner\": \"skyrim-multiplayer\", \"repo\": \"skymp5-front\", \"labels\": [\"merge-to:${DEPLOY_BRANCH}\"], \"token\": \"${SKYMP5_FRONT_REPO_PAT}\"}]")
  endif()

  # Pass variables to the download script with PRS.
  set(SCRIPT_PATH "${CMAKE_CURRENT_LIST_DIR}/download-and-build-with-prs.cmake")
  configure_file(${SCRIPT_PATH} ${CMAKE_BINARY_DIR}/download-and-build-with-prs.cmake ESCAPE_QUOTES)

  set(source download-and-build-with-prs.cmake)

  add_custom_target(skymp5-front ALL
    SOURCES ${source}
    COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_BINARY_DIR}/dist/client
    COMMAND ${CMAKE_COMMAND} -E remove_directory ${CMAKE_CURRENT_BINARY_DIR}/${FRONTEND_REPO_NAME}-${FRONTEND_BRANCH}
    COMMAND ${CMAKE_COMMAND} -E env DOWNLOAD_NO_PROGRESS=1
            ${CMAKE_COMMAND} -P ${CMAKE_BINARY_DIR}/${source}
    COMMENT "Downloading & building frontend repo..."
  )
else()
  add_custom_target(skymp5-front ALL
    COMMAND ${CMAKE_COMMAND} -E echo "Building skymp5-front is disabled. To enable it, set BUILD_FRONT to ON."
  )
endif()
