project(client-deps)

# Which runtime-specific dependency sets to ship.
#
# SkyrimPlatform is built with CommonLibSSE-NG in "flatrim" mode, which resolves
# game addresses through the Address Library at runtime. That makes a single
# SkyrimPlatform.dll work on both Skyrim SE (1.5.x) and AE (1.6.x) as long as
# the matching Address Library database is present next to it. SE databases are
# named "version-1-5-*.bin" and AE ones "versionlib-1-6-*.bin", so both sets can
# live in Data/SKSE/Plugins at the same time without colliding: CommonLibSSE
# picks the file matching the running executable.
#
# Historically this file selected exactly one of them based on a SKYRIM_SE
# variable that was never defined by any CMakeLists, so SE users silently ended
# up with an AE-only Address Library and SkyrimPlatform failed to initialize.
# Ship both by default instead; UNIFIED_CLIENT_DEPS=OFF restores the old
# single-runtime behaviour.
option(UNIFIED_CLIENT_DEPS "Ship SE and AE client dependencies in one build (SKSE 1.5.x + 1.6.x)" ON)

if(WIN32)
  if(UNIFIED_CLIENT_DEPS)
    set(CLIENT_DEPS_GAMES se ae)
  elseif(SKYRIM_SE)
    set(CLIENT_DEPS_GAMES se)
  else()
    set(CLIENT_DEPS_GAMES ae)
  endif()

  message(STATUS "client-deps runtime sets: ${CLIENT_DEPS_GAMES}")

  file(GLOB_RECURSE sources "${CMAKE_CURRENT_LIST_DIR}/common/*" "${CMAKE_CURRENT_LIST_DIR}/se/*" "${CMAKE_CURRENT_LIST_DIR}/ae/*")

  set(copy_commands COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_CURRENT_LIST_DIR}/common/Data" "${CMAKE_BINARY_DIR}/dist/client/data")
  foreach(game ${CLIENT_DEPS_GAMES})
    list(APPEND copy_commands COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_CURRENT_LIST_DIR}/${game}/Data" "${CMAKE_BINARY_DIR}/dist/client/data")
  endforeach()

  add_custom_target(client-deps ALL
    WORKING_DIRECTORY ${CMAKE_CURRENT_LIST_DIR}
    SOURCES ${sources}
    ${copy_commands}
  )

  add_dependencies(client-deps skyrim-platform)
else()
  add_custom_target(client-deps ALL
    COMMAND ${CMAKE_COMMAND} -E echo "Building client-deps is disabled on non-Windows setups."
  )
endif()
